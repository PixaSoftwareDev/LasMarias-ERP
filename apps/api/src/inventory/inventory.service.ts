import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Big from 'big.js';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  StockEntryInput,
  DiscardStockInput,
  CountAdjustInput,
  MovementReason,
  FefoSuggestion,
  InventoryMovement,
  StockCountInput,
  StockSummary,
  ProductBatch,
  UpdateBatchInput,
  TraceBackward,
  TraceBatch,
  TraceDispatch,
  TraceForward,
  TraceProducer,
  Warehouse,
  SilosOverview,
  MilkBatchDto,
} from '@lasmarias/shared-schemas';
import { WarehouseEntity } from './warehouse.entity';
import { InventoryMovementEntity } from './inventory-movement.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import type { Currency } from '@lasmarias/shared-schemas';
import { resolveAlertLevel } from './stock-alert';
import { allocateBultos, bultosForQuantity } from './bultos-allocation';
import { lockBatches, lockBatchesOfProduct, lockDuplicateSignature } from '../common/locks';
import { siloFillPercent } from './silo.helpers';
import { sortOldestFirst } from './oldest-first';
import { resolveInputCost, type InputCostSource } from '../production/input-cost';
import {
  buildBackwardTrace,
  buildFefoSuggestion,
  buildForwardTrace,
  type BatchOutEdges,
  type TraceGraphReader,
} from './trace-graph';

// Lote consumible para producción — shape esperada por el frontend.
export interface ConsumableBatchDto {
  id: string;
  code: string;
  productId: string;
  productName: string;
  category: string;
  remainingQuantity: number;
  unit: string;
  unitCost: number | null;
  expirationDate?: string;
  // A qué costo entraría HOY como origen de una orden (misma regla que el cierre): la
  // pantalla avisa si un lote cargado a mano entra con la ficha, el último lote o a $0.
  entryCost: { unitCost: number; source: InputCostSource; fromLotCode?: string };
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    @InjectRepository(InventoryMovementEntity)
    private readonly movements: Repository<InventoryMovementEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>,
    @InjectRepository(ProductionOrderEntity)
    private readonly productionOrders: Repository<ProductionOrderEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly salesOrders: Repository<SalesOrderEntity>,
    @InjectRepository(MilkReceptionEntity)
    private readonly receptions: Repository<MilkReceptionEntity>,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly dataSource: DataSource,
  ) {}

  // --- Warehouses
  // Por defecto solo cámaras activas (para selectores). La pantalla de gestión pide
  // todas (includeInactive) para poder reactivar las desactivadas.
  async listWarehouses(includeInactive = false): Promise<Warehouse[]> {
    const rows = await this.warehouses.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
    return rows.map((w) => this.warehouseToDto(w));
  }

  async createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
    const w = this.warehouses.create({
      code: input.code,
      name: input.name,
      kind: input.kind,
      targetTemperatureCelsius:
        input.targetTemperatureCelsius != null ? String(input.targetTemperatureCelsius) : null,
      capacityLiters: input.capacityLiters != null ? String(input.capacityLiters) : null,
      isActive: true,
    });
    return this.warehouseToDto(await this.warehouses.save(w));
  }

  async updateWarehouse(id: string, input: UpdateWarehouseInput): Promise<Warehouse> {
    const w = await this.warehouses.findOne({ where: { id } });
    if (!w) throw new NotFoundException(`Cámara ${id} no encontrada`);
    if (input.code !== undefined) w.code = input.code;
    if (input.name !== undefined) w.name = input.name;
    if (input.kind !== undefined) w.kind = input.kind;
    if (input.targetTemperatureCelsius !== undefined) {
      w.targetTemperatureCelsius =
        input.targetTemperatureCelsius != null ? String(input.targetTemperatureCelsius) : null;
    }
    if (input.capacityLiters !== undefined) {
      w.capacityLiters = input.capacityLiters != null ? String(input.capacityLiters) : null;
    }
    if (typeof input.isActive === 'boolean') w.isActive = input.isActive;
    return this.warehouseToDto(await this.warehouses.save(w));
  }

  // --- Stock summary
  // Devuelve el stock agregado por producto. CLAUDE.md §4.4 — FEFO ordena por vencimiento.
  async stockSummary(): Promise<StockSummary[]> {
    const rows = await this.batches
      .createQueryBuilder('b')
      .leftJoin('b.product', 'p')
      .leftJoin('b.warehouse', 'w')
      .select('b.product_id', 'productId')
      .addSelect('p.name', 'productName')
      .addSelect('p.sku', 'sku')
      .addSelect('p.unit', 'unit')
      .addSelect('p.category', 'category')
      .addSelect('p.min_stock_level', 'minStockLevel')
      .addSelect('SUM(b.remaining_quantity)', 'totalQuantity')
      // Bultos en stock. NULL si ningún lote del producto los lleva contados: ahí la
      // pantalla no muestra bultos en vez de mostrar un 0 que parecería "no queda nada".
      .addSelect('SUM(b.remaining_bultos)', 'totalBultos')
      .addSelect('COUNT(*)', 'batchCount')
      .addSelect('MIN(b.expiration_date)', 'nearestExpiration')
      // Cámaras distintas (no nulas) donde hay lotes del producto.
      .addSelect("ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL)", 'warehouses')
      // Último costo unitario conocido (cualquier lote del producto, no sólo los activos).
      .addSelect(
        `(SELECT b2.unit_cost FROM batches b2 WHERE b2.product_id = b.product_id AND b2.unit_cost IS NOT NULL ORDER BY b2.created_at DESC LIMIT 1)`,
        'lastUnitCost',
      )
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.product_id IS NOT NULL')
      .andWhere('b.remaining_quantity > 0')
      .groupBy('b.product_id')
      .addGroupBy('p.name')
      .addGroupBy('p.sku')
      .addGroupBy('p.unit')
      .addGroupBy('p.category')
      .addGroupBy('p.min_stock_level')
      .orderBy('p.name', 'ASC')
      .getRawMany();

    const now = Date.now();
    const summary: StockSummary[] = rows.map((r) => {
      const nearest = r.nearestExpiration ? new Date(r.nearestExpiration) : null;
      const minStock = r.minStockLevel != null ? Number(r.minStockLevel) : null;
      const totalQuantity = Number(r.totalQuantity);
      const daysToExpire = nearest ? Math.floor((nearest.getTime() - now) / 86_400_000) : null;
      const warehouses: string[] | undefined =
        Array.isArray(r.warehouses) && r.warehouses.length > 0 ? r.warehouses : undefined;
      return {
        productId: r.productId as string,
        productName: r.productName as string,
        sku: r.sku as string,
        unit: r.unit as string,
        category: (r.category as string) ?? undefined,
        totalQuantity,
        totalBultos: r.totalBultos != null ? Number(r.totalBultos) : undefined,
        batchCount: Number(r.batchCount),
        nearestExpiration: nearest?.toISOString(),
        minStock: minStock ?? undefined,
        warehouses,
        alertLevel: resolveAlertLevel({ totalQuantity, minStock, daysToExpire }),
        lastUnitCost: r.lastUnitCost != null ? Number(r.lastUnitCost) : null,
      };
    });

    // Leche cruda: lotes sin producto del catálogo. Se agregan como una fila propia
    // (litros disponibles) para que el inventario muestre la materia prima.
    const milk = await this.batches
      .createQueryBuilder('b')
      .leftJoin('b.warehouse', 'w')
      .select('SUM(b.remaining_quantity)', 'totalQuantity')
      .addSelect('COUNT(*)', 'batchCount')
      .addSelect('MIN(b.expiration_date)', 'nearestExpiration')
      .addSelect("ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL)", 'warehouses')
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.product_id IS NULL')
      .andWhere('b.remaining_quantity > 0')
      .getRawOne();

    const milkQty = milk?.totalQuantity != null ? Number(milk.totalQuantity) : 0;
    if (milkQty > 0) {
      const nearest = milk.nearestExpiration ? new Date(milk.nearestExpiration) : null;
      const warehouses: string[] | undefined =
        Array.isArray(milk.warehouses) && milk.warehouses.length > 0 ? milk.warehouses : undefined;
      summary.unshift({
        productId: 'leche-cruda',
        productName: 'Leche cruda',
        sku: '—',
        unit: 'litro',
        category: 'materia_prima',
        totalQuantity: milkQty,
        batchCount: Number(milk.batchCount),
        nearestExpiration: nearest?.toISOString(),
        minStock: undefined,
        warehouses,
        alertLevel: 'ok',
      });
    }

    // Insumos/productos con stock mínimo configurado que quedaron SIN stock (agotados):
    // los mostramos igual con cantidad 0 para alertar que hay que reponer.
    const present = new Set(summary.map((s) => s.productId));
    const withMin = await this.dataSource
      .getRepository(ProductEntity)
      .createQueryBuilder('p')
      .where('p.is_active = true')
      .andWhere('p.min_stock_level IS NOT NULL')
      .getMany();
    for (const p of withMin) {
      if (present.has(p.id)) continue;
      const minStock = p.minStockLevel != null ? Number(p.minStockLevel) : null;
      summary.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        unit: p.unit,
        category: p.category,
        totalQuantity: 0,
        batchCount: 0,
        nearestExpiration: undefined,
        minStock: minStock ?? undefined,
        warehouses: undefined,
        alertLevel: resolveAlertLevel({ totalQuantity: 0, minStock, daysToExpire: null }),
      });
    }

    return summary;
  }

  // Elimina un lote CARGADO A MANO por error (la papelera de inventario): borra el lote y todos
  // sus movimientos, sin dejar rastro, como si nunca se hubiera cargado. Aplica a:
  //  - ingresos de stock (LM-IN), y
  //  - lotes que creó un conteo físico al sobrar mercadería (LM-AJ).
  // Se permite aunque después se le haya hecho una BAJA o un ajuste por conteo: es justo el
  // caso real (sep 2026) de una leche ingresada por error y después dada de baja como
  // "vencida" para compensar — quedaba un vencimiento que nunca existió. Lo que NO se permite
  // es borrarlo si se usó en producción o se vendió: eso ya generó costo, lotes y remitos.
  async deleteStockEntry(batchId: string): Promise<{ deleted: true; code: string }> {
    return this.dataSource.transaction(async (manager) => {
      const batchRepo = manager.getRepository(BatchEntity);
      const movementRepo = manager.getRepository(InventoryMovementEntity);

      await lockBatches(manager, [batchId]);
      const batch = await batchRepo.findOne({ where: { id: batchId } });
      if (!batch) throw new NotFoundException(`Lote ${batchId} no encontrado`);

      const movements = await movementRepo.find({ where: { batchId } });
      // El movimiento que dio origen al lote: el ingreso (LM-IN) o el sobrante del conteo (LM-AJ).
      const esEntrada = (m: InventoryMovementEntity) =>
        (batch.code.startsWith('LM-IN') && m.type === 'in' && m.referenceType === 'stock_entry') ||
        (batch.code.startsWith('LM-AJ') &&
          m.type === 'adjustment' &&
          m.referenceType === 'stock_count' &&
          Number(m.quantity) > 0);
      if (!movements.some(esEntrada))
        throw new BadRequestException(
          `El lote ${batch.code} no se cargó a mano: se maneja desde su propia pantalla (producción o recepción).`,
        );

      // Lo único que se tolera además de la entrada: bajas y ajustes por conteo, que son
      // correcciones hechas sobre este mismo lote. Cualquier otra cosa (producción, venta,
      // devolución) significa que la mercadería se usó de verdad.
      const resto = movements.filter((m) => !esEntrada(m));
      const correcciones = new Set(['stock_adjustment', 'stock_count']);
      if (resto.some((m) => !correcciones.has(m.referenceType ?? '')))
        throw new BadRequestException(
          `No se puede eliminar el lote ${batch.code}: ya se usó en producción o se vendió. Dalo de baja en su lugar.`,
        );

      // Control de coherencia: el saldo tiene que ser exactamente lo que entró más/menos
      // las correcciones registradas. Si no cierra, algo lo tocó por fuera y no se borra
      // a ciegas. Las ediciones de lote nuevas van con signo (in/out); las bajas y los
      // ajustes viejos (type 'adjustment') restan si son baja y suman si son alta de conteo.
      const esperado = resto.reduce((acc, m) => {
        const q = Number(m.quantity);
        if (m.type === 'in') return acc + q;
        if (m.type === 'out') return acc - q;
        return acc + (m.referenceType === 'stock_adjustment' ? -q : q);
      }, Number(batch.initialQuantity));
      if (Math.abs(Number(batch.remainingQuantity) - esperado) > 1e-6)
        throw new BadRequestException(
          `No se puede eliminar el lote ${batch.code}: su saldo no coincide con sus movimientos. Dalo de baja en su lugar.`,
        );

      await movementRepo.remove(movements);
      await batchRepo.remove(batch);
      return { deleted: true as const, code: batch.code };
    });
  }

  // Ingreso directo de stock (insumos/envases): crea un lote de entrada. CLAUDE.md §4.4.
  // No es el módulo de compras completo (diferido); es una carga simple para tener stock real.
  async addStockEntry(input: StockEntryInput, userId: string): Promise<InventoryMovement> {
    // Costo del insumo CONGELADO en pesos: si se cargó en USD/EUR se convierte con la
    // cotización del día. La calculadora siempre trabaja en $ (CLAUDE.md §5).
    const currency = (input.currency as Currency) ?? 'ARS';
    const unitCostArs =
      input.unitCost == null
        ? null
        : currency === 'ARS'
          ? input.unitCost
          : Number(await this.exchangeRates.toArs(input.unitCost, currency, new Date()));
    // Fecha real del ingreso (queda como fecha del lote): la elegida o ahora. No futura
    // (margen de un día por husos horarios: el front manda el mediodía local).
    const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();
    if (Number.isNaN(entryDate.getTime()) || entryDate.getTime() > Date.now() + 24 * 60 * 60 * 1000)
      throw new BadRequestException('La fecha del ingreso no puede ser futura. Revisá el día, el mes y el año.');
    return this.dataSource.transaction(async (manager) => {
      // Serializa los ingresos IDÉNTICOS: si llegan dos juntos, el segundo espera y recién
      // ahí busca el duplicado (si no, ninguno ve al otro y entran los dos).
      await lockDuplicateSignature(
        manager,
        `ingreso:${input.productId}:${input.quantity}:${input.supplierLotNumber ?? ''}`,
      );
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException(`Producto ${input.productId} no encontrado`);
      // Insumos trazables: el N° de lote del proveedor es obligatorio (bromatología).
      const supplierLotNumber = input.supplierLotNumber?.trim() || null;
      if (product.requiresLotNumber && !supplierLotNumber) {
        throw new BadRequestException(`Falta el número de lote del proveedor para ${product.name}.`);
      }

      // Aviso de posible doble carga del mismo ingreso. Con N° de lote de proveedor, dos
      // ingresos del mismo producto con el mismo lote es un duplicado casi seguro. Sin lote,
      // avisamos si ya hubo hoy un ingreso del mismo producto por la misma cantidad. No bloquea:
      // frena y pide confirmar (puede ser una compra real repetida); el front reenvía con el flag.
      if (!input.confirmDuplicate) {
        const batchRepo = manager.getRepository(BatchEntity);
        let dup: BatchEntity | null = null;
        if (supplierLotNumber) {
          dup = await batchRepo.findOne({ where: { productId: product.id, supplierLotNumber } });
        } else {
          const dayStart = new Date(entryDate);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(entryDate);
          dayEnd.setHours(23, 59, 59, 999);
          const sameDay = await batchRepo.find({
            where: { productId: product.id, productionDate: Between(dayStart, dayEnd) },
          });
          dup =
            sameDay.find(
              (b) => b.code.startsWith('LM-IN') && Number(b.initialQuantity) === Number(input.quantity),
            ) ?? null;
        }
        if (dup)
          throw new ConflictException(
            supplierLotNumber
              ? `Ya ingresaste ${product.name} con el lote de proveedor "${supplierLotNumber}" (${dup.code}). Si es otra compra real, confirmá para cargarla igual.`
              : `Ya cargaste ese día un ingreso de ${product.name} por ${input.quantity} ${product.unit} (${dup.code}). Si es otra compra real, confirmá para cargarla igual.`,
          );
      }

      const code = `LM-IN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      const batch = await manager.getRepository(BatchEntity).save(
        manager.getRepository(BatchEntity).create({
          code,
          productId: product.id,
          productionDate: entryDate,
          initialQuantity: String(input.quantity),
          remainingQuantity: String(input.quantity),
          initialBultos: input.bultos ?? null,
          remainingBultos: input.bultos ?? null,
          unit: product.unit,
          status: 'activo',
          warehouseId: input.warehouseId ?? null,
          unitCost: unitCostArs != null ? String(unitCostArs) : null,
          supplierLotNumber,
          notes: input.notes ?? 'Ingreso de stock',
        }),
      );
      const mov = await manager.getRepository(InventoryMovementEntity).save(
        manager.getRepository(InventoryMovementEntity).create({
          batchId: batch.id,
          productId: product.id,
          type: 'in',
          reason: 'purchase',
          quantity: String(input.quantity),
          unit: product.unit,
          bultos: input.bultos ?? null,
          warehouseId: input.warehouseId ?? null,
          referenceType: 'stock_entry',
          createdById: userId,
        }),
      );
      return this.movementToDto(mov);
    });
  }

  // Helper: descuenta `quantity` de un producto por FEFO, registrando salidas con el
  // motivo dado. No bloquea si falta (descuenta lo disponible). Devuelve lo descontado.
  private async discardFefo(
    manager: EntityManager,
    productId: string,
    quantity: number,
    reason: MovementReason,
    type: 'out' | 'adjustment',
    notes: string | null,
    userId: string,
    // Bultos que el usuario dice que salen. Si viene, se reparte ese número entre los
    // lotes tocados; si no, cada lote baja sus bultos a prorrata de los kg que entrega.
    bultosPedidos: number | null = null,
  ): Promise<number> {
    // CANDADO sobre los lotes del producto antes de leer sus saldos: dos bajas o dos
    // ajustes simultáneos no pueden descontar el mismo lote dos veces.
    await lockBatchesOfProduct(manager, productId);
    const lots = sortOldestFirst(
      await manager.getRepository(BatchEntity).find({ where: { productId, status: 'activo' } }),
    );

    // Primero se decide de qué lote sale cuánto (sin tocar nada), para poder repartir
    // los bultos enteros sobre esa foto y que la suma cierre exacta.
    // Decimal exacto: en float quedaba un resto de 1e-14 que tocaba un lote más de la cuenta.
    const plan: Array<{ lot: BatchEntity; take: number; avail: number }> = [];
    let pending = new Big(quantity);
    for (const lot of lots) {
      if (pending.lte(0)) break;
      const avail = new Big(lot.remainingQuantity);
      const take = avail.lt(pending) ? avail : pending;
      if (take.lte(0)) continue;
      plan.push({ lot, take: take.toNumber(), avail: avail.toNumber() });
      pending = pending.minus(take);
    }
    const repartoBultos =
      bultosPedidos != null
        ? allocateBultos(
            bultosPedidos,
            // 0 (no null) en lotes sin bultos: el reparto va a los que sí los llevan.
            plan.map((p) => ({ quantity: p.take, available: p.lot.remainingBultos ?? 0 })),
          ).bultos
        : null;

    let consumed = new Big(0);
    for (const [idx, { lot, take, avail }] of plan.entries()) {
      // Los bultos bajan a prorrata de lo que sale, salvo que el usuario los haya dicho.
      const bultosTomados =
        lot.remainingBultos == null
          ? null
          : repartoBultos
            ? (repartoBultos[idx] ?? 0)
            : bultosForQuantity(take, avail, lot.remainingBultos);
      lot.remainingQuantity = new Big(avail).minus(take).toString();
      if (lot.remainingBultos != null && bultosTomados != null)
        lot.remainingBultos = lot.remainingBultos - bultosTomados;
      if (Number(lot.remainingQuantity) <= 0) lot.status = 'agotado';
      await manager.getRepository(BatchEntity).save(lot);
      await manager.getRepository(InventoryMovementEntity).save(
        manager.getRepository(InventoryMovementEntity).create({
          batchId: lot.id,
          productId,
          type,
          reason,
          quantity: String(take),
          unit: lot.unit,
          bultos: bultosTomados,
          referenceType: 'stock_adjustment',
          notes,
          createdById: userId,
        }),
      );
      consumed = consumed.plus(take);
    }
    return consumed.toNumber();
  }

  // Dar de baja stock por descarte/merma/vencimiento (salida con motivo, FEFO).
  async discardStock(input: DiscardStockInput, userId: string): Promise<{ discarded: number }> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException(`Producto ${input.productId} no encontrado`);
      const notes = `Baja: ${input.reason}${input.notes ? ` — ${input.notes}` : ''}`;
      const discarded = await this.discardFefo(
        manager,
        input.productId,
        input.quantity,
        'discard',
        'out',
        notes,
        userId,
        input.bultos ?? null,
      );
      return { discarded };
    });
  }

  // Ajuste por conteo físico: lleva el stock del producto a la cantidad contada.
  async countAdjust(input: CountAdjustInput, userId: string): Promise<{ adjusted: number }> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException(`Producto ${input.productId} no encontrado`);
      // CANDADO: el conteo lee el stock actual y lo lleva a lo contado; si otra operación
      // descuenta en el medio, el ajuste se calcularía sobre un número viejo.
      await lockBatchesOfProduct(manager, input.productId);
      const lots = await manager.getRepository(BatchEntity).find({ where: { productId: input.productId, status: 'activo' } });
      const current = lots.reduce((a, l) => a + Number(l.remainingQuantity), 0);
      const diff = input.countedQuantity - current;
      const notes = `Conteo físico${input.notes ? ` — ${input.notes}` : ''}`;
      if (Math.abs(diff) < 1e-9) {
        await this.adjustBultosToCount(manager, input.productId, input.countedBultos, notes, userId);
        return { adjusted: 0 };
      }
      if (diff < 0) {
        await this.discardFefo(manager, input.productId, -diff, 'count', 'adjustment', notes, userId);
      } else {
        const code = `LM-AJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
        const batch = await manager.getRepository(BatchEntity).save(
          manager.getRepository(BatchEntity).create({
            code,
            productId: input.productId,
            productionDate: new Date(),
            initialQuantity: String(diff),
            remainingQuantity: String(diff),
            unit: product.unit,
            status: 'activo',
            notes,
          }),
        );
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: batch.id,
            productId: input.productId,
            type: 'adjustment',
            reason: 'count',
            quantity: String(diff),
            unit: product.unit,
            referenceType: 'stock_count',
            notes,
            createdById: userId,
          }),
        );
      }
      // Recién ahora, con los kg ya ajustados, se lleva el saldo de bultos a lo contado.
      await this.adjustBultosToCount(manager, input.productId, input.countedBultos, notes, userId);
      return { adjusted: diff };
    });
  }

  // Lleva el saldo de BULTOS del producto a lo que se contó en planta. Es la válvula de
  // escape del sistema: en la práctica se cuentan bultos, no se pesa, así que si el saldo
  // se desvió (bolsa rota, un despacho cargado sin bultos) esta es la forma de corregirlo.
  // Si no se contaron bultos (undefined), no toca nada.
  private async adjustBultosToCount(
    manager: EntityManager,
    productId: string,
    countedBultos: number | undefined,
    notes: string,
    userId: string,
  ): Promise<void> {
    if (countedBultos == null) return;
    await lockBatchesOfProduct(manager, productId);
    const batchRepo = manager.getRepository(BatchEntity);
    const lots = await batchRepo.find({
      where: { productId, status: 'activo' },
      order: { expirationDate: 'ASC' },
    });
    if (lots.length === 0) return;
    const current = lots.reduce((a, l) => a + (l.remainingBultos ?? 0), 0);
    let diff = countedBultos - current;
    if (diff === 0) return;

    if (diff < 0) {
      // Faltan bultos: se sacan siguiendo el mismo orden FEFO que el resto del sistema.
      let toRemove = -diff;
      for (const lot of lots) {
        if (toRemove <= 0) break;
        const have = lot.remainingBultos ?? 0;
        const take = Math.min(have, toRemove);
        if (take <= 0) continue;
        lot.remainingBultos = have - take;
        await batchRepo.save(lot);
        toRemove -= take;
      }
      diff = -(-diff - toRemove); // lo que realmente se pudo sacar
    } else {
      // Sobran bultos: se suman al lote más nuevo (el que se está por contar de nuevo).
      const target = lots[lots.length - 1]!;
      target.remainingBultos = (target.remainingBultos ?? 0) + diff;
      await batchRepo.save(target);
    }
    if (diff === 0) return;

    const first = lots[0]!;
    await manager.getRepository(InventoryMovementEntity).save(
      manager.getRepository(InventoryMovementEntity).create({
        batchId: first.id,
        productId,
        type: 'adjustment',
        reason: 'count',
        quantity: '0', // ajuste solo de bultos: los kg no cambian
        unit: first.unit,
        bultos: diff, // con signo: + entraron, − salieron
        referenceType: 'stock_count',
        notes: `${notes} — bultos: ${diff > 0 ? '+' : ''}${diff}`,
        createdById: userId,
      }),
    );
  }

  // Todos los lotes de un producto (incluidos los agotados), el más nuevo primero: la
  // pantalla de inventario los lista para poder ver y CORREGIR cada lote (pedido del
  // dueño, oct 2026 — ej. masa vieja con kg en 0 pero bultos colgados).
  async listBatchesOfProduct(productId: string): Promise<ProductBatch[]> {
    const rows = await this.batches.find({
      where: { productId },
      relations: { warehouse: true },
      order: { productionDate: 'DESC', code: 'DESC' },
      take: 200,
    });
    return rows.map((b) => this.batchToDto(b));
  }

  // Edición de un lote existente: corregir kg (como ajuste por conteo CON rastro), bultos,
  // costo, vencimiento, cámara y notas, sin desarmar producción ni ventas. El costo aplica
  // HACIA ADELANTE: lo ya elaborado o vendido con el costo viejo no se recalcula — la
  // calculadora queda intacta (CLAUDE.md §5).
  async updateBatch(batchId: string, input: UpdateBatchInput, userId: string): Promise<ProductBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batchRepo = manager.getRepository(BatchEntity);
      const movementRepo = manager.getRepository(InventoryMovementEntity);
      // CANDADO: nadie más (venta, producción, otro ajuste) toca este lote mientras se edita.
      await lockBatches(manager, [batchId]);
      const batch = await batchRepo.findOne({ where: { id: batchId }, relations: { warehouse: true } });
      if (!batch) throw new NotFoundException(`Lote ${batchId} no encontrado`);

      // Un lote reservado por una orden abierta (en_proceso) tiene su saldo y sus bultos
      // comprometidos con esa orden: corregirlos acá desarmaría la reserva. Costo,
      // vencimiento y notas sí se pueden corregir.
      const tocaStock =
        (input.countedQuantity !== undefined && input.countedQuantity !== Number(batch.remainingQuantity)) ||
        (input.remainingBultos !== undefined && input.remainingBultos !== batch.remainingBultos) ||
        (input.warehouseId !== undefined && input.warehouseId !== batch.warehouseId);
      if (batch.status === 'en_proceso' && tocaStock) {
        throw new BadRequestException(
          `El lote ${batch.code} está reservado por una orden de producción abierta: cerrá o editá esa orden antes de corregir sus kg, bultos o cámara. (Costo, vencimiento y notas sí se pueden corregir.)`,
        );
      }

      // Kg reales del lote: la diferencia queda registrada como ajuste por conteo, con
      // signo (entrada si aparece, salida si falta).
      if (input.countedQuantity !== undefined) {
        const current = Number(batch.remainingQuantity);
        const diff = new Big(input.countedQuantity).minus(current);
        if (!diff.eq(0)) {
          batch.remainingQuantity = String(input.countedQuantity);
          await movementRepo.save(
            movementRepo.create({
              batchId: batch.id,
              productId: batch.productId,
              type: diff.gt(0) ? 'in' : 'out',
              reason: 'count',
              quantity: diff.abs().toString(),
              unit: batch.unit,
              referenceType: 'stock_count',
              notes: `Edición de lote — kg: ${current} → ${input.countedQuantity}`,
              createdById: userId,
            }),
          );
        }
      }

      // Bultos restantes: corrección directa, con movimiento de rastro (kg 0, bultos con signo).
      if (input.remainingBultos !== undefined && input.remainingBultos !== batch.remainingBultos) {
        const diffBultos = (input.remainingBultos ?? 0) - (batch.remainingBultos ?? 0);
        const antes = batch.remainingBultos;
        batch.remainingBultos = input.remainingBultos;
        if (diffBultos !== 0) {
          await movementRepo.save(
            movementRepo.create({
              batchId: batch.id,
              productId: batch.productId,
              type: 'adjustment',
              reason: 'count',
              quantity: '0',
              unit: batch.unit,
              bultos: diffBultos,
              referenceType: 'stock_count',
              notes: `Edición de lote — bultos: ${antes ?? '—'} → ${input.remainingBultos ?? '—'}`,
              createdById: userId,
            }),
          );
        }
      }

      if (input.unitCost !== undefined) {
        batch.unitCost = input.unitCost != null ? String(input.unitCost) : null;
      }
      if (input.expirationDate !== undefined) {
        batch.expirationDate = input.expirationDate ? new Date(input.expirationDate) : null;
      }
      if (input.warehouseId !== undefined) {
        if (input.warehouseId) {
          const w = await manager.getRepository(WarehouseEntity).findOne({ where: { id: input.warehouseId } });
          if (!w) throw new NotFoundException('Cámara no encontrada');
        }
        batch.warehouseId = input.warehouseId;
      }
      if (input.notes !== undefined) batch.notes = input.notes || null;

      // Estado coherente con el saldo: un agotado que recupera kg vuelve a activo y al
      // revés. 'en_proceso' (reservado por una orden abierta) no se toca.
      const remaining = Number(batch.remainingQuantity);
      if (remaining <= 0 && batch.status === 'activo') batch.status = 'agotado';
      if (remaining > 0 && batch.status === 'agotado') batch.status = 'activo';

      const saved = await batchRepo.save(batch);
      return this.batchToDto(saved);
    });
  }

  private batchToDto(b: BatchEntity): ProductBatch {
    return {
      id: b.id,
      code: b.code,
      productionDate: b.productionDate?.toISOString() ?? null,
      expirationDate: b.expirationDate?.toISOString() ?? null,
      initialQuantity: Number(b.initialQuantity),
      remainingQuantity: Number(b.remainingQuantity),
      initialBultos: b.initialBultos ?? null,
      remainingBultos: b.remainingBultos ?? null,
      unit: b.unit,
      status: b.status,
      unitCost: b.unitCost != null ? Number(b.unitCost) : null,
      warehouseId: b.warehouseId ?? null,
      warehouseName: b.warehouse?.name ?? null,
      notes: b.notes ?? null,
    };
  }

  // Lotes disponibles para consumir en producción (CLAUDE.md §4.3 — apertura de orden).
  // Ej: lotes de categoría "intermedio" (masa) para el paso masa→mozzarella.
  // Sólo lotes activos con saldo > 0; ordenados por vencimiento (FEFO) y luego por código.
  async consumableBatches(category?: string): Promise<ConsumableBatchDto[]> {
    const qb = this.batches
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.product', 'p')
      // Mismo criterio que milkBatches: 'en_proceso' con saldo disponible también se puede
      // elegir (la masa reservada por otra orden abierta pero con kg de sobra debe aparecer).
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.remaining_quantity > 0');
    if (category) qb.andWhere('p.category = :category', { category });
    qb.orderBy('b.expiration_date', 'ASC', 'NULLS LAST')
      .addOrderBy('b.production_date', 'ASC')
      .addOrderBy('b.code', 'ASC');
    const rows = await qb.getMany();
    const deps = {
      batches: this.batches,
      toArs: (amount: number | string, currency: Currency, date: Date) => this.exchangeRates.toArs(amount, currency, date),
    };
    const hoy = new Date();
    const costos = await Promise.all(
      rows.map((b) =>
        resolveInputCost(deps, b, b.product ?? null, hoy).catch(
          // Sin cotización para convertir la ficha: no rompe el listado, avisa como sin costo.
          () => ({ unitCost: '0', source: 'sin_costo' as const }),
        ),
      ),
    );
    return rows.map((b, i) => ({
      id: b.id,
      code: b.code,
      productId: b.productId ?? '',
      productName: b.product?.name ?? '',
      category: b.product?.category ?? '',
      remainingQuantity: Number(b.remainingQuantity),
      unit: b.unit,
      unitCost: b.unitCost != null ? Number(b.unitCost) : null,
      expirationDate: b.expirationDate?.toISOString(),
      entryCost: { ...costos[i]!, unitCost: Number(costos[i]!.unitCost) },
    }));
  }

  // Lotes de leche cruda disponibles (product_id IS NULL), opcionalmente de un silo.
  // Para el selector de origen en elaboración (CLAUDE.md §9). FEFO por vencimiento.
  async milkBatches(warehouseId?: string): Promise<MilkBatchDto[]> {
    const qb = this.batches
      .createQueryBuilder('b')
      // Incluye 'en_proceso': con "reservar = consumir" el saldo (remaining) ya está descontado,
      // así que un lote reservado por otra orden abierta pero con litros disponibles TIENE que
      // aparecer para elegir. Antes solo mostraba 'activo' y escondía tanques enteros que estaban
      // en_proceso aunque tuvieran leche de sobra.
      .leftJoinAndSelect('b.warehouse', 'w')
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.product_id IS NULL')
      .andWhere('b.remaining_quantity > 0');
    if (warehouseId) qb.andWhere('b.warehouse_id = :warehouseId', { warehouseId });
    qb.orderBy('b.expiration_date', 'ASC', 'NULLS LAST')
      .addOrderBy('b.production_date', 'ASC')
      .addOrderBy('b.code', 'ASC');
    const rows = await qb.getMany();
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      remainingQuantity: Number(b.remainingQuantity),
      unit: b.unit,
      unitCost: b.unitCost != null ? Number(b.unitCost) : null,
      warehouseId: b.warehouseId ?? null,
      warehouseName: b.warehouse?.name ?? null,
      expirationDate: b.expirationDate?.toISOString(),
    }));
  }

  // Nivel de cada silo (Σ litros de leche de sus lotes) + total de la planta. Solo lectura:
  // los números salen del stock real (remaining_quantity), nunca se cargan a mano (§9).
  async silos(): Promise<SilosOverview> {
    const silos = await this.warehouses.find({ where: { kind: 'silo', isActive: true }, order: { name: 'ASC' } });

    // Litros de leche por silo: suma de remaining de lotes sin producto (leche cruda).
    const rows = await this.batches
      .createQueryBuilder('b')
      .select('b.warehouse_id', 'warehouseId')
      .addSelect('SUM(b.remaining_quantity)', 'liters')
      .addSelect('COUNT(*)', 'batchCount')
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.product_id IS NULL')
      .andWhere('b.remaining_quantity > 0')
      .andWhere('b.warehouse_id IS NOT NULL')
      .groupBy('b.warehouse_id')
      .getRawMany();
    const byWarehouse = new Map<string, { liters: number; batchCount: number }>();
    for (const r of rows) {
      byWarehouse.set(r.warehouseId as string, { liters: Number(r.liters), batchCount: Number(r.batchCount) });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const levels = silos.map((s) => {
      const agg = byWarehouse.get(s.id) ?? { liters: 0, batchCount: 0 };
      const capacity = s.capacityLiters != null ? Number(s.capacityLiters) : 0;
      const current = round2(agg.liters);
      return {
        id: s.id,
        name: s.name,
        capacityLiters: round2(capacity),
        currentLiters: current,
        fillPercent: siloFillPercent(current, capacity),
        batchCount: agg.batchCount,
      };
    });

    const totalCapacity = round2(levels.reduce((a, s) => a + s.capacityLiters, 0));
    const totalCurrent = round2(levels.reduce((a, s) => a + s.currentLiters, 0));
    return {
      silos: levels,
      totalCapacity,
      totalCurrent,
      totalFillPercent: siloFillPercent(totalCurrent, totalCapacity),
    };
  }

  // Lotes activos del producto, el más viejo primero (vencimiento y, si no hay, elaboración).
  async fefoBatchesForProduct(productId: string): Promise<BatchEntity[]> {
    return sortOldestFirst(await this.batches.find({ where: { productId, status: 'activo' } }));
  }

  // Conteo físico — registra ajustes para diferencias (CLAUDE.md §4.4).
  async stockCount(input: StockCountInput, userId: string): Promise<InventoryMovement[]> {
    return this.dataSource.transaction(async (manager) => {
      const movements: InventoryMovementEntity[] = [];
      for (const c of input.counts) {
        const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: c.batchId } });
        if (!batch) throw new NotFoundException(`Lote ${c.batchId} no encontrado`);
        const current = Number(batch.remainingQuantity);
        const diff = c.countedQuantity - current;
        if (diff === 0) continue;
        const mov = manager.getRepository(InventoryMovementEntity).create({
          batchId: batch.id,
          productId: batch.productId,
          type: 'adjustment',
          reason: 'count',
          quantity: String(Math.abs(diff)),
          unit: batch.unit,
          warehouseId: input.warehouseId ?? null,
          referenceType: 'stock_count',
          notes: input.notes ?? null,
          createdById: userId,
        });
        await manager.getRepository(InventoryMovementEntity).save(mov);
        batch.remainingQuantity = String(c.countedQuantity);
        if (c.countedQuantity === 0) batch.status = 'agotado';
        await manager.getRepository(BatchEntity).save(batch);
        movements.push(mov);
      }
      return movements.map((m) => this.movementToDto(m));
    });
  }

  async listMovements(): Promise<InventoryMovement[]> {
    const rows = await this.movements.find({
      relations: { batch: true, product: true, warehouse: true },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return rows.map((m) => this.movementToDto(m));
  }

  // Trazabilidad ascendente simple por parent_batch_id. Se mantiene por compatibilidad
  // con el endpoint histórico /traceback. Para multi-padre usar traceBackward.
  async traceback(batchId: string): Promise<BatchEntity[]> {
    const chain: BatchEntity[] = [];
    const seen = new Set<string>();
    let current: BatchEntity | null = await this.batches.findOne({ where: { id: batchId } });
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      if (!current.parentBatchId) break;
      const parentId: string = current.parentBatchId;
      current = await this.batches.findOne({ where: { id: parentId } });
    }
    return chain;
  }

  // Carga en memoria todo lo necesario para recorrer el grafo de trazabilidad y devuelve
  // un reader síncrono (lo consume la lógica pura de trace-graph). Resuelve multi-padre y
  // multi-paso vía inventory_movements + production_orders.milkInputs (CLAUDE.md §4.4).
  private async buildTraceReader(): Promise<
    TraceGraphReader & { getOrderCode(orderId: string): string }
  > {
    const [batches, movements, orders, sales, receptions] = await Promise.all([
      this.batches.find({ relations: { product: true } }),
      this.movements.find(),
      this.productionOrders.find(),
      this.salesOrders.find({ relations: { client: true } }),
      this.receptions.find({ relations: { producer: true } }),
    ]);

    const batchById = new Map<string, BatchEntity>(batches.map((b) => [b.id, b]));
    const orderById = new Map<string, ProductionOrderEntity>(orders.map((o) => [o.id, o]));
    const saleById = new Map<string, SalesOrderEntity>(sales.map((s) => [s.id, s]));
    // Lote de leche → productor (vía recepción). Una recepción puede haber generado
    // varios lotes (uno por silo): todos trazan al mismo productor/recepción.
    const producerByBatchId = new Map<string, TraceProducer>();
    for (const r of receptions) {
      const ids = r.batchIds && r.batchIds.length > 0 ? r.batchIds : r.batchId ? [r.batchId] : [];
      for (const id of ids) {
        producerByBatchId.set(id, {
          producerId: r.producerId,
          producerName: r.producer?.name ?? r.producerName,
          receptionCode: r.code,
        });
      }
    }

    // Índices sobre movimientos.
    const consumedInOrders = new Map<string, Set<string>>(); // batchId → orderIds (out/production_order)
    const dispatchesByBatch = new Map<string, TraceDispatch[]>(); // batchId → despachos
    const orderOutputs = new Map<string, Set<string>>(); // orderId → batchIds (in/production_order)
    const producingOrderByBatch = new Map<string, string>(); // batchId → orderId que lo produjo

    for (const m of movements) {
      if (m.referenceType === 'production_order' && m.referenceId) {
        if (m.type === 'out') {
          if (!consumedInOrders.has(m.batchId)) consumedInOrders.set(m.batchId, new Set());
          consumedInOrders.get(m.batchId)!.add(m.referenceId);
        } else if (m.type === 'in') {
          if (!orderOutputs.has(m.referenceId)) orderOutputs.set(m.referenceId, new Set());
          orderOutputs.get(m.referenceId)!.add(m.batchId);
          producingOrderByBatch.set(m.batchId, m.referenceId);
        }
      } else if (m.referenceType === 'sales_order' && m.referenceId) {
        const sale = saleById.get(m.referenceId);
        const list = dispatchesByBatch.get(m.batchId) ?? [];
        list.push({
          salesOrderId: m.referenceId,
          salesOrderCode: sale?.code ?? '',
          clientId: sale?.clientId ?? null,
          clientName: sale?.client?.businessName ?? '',
          quantity: Number(m.quantity),
          unit: m.unit,
          dispatchedAt: sale?.dispatchedAt?.toISOString(),
        });
        dispatchesByBatch.set(m.batchId, list);
      }
    }

    const toTraceBatch = (b: BatchEntity): TraceBatch => ({
      id: b.id,
      code: b.code,
      productId: b.productId,
      productName: b.product?.name ?? null,
      unit: b.unit,
      quantity: b.remainingQuantity != null ? Number(b.remainingQuantity) : null,
      expirationDate: b.expirationDate?.toISOString(),
      // Es leche de origen si tiene productor asociado y no fue producido por una orden.
      isMilk: producerByBatchId.has(b.id) && !producingOrderByBatch.has(b.id),
    });

    return {
      getBatch: (batchId) => {
        const b = batchById.get(batchId);
        return b ? toTraceBatch(b) : null;
      },
      getOutEdges: (batchId): BatchOutEdges => ({
        consumedInOrderIds: Array.from(consumedInOrders.get(batchId) ?? []),
        dispatches: dispatchesByBatch.get(batchId) ?? [],
      }),
      getOrderOutputBatchIds: (orderId) => Array.from(orderOutputs.get(orderId) ?? []),
      getProducingOrder: (batchId) => {
        const orderId = producingOrderByBatch.get(batchId);
        if (!orderId) return null;
        return { orderId, orderCode: orderById.get(orderId)?.code ?? '' };
      },
      getOrderInputBatchIds: (orderId) => {
        const order = orderById.get(orderId);
        return (order?.milkInputs ?? []).map((mi) => mi.batchId);
      },
      getProducer: (batchId) => producerByBatchId.get(batchId) ?? null,
      getOrderCode: (orderId) => orderById.get(orderId)?.code ?? '',
    };
  }

  // Trazabilidad DESCENDENTE: de un lote (leche o masa) hacia adelante — en qué órdenes se
  // consumió, qué lotes producto generó (recursivo) y a qué clientes se despachó.
  async traceForward(batchId: string): Promise<TraceForward> {
    const reader = await this.buildTraceReader();
    const node = buildForwardTrace(batchId, reader);
    if (!node) throw new NotFoundException(`Lote ${batchId} no encontrado`);
    return node;
  }

  // Trazabilidad ASCENDENTE: de un lote hacia atrás — la orden que lo produjo, todos los
  // lotes consumidos (multi-padre) y, en el origen, el productor de cada leche.
  async traceBackward(batchId: string): Promise<TraceBackward> {
    const reader = await this.buildTraceReader();
    const node = buildBackwardTrace(batchId, reader);
    if (!node) throw new NotFoundException(`Lote ${batchId} no encontrado`);
    return node;
  }

  // Sugerencia FEFO (solo lectura): qué lotes tomar para cubrir una cantidad, ordenados por
  // vencimiento más próximo. No persiste ni baja stock (CLAUDE.md §4.4).
  async fefoSuggestion(productId: string, quantity: number): Promise<FefoSuggestion> {
    const batches = await this.fefoBatchesForProduct(productId);
    const result = buildFefoSuggestion(
      quantity,
      batches.map((b) => ({
        id: b.id,
        code: b.code,
        remaining: Number(b.remainingQuantity),
        expirationDate: b.expirationDate?.toISOString(),
      })),
    );
    return {
      productId,
      quantity,
      ...result,
      batches: batches
        .filter((b) => Number(b.remainingQuantity) > 0)
        .map((b) => ({
          batchId: b.id,
          batchCode: b.code,
          remaining: Number(b.remainingQuantity),
          productionDate: b.productionDate?.toISOString(),
          expirationDate: b.expirationDate?.toISOString(),
        })),
    };
  }

  warehouseToDto(w: WarehouseEntity): Warehouse {
    return {
      id: w.id,
      code: w.code,
      name: w.name,
      kind: w.kind,
      targetTemperatureCelsius: w.targetTemperatureCelsius ? Number(w.targetTemperatureCelsius) : undefined,
      capacityLiters: w.capacityLiters != null ? Number(w.capacityLiters) : undefined,
      isActive: w.isActive,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    };
  }

  movementToDto(m: InventoryMovementEntity): InventoryMovement {
    return {
      id: m.id,
      batchId: m.batchId,
      batchCode: m.batch?.code ?? '',
      productId: m.productId ?? '',
      productName: m.product?.name ?? '',
      type: m.type,
      reason: m.reason,
      quantity: Number(m.quantity),
      unit: m.unit,
      bultos: m.bultos ?? undefined,
      warehouseId: m.warehouseId ?? undefined,
      warehouseName: m.warehouse?.name,
      referenceType: m.referenceType ?? undefined,
      referenceId: m.referenceId ?? undefined,
      notes: m.notes ?? undefined,
      createdById: m.createdById,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
