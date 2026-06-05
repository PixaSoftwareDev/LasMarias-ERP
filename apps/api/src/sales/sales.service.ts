import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type {
  CreateReturnInput,
  CreateSalesOrderInput,
  CreditNote,
  SalesOrder,
  SalesOrderLine,
} from '@lasmarias/shared-schemas';
import { SalesOrderEntity } from './sales-order.entity';
import { AccountMovementEntity } from './account-movement.entity';
import { CreditNoteEntity } from './credit-note.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ClientEntity } from '../clients/client.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { ClientsService } from '../clients/clients.service';
import { ProductsService } from '../products/products.service';

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

    return this.dataSource.transaction(async (manager) => {
      const lines: SalesOrderLine[] = [];
      let total = 0;
      for (const l of input.lines) {
        const product = await this.products.get(l.productId);
        const subtotal = Math.round(l.unitPrice * l.quantity * 100) / 100;
        total += subtotal;
        lines.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unit: product.unit,
          subtotal,
        });
      }
      total = Math.round(total * 100) / 100;

      const dispatchedAt = new Date();
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
        await this.restockToOriginBatches(manager, orderId, reqLine.productId, reqLine.quantity, userId, order.code);

        const subtotal = Math.round(orderLine.unitPrice * reqLine.quantity * 100) / 100;
        total += subtotal;
        ncLines.push({
          productId: orderLine.productId,
          productName: orderLine.productName,
          sku: orderLine.sku,
          quantity: reqLine.quantity,
          unitPrice: orderLine.unitPrice,
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
          occurredAt: new Date(),
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
  ): Promise<void> {
    const saleMovements = await manager.getRepository(InventoryMovementEntity).find({
      where: { referenceType: 'sales_order', referenceId: orderId, productId, reason: 'sale' },
      order: { createdAt: 'ASC' },
    });
    if (saleMovements.length === 0) {
      throw new BadRequestException(`No se encontró el movimiento de salida para el despacho ${orderCode}`);
    }
    let pending = quantity;
    for (const mv of saleMovements) {
      if (pending <= 1e-9) break;
      const restore = Math.min(Number(mv.quantity), pending);
      pending -= restore;
      const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: mv.batchId } });
      if (!batch) continue;
      batch.remainingQuantity = String(Number(batch.remainingQuantity) + restore);
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
      for (const alloc of plan.allocations) {
        const batch = byId.get(alloc.batchId)!;
        batch.remainingQuantity = String(alloc.remainingAfter);
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
            referenceType: 'sales_order',
            referenceId: order.id,
            notes: `Despacho ${order.code}`,
            createdById: order.createdById,
          }),
        );
      }
    }
  }

  // Secuencia global de despachos con advisory lock (Postgres rechaza FOR UPDATE con agregados).
  private async nextOrderCode(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(2000000001)');
    const count = await manager.getRepository(SalesOrderEntity).count();
    return `DSP-${String(count + 1).padStart(6, '0')}`;
  }

  // Secuencia global de notas de crédito (advisory lock propio).
  private async nextCreditNoteCode(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(2000000002)');
    const count = await manager.getRepository(CreditNoteEntity).count();
    return `NC-${String(count + 1).padStart(6, '0')}`;
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
      createdById: o.createdById,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
