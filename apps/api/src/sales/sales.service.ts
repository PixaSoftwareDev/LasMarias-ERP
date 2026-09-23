import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type {
  CreateReturnInput,
  CreateSalesOrderInput,
  CreditNote,
  SalesOrder,
  SalesOrderLine,
  UpdateSalesOrderDateInput,
} from '@lasmarias/shared-schemas';
import { SalesOrderEntity } from './sales-order.entity';
import { AccountMovementEntity } from './account-movement.entity';
import { CreditNoteEntity } from './credit-note.entity';
import { BatchEntity } from '../batches/batch.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { ClientsService } from '../clients/clients.service';
import { ProductsService } from '../products/products.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { allocateBultos, bultosForQuantity } from '../inventory/bultos-allocation';
import { lockBatches, lockBatchesOfProduct, lockDuplicateSignature, lockRow } from '../common/locks';
import type { Currency } from '@lasmarias/shared-schemas';

// Un despacho o una devolución no pueden tener fecha futura (casi seguro un error de tipeo en el año o el mes).
// Margen de un día para no pelear con husos horarios: el front manda el mediodía local.
function assertNotFuture(fecha: Date, de = 'del despacho'): void {
  if (Number.isNaN(fecha.getTime())) throw new BadRequestException(`La fecha ${de} no es válida.`);
  if (fecha.getTime() > Date.now() + 24 * 60 * 60 * 1000)
    throw new BadRequestException(`La fecha ${de} no puede ser futura. Revisá el día, el mes y el año.`);
}

// Asignación FEFO pura: dada la cantidad pedida y los lotes (ya ordenados por
// vencimiento más próximo primero), devuelve cuánto tomar de cada lote y el faltante.
// Sin efectos: se testea sin tocar la base (CLAUDE.md §8 — lógica de dominio testeable).
export interface FefoBatchInput {
  id: string;
  remaining: number;
}
export interface FefoAllocation {
  batchId: string;
  take: number;
  remainingAfter: number;
}
export interface FefoPlan {
  allocations: FefoAllocation[];
  shortage: number; // cantidad que no se pudo cubrir (0 si alcanzó)
}

export function planFefoAllocation(quantity: number, batches: FefoBatchInput[]): FefoPlan {
  let pending = quantity;
  const allocations: FefoAllocation[] = [];
  for (const batch of batches) {
    if (pending <= 0) break;
    const available = batch.remaining;
    if (available <= 0) continue;
    const take = Math.min(available, pending);
    allocations.push({ batchId: batch.id, take, remainingAfter: available - take });
    pending -= take;
  }
  return { allocations, shortage: Math.max(0, pending) };
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    private readonly clients: ClientsService,
    private readonly products: ProductsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly dataSource: DataSource,
  ) {}

  async listOrders(): Promise<SalesOrder[]> {
    const rows = await this.orders.find({
      relations: { client: true },
      order: { dispatchedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.orderToDto(r));
  }

  async getOrder(id: string): Promise<SalesOrder> {
    const o = await this.orders.findOne({ where: { id }, relations: { client: true } });
    if (!o) throw new NotFoundException(`Despacho ${id} no encontrado`);
    return this.orderToDto(o);
  }

  // Despacho directo: el precio se carga a mano por línea (sugerido por lista según
  // tipo de cliente desde el front), el importe es automático y el stock baja en el
  // momento (FEFO). Además genera el cargo en cuenta corriente; si es contado, también
  // registra el cobro → saldo 0.
  async createOrder(input: CreateSalesOrderInput, userId: string): Promise<SalesOrder> {
    const client = await this.clients.get(input.clientId);
    // Fecha real del despacho: la que eligieron (carga atrasada) o ahora.
    const dispatchedAt = input.dispatchedAt ? new Date(input.dispatchedAt) : new Date();
    assertNotFuture(dispatchedAt);

    // Moneda en que se cotizaron los precios + cotización del día (solo registro de
    // referencia; los importes de las líneas YA llegan convertidos a pesos del front).
    const orderCurrency = (input.currency as Currency) ?? 'ARS';
    const exchangeRate = (await this.exchangeRates.rateToArs(orderCurrency, new Date())).toString();

    return this.dataSource.transaction(async (manager) => {
      // Serializa los despachos IDÉNTICOS entre sí: sin esto, dos envíos simultáneos no se
      // ven entre ellos y la guarda anti-duplicado de más abajo deja pasar los dos.
      const firma = `venta:${input.clientId}:${input.lines
        .map((l) => `${l.productId}:${l.quantity}:${l.unitPrice}`)
        .sort()
        .join('|')}`;
      await lockDuplicateSignature(manager, firma);

      const lines: SalesOrderLine[] = [];
      let total = 0;
      for (const l of input.lines) {
        const product = await this.products.get(l.productId);
        // El precio se cotiza por kg/unidad o POR BULTO. El importe siempre termina en
        // pesos; el basis queda congelado en la línea para que el remito y la nota de
        // crédito muestren exactamente cómo se cobró (mismo criterio que la cotización).
        const priceBasis = l.priceBasis ?? 'unidad';
        if (priceBasis === 'bulto' && !(l.bultos && l.bultos > 0)) {
          throw new BadRequestException(
            `Cargaste el precio por bulto de ${product.name}, pero no pusiste cuántos bultos salen.`,
          );
        }
        const cantidadCobrada = priceBasis === 'bulto' ? (l.bultos as number) : l.quantity;
        const subtotal = Math.round(l.unitPrice * cantidadCobrada * 100) / 100;
        total += subtotal;
        lines.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: l.quantity,
          bultos: l.bultos,
          unitPrice: l.unitPrice,
          priceBasis,
          unit: product.unit,
          subtotal,
        });
      }
      total = Math.round(total * 100) / 100;

      // Aviso de posible doble-click: mismo cliente, mismo importe y mismas líneas, hace pocos
      // minutos. No bloquea de una (podría ser otra venta real): frena y pide confirmar; el
      // front reenvía con confirmDuplicate=true al confirmar.
      if (!input.confirmDuplicate) {
        // Por fecha de CARGA, no de despacho: con la fecha atrasada, un doble-click de hoy
        // sobre un remito del día 3 tiene que seguir detectándose.
        const since = new Date(Date.now() - 10 * 60 * 1000);
        const recent = await manager.getRepository(SalesOrderEntity).find({
          where: { clientId: client.id, createdAt: MoreThanOrEqual(since) },
        });
        const sig = (ls: { productId: string; quantity: number }[]) =>
          ls.map((l) => `${l.productId}:${l.quantity}`).sort().join('|');
        const mySig = sig(lines);
        const dup = recent.find((o) => Number(o.total) === total && sig(o.lines as any) === mySig);
        if (dup)
          throw new ConflictException(
            `Recién cargaste un despacho igual a ${client.businessName} por $${total} (${dup.code}). Si es otra venta real, confirmá para cargarlo igual.`,
          );
      }

      // Forma de pago efectiva: la elegida, o la del cliente (sin plazo = contado).
      const isContado =
        input.paymentMode === 'contado' ||
        (input.paymentMode === undefined && client.paymentTermDays == null);
      const paymentMode = isContado ? 'contado' : 'cuenta_corriente';
      const code = await this.nextOrderCode(manager);
      const entity = manager.getRepository(SalesOrderEntity).create({
        code,
        clientId: client.id,
        dispatchedAt,
        lines,
        total: String(total),
        notes: input.notes ?? null,
        documentType: 'remito',
        paymentMode,
        currency: orderCurrency,
        exchangeRate,
        createdById: userId,
      });
      const saved = await manager.getRepository(SalesOrderEntity).save(entity);

      // Principio no negociable #4: el stock baja con el despacho, nunca a mano.
      await this.dischargeStock(manager, saved);

      // Cuenta corriente: cargo por el total del despacho.
      const dueDate =
        client.paymentTermDays != null
          ? new Date(dispatchedAt.getTime() + client.paymentTermDays * 24 * 60 * 60 * 1000)
          : dispatchedAt;
      await manager.getRepository(AccountMovementEntity).save(
        manager.getRepository(AccountMovementEntity).create({
          clientId: client.id,
          kind: 'charge',
          amount: String(total),
          referenceType: 'sales_order',
          referenceId: saved.id,
          occurredAt: dispatchedAt,
          dueDate,
          notes: `Despacho ${saved.code}`,
          createdById: userId,
        }),
      );
      // Contado: registramos el cobro de inmediato (saldo 0). No genera ingreso de caja
      // aparte para no duplicar (el cobro al contado es parte del despacho).
      if (isContado && total > 0) {
        await manager.getRepository(AccountMovementEntity).save(
          manager.getRepository(AccountMovementEntity).create({
            clientId: client.id,
            kind: 'payment',
            amount: String(total),
            referenceType: 'sales_order',
            referenceId: saved.id,
            occurredAt: dispatchedAt,
            dueDate: null,
            notes: `Cobro contado ${saved.code}`,
            createdById: userId,
          }),
        );
      }

      const reloaded = await manager
        .getRepository(SalesOrderEntity)
        .findOne({ where: { id: saved.id }, relations: { client: true } });
      return this.orderToDto(reloaded!);
    });
  }

  // Devolución de un despacho → nota de crédito. Valida que no exceda lo despachado,
  // repone stock al mismo lote del que salió, crea credit_note (NC-NNNNNN) con precio
  // histórico y baja el saldo de cuenta corriente. Todo transaccional.
  async createReturn(
    orderId: string,
    input: CreateReturnInput,
    userId: string,
  ): Promise<CreditNote> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Despacho ${orderId} no encontrado`);
    // Fecha real de la devolución: no futura y no antes de la venta (margen de un día por
    // husos horarios: el front manda el mediodía local).
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    assertNotFuture(occurredAt, 'de la devolución');
    if (occurredAt.getTime() < order.dispatchedAt.getTime() - 24 * 60 * 60 * 1000)
      throw new BadRequestException(
        `La devolución no puede ser anterior a la venta ${order.code} (${order.dispatchedAt.toLocaleDateString('es-AR')}).`,
      );

    return this.dataSource.transaction(async (manager) => {
      // Lo ya devuelto previamente por este despacho (para no exceder).
      const priorNotes = await manager
        .getRepository(CreditNoteEntity)
        .find({ where: { salesOrderId: orderId } });
      const returnedByProduct = new Map<string, number>();
      for (const cn of priorNotes) {
        for (const l of cn.lines) {
          returnedByProduct.set(
            l.productId,
            (returnedByProduct.get(l.productId) ?? 0) + l.quantity,
          );
        }
      }

      const ncLines: SalesOrderLine[] = [];
      let total = 0;
      for (const reqLine of input.lines) {
        const orderLine = order.lines.find((l) => l.productId === reqLine.productId);
        if (!orderLine) {
          throw new BadRequestException(
            `El producto no figura en el despacho ${order.code}`,
          );
        }
        const alreadyReturned = returnedByProduct.get(reqLine.productId) ?? 0;
        const remaining = orderLine.quantity - alreadyReturned;
        if (reqLine.quantity > remaining + 1e-9) {
          throw new BadRequestException(
            `No se puede devolver ${reqLine.quantity} ${orderLine.unit} de ${orderLine.productName}: ` +
              `el despacho ${order.code} tiene ${remaining} ${orderLine.unit} pendientes de devolver`,
          );
        }
        // Reponer al mismo lote del que salió (movimientos sale de este despacho).
        await this.restockToOriginBatches(
          manager,
          orderId,
          reqLine.productId,
          reqLine.quantity,
          userId,
          order.code,
          reqLine.bultos ?? null,
        );

        // La NC respeta cómo se cobró el despacho original: si fue por bulto, se acredita
        // por bulto. Si el basis era 'bulto' y no dicen cuántos vuelven, se prorratea.
        const basis = orderLine.priceBasis ?? 'unidad';
        const bultosDevueltos =
          reqLine.bultos ??
          (basis === 'bulto' && orderLine.bultos
            ? Math.round((reqLine.quantity / orderLine.quantity) * orderLine.bultos)
            : undefined);
        const cantidadAcreditada = basis === 'bulto' ? (bultosDevueltos ?? 0) : reqLine.quantity;
        const subtotal = Math.round(orderLine.unitPrice * cantidadAcreditada * 100) / 100;
        total += subtotal;
        ncLines.push({
          productId: orderLine.productId,
          productName: orderLine.productName,
          sku: orderLine.sku,
          quantity: reqLine.quantity,
          bultos: bultosDevueltos,
          unitPrice: orderLine.unitPrice,
          priceBasis: basis,
          unit: orderLine.unit,
          subtotal,
        });
      }
      total = Math.round(total * 100) / 100;

      const code = await this.nextCreditNoteCode(manager);
      const note = await manager.getRepository(CreditNoteEntity).save(
        manager.getRepository(CreditNoteEntity).create({
          code,
          salesOrderId: order.id,
          clientId: order.clientId,
          lines: ncLines,
          total: String(total),
          createdById: userId,
        }),
      );

      // Baja de saldo de cuenta corriente por la nota de crédito.
      await manager.getRepository(AccountMovementEntity).save(
        manager.getRepository(AccountMovementEntity).create({
          clientId: order.clientId,
          kind: 'credit_note',
          amount: String(total),
          referenceType: 'credit_note',
          referenceId: note.id,
          occurredAt,
          dueDate: null,
          notes: `Nota de crédito ${code} (devolución de ${order.code})`,
          createdById: userId,
        }),
      );

      return this.creditNoteToDto(note);
    });
  }

  // Repone una cantidad devuelta a los lotes desde los que se despachó (movimientos
  // sale de este despacho para este producto), en orden de salida, con movimiento 'in'
  // reason='return'. Si el lote estaba agotado vuelve a 'activo'.
  private async restockToOriginBatches(
    manager: EntityManager,
    orderId: string,
    productId: string,
    quantity: number,
    userId: string,
    orderCode: string,
    // Bultos que vuelven. Si no se dicen, se reponen a prorrata de los kg devueltos.
    bultos: number | null = null,
  ): Promise<void> {
    const saleMovements = await manager.getRepository(InventoryMovementEntity).find({
      where: { referenceType: 'sales_order', referenceId: orderId, productId, reason: 'sale' },
      order: { createdAt: 'ASC' },
    });
    if (saleMovements.length === 0) {
      throw new BadRequestException(`No se encontró el movimiento de salida para el despacho ${orderCode}`);
    }
    // CANDADO sobre los lotes a los que se les va a devolver mercadería.
    await lockBatches(manager, saleMovements.map((m) => m.batchId));
    // Reparto de los bultos devueltos sobre los mismos lotes de los que salieron, sin
    // devolver a un lote más bultos de los que ese lote entregó.
    const reparto =
      bultos != null
        ? allocateBultos(
            bultos,
            // Tope por lote: no se devuelve a un lote más bultos de los que ese lote entregó.
            saleMovements.map((mv) => ({ quantity: Number(mv.quantity), available: mv.bultos ?? 0 })),
          ).bultos
        : null;
    let pending = quantity;
    for (const [idx, mv] of saleMovements.entries()) {
      if (pending <= 1e-9) break;
      const restore = Math.min(Number(mv.quantity), pending);
      pending -= restore;
      const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: mv.batchId } });
      if (!batch) continue;
      const bultosVuelven = reparto
        ? (reparto[idx] ?? 0)
        : bultosForQuantity(restore, Number(mv.quantity), mv.bultos);
      batch.remainingQuantity = String(Number(batch.remainingQuantity) + restore);
      if (bultosVuelven != null && bultosVuelven > 0)
        batch.remainingBultos = (batch.remainingBultos ?? 0) + bultosVuelven;
      if (batch.status === 'agotado') batch.status = 'activo';
      await manager.getRepository(BatchEntity).save(batch);
      await manager.getRepository(InventoryMovementEntity).save(
        manager.getRepository(InventoryMovementEntity).create({
          batchId: batch.id,
          productId,
          type: 'in',
          reason: 'return',
          quantity: String(restore),
          unit: batch.unit,
          bultos: bultosVuelven,
          referenceType: 'sales_order',
          referenceId: orderId,
          notes: `Devolución ${orderCode}`,
          createdById: userId,
        }),
      );
    }
    if (pending > 1e-9) {
      // No debería ocurrir si la validación contra lo despachado es correcta.
      throw new BadRequestException('La cantidad a devolver excede lo despachado');
    }
  }

  // Descuenta del stock las cantidades del despacho usando FEFO (vencimiento más
  // próximo primero) y registra un movimiento de salida por cada lote afectado.
  private async dischargeStock(manager: EntityManager, order: SalesOrderEntity): Promise<void> {
    for (const line of order.lines) {
      // CANDADO sobre los lotes candidatos antes de mirar saldos: dos despachos del mismo
      // producto a la vez no pueden llevarse el mismo lote (sobreventa / stock negativo).
      await lockBatchesOfProduct(manager, line.productId);
      const batches = await manager.getRepository(BatchEntity).find({
        where: { productId: line.productId, status: 'activo' },
        order: { expirationDate: 'ASC' }, // FEFO
      });
      const plan = planFefoAllocation(
        line.quantity,
        batches.map((b) => ({ id: b.id, remaining: Number(b.remainingQuantity) })),
      );
      if (plan.shortage > 0) {
        throw new BadRequestException(
          `No hay stock suficiente de ${line.productName} para despachar: faltan ${plan.shortage} ${line.unit}`,
        );
      }
      const byId = new Map(batches.map((b) => [b.id, b]));

      // Bultos: si el vendedor los cargó, se reparte ese número entre los lotes que tocó
      // el FEFO (enteros, suma exacta). Si no los cargó, cada lote baja los suyos a
      // prorrata para que el saldo no quede viejo. Los lotes sin bultos no se enteran.
      // `available: 0` (no null) en los lotes que no llevan bultos: así no se les
      // atribuyen bultos que nunca tuvieron, y el reparto cae en los que sí los tienen.
      const shares = plan.allocations.map((a) => ({
        quantity: a.take,
        available: byId.get(a.batchId)?.remainingBultos ?? 0,
      }));
      const reparto = line.bultos != null ? allocateBultos(line.bultos, shares).bultos : null;

      for (const [idx, alloc] of plan.allocations.entries()) {
        const batch = byId.get(alloc.batchId)!;
        // Un lote sin bultos contados sigue sin ellos: no se le anota ni se le descuenta nada.
        const bultosSalen =
          batch.remainingBultos == null
            ? null
            : reparto
              ? (reparto[idx] ?? 0)
              : bultosForQuantity(alloc.take, Number(batch.remainingQuantity), batch.remainingBultos);
        batch.remainingQuantity = String(alloc.remainingAfter);
        if (batch.remainingBultos != null && bultosSalen != null)
          batch.remainingBultos = Math.max(0, batch.remainingBultos - bultosSalen);
        if (alloc.remainingAfter === 0) batch.status = 'agotado';
        await manager.getRepository(BatchEntity).save(batch);
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: batch.id,
            productId: batch.productId,
            type: 'out',
            reason: 'sale',
            quantity: String(alloc.take),
            unit: batch.unit,
            bultos: bultosSalen,
            referenceType: 'sales_order',
            referenceId: order.id,
            notes: `Despacho ${order.code}`,
            createdById: order.createdById,
          }),
        );
      }
    }
  }

  // Borrar un despacho con reversa total (mismo criterio que producción y recepciones):
  // el stock vuelve a los lotes exactos de los que salió, se elimina el cargo en cuenta
  // corriente (y el cobro espejo si fue contado) y desaparece el remito. Solo se frena
  // si el despacho ya tiene devoluciones: ahí el stock ya se repuso en parte y borrar
  // encima duplicaría la reposición.
  // Corrige la fecha de un despacho cargado con la fecha equivocada (típico: se pasaron los
  // remitos de varios días juntos y quedaron todos con la fecha de carga). Mueve con ella el
  // cargo de cuenta corriente (manteniendo el plazo del cliente) y el cobro al contado, que
  // nacen con la misma fecha del despacho. Los cobros posteriores y el stock no se tocan.
  async updateOrderDate(id: string, input: UpdateSalesOrderDateInput): Promise<SalesOrder> {
    const nuevaFecha = new Date(input.dispatchedAt);
    assertNotFuture(nuevaFecha);
    return this.dataSource.transaction(async (manager) => {
      await lockRow(manager, 'sales_orders', id);
      const orderRepo = manager.getRepository(SalesOrderEntity);
      const order = await orderRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException(`Despacho ${id} no encontrado`);
      const fechaVieja = order.dispatchedAt.getTime();

      const accRepo = manager.getRepository(AccountMovementEntity);
      const movs = await accRepo.find({ where: { referenceType: 'sales_order', referenceId: id } });
      for (const m of movs) {
        // Solo lo que nació junto con el despacho (misma fecha exacta): el cargo y, si fue
        // contado, su cobro. Un cobro hecho otro día conserva su fecha.
        if (m.occurredAt.getTime() !== fechaVieja) continue;
        if (m.kind === 'charge' && m.dueDate)
          m.dueDate = new Date(nuevaFecha.getTime() + (m.dueDate.getTime() - fechaVieja));
        m.occurredAt = nuevaFecha;
        await accRepo.save(m);
      }

      order.dispatchedAt = nuevaFecha;
      await orderRepo.save(order);
      const reloaded = await orderRepo.findOne({ where: { id }, relations: { client: true } });
      return this.orderToDto(reloaded!);
    });
  }

  async removeOrder(id: string): Promise<{ deleted: true; code: string }> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(SalesOrderEntity);
      const round3 = (n: number) => Math.round(n * 1000) / 1000;

      // CANDADO sobre el despacho: dos borrados simultáneos devolverían el stock dos veces.
      await lockRow(manager, 'sales_orders', id);
      const order = await orderRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException(`Despacho ${id} no encontrado`);

      const creditNotes = await manager.getRepository(CreditNoteEntity).count({ where: { salesOrderId: id } });
      if (creditNotes > 0) {
        throw new BadRequestException(
          `No se puede borrar el despacho ${order.code}: tiene devoluciones con nota de crédito. Ese despacho ya quedó compensado por la devolución.`,
        );
      }

      // Reversa de stock: devolver a cada lote exactamente lo que salió por este despacho.
      const movements = await manager.getRepository(InventoryMovementEntity).find({
        where: { referenceType: 'sales_order', referenceId: id },
      });
      await lockBatches(manager, movements.map((m) => m.batchId));
      for (const m of movements) {
        if (m.type !== 'out') continue;
        const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: m.batchId } });
        if (!batch) continue;
        batch.remainingQuantity = String(round3(Number(batch.remainingQuantity) + Number(m.quantity)));
        // Los bultos vuelven exactamente como salieron (los guarda el movimiento).
        if (m.bultos != null) batch.remainingBultos = (batch.remainingBultos ?? 0) + m.bultos;
        if (batch.status === 'agotado' && Number(batch.remainingQuantity) > 0) batch.status = 'activo';
        await manager.getRepository(BatchEntity).save(batch);
      }
      if (movements.length > 0) await manager.getRepository(InventoryMovementEntity).remove(movements);

      // Cuenta corriente: se borra el cargo del despacho (y el cobro espejo del contado).
      // El saldo del cliente se recalcula solo a partir de los asientos restantes.
      const accountMovements = await manager.getRepository(AccountMovementEntity).find({
        where: { referenceType: 'sales_order', referenceId: id },
      });
      if (accountMovements.length > 0) await manager.getRepository(AccountMovementEntity).remove(accountMovements);

      await orderRepo.remove(order);
      return { deleted: true as const, code: order.code };
    });
  }

  // Secuencia global de despachos con advisory lock (Postgres rechaza FOR UPDATE con agregados).
  // MAX(code)+1 en vez de count(): si se borró un despacho intermedio, count() repetiría
  // un código ya usado (índice único). El padding fijo hace que el MAX de texto funcione.
  private async nextOrderCode(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(2000000001)');
    const row = await manager
      .getRepository(SalesOrderEntity)
      .createQueryBuilder('o')
      .select('MAX(o.code)', 'max')
      .where("o.code LIKE 'DSP-%'")
      .getRawOne<{ max: string | null }>();
    const last = row?.max ? Number(row.max.slice('DSP-'.length)) : 0;
    return `DSP-${String(last + 1).padStart(6, '0')}`;
  }

  // Secuencia global de notas de crédito (advisory lock propio).
  private async nextCreditNoteCode(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(2000000002)');
    const row = await manager
      .getRepository(CreditNoteEntity)
      .createQueryBuilder('n')
      .select('MAX(n.code)', 'max')
      .where("n.code LIKE 'NC-%'")
      .getRawOne<{ max: string | null }>();
    const last = row?.max ? Number(row.max.slice('NC-'.length)) : 0;
    return `NC-${String(last + 1).padStart(6, '0')}`;
  }

  private creditNoteToDto(e: CreditNoteEntity): CreditNote {
    return {
      id: e.id,
      code: e.code,
      salesOrderId: e.salesOrderId,
      clientId: e.clientId,
      lines: e.lines,
      total: Number(e.total),
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
    };
  }

  orderToDto(o: SalesOrderEntity): SalesOrder {
    return {
      id: o.id,
      code: o.code,
      clientId: o.clientId,
      clientName: o.client?.businessName ?? '',
      dispatchedAt: o.dispatchedAt.toISOString(),
      lines: o.lines,
      total: Number(o.total),
      notes: o.notes ?? undefined,
      documentType: 'remito',
      paymentMode: o.paymentMode === 'contado' || o.paymentMode === 'cuenta_corriente' ? o.paymentMode : undefined,
      currency: (o.currency as Currency) ?? 'ARS',
      exchangeRate: o.exchangeRate != null ? Number(o.exchangeRate) : undefined,
      createdById: o.createdById,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
