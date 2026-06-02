import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
  TraceBackward,
  TraceBatch,
  TraceDispatch,
  TraceForward,
  TraceProducer,
  Warehouse,
} from '@lasmarias/shared-schemas';
import { WarehouseEntity } from './warehouse.entity';
import { InventoryMovementEntity } from './inventory-movement.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { resolveAlertLevel } from './stock-alert';
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
      .addSelect('COUNT(*)', 'batchCount')
      .addSelect('MIN(b.expiration_date)', 'nearestExpiration')
      // Cámaras distintas (no nulas) donde hay lotes del producto.
      .addSelect("ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL)", 'warehouses')
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
        batchCount: Number(r.batchCount),
        nearestExpiration: nearest?.toISOString(),
        minStock: minStock ?? undefined,
        warehouses,
        alertLevel: resolveAlertLevel({ totalQuantity, minStock, daysToExpire }),
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

  // Ingreso directo de stock (insumos/envases): crea un lote de entrada. CLAUDE.md §4.4.
  // No es el módulo de compras completo (diferido); es una carga simple para tener stock real.
  async addStockEntry(input: StockEntryInput, userId: string): Promise<InventoryMovement> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const code = `LM-IN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      const batch = await manager.getRepository(BatchEntity).save(
        manager.getRepository(BatchEntity).create({
          code,
          productId: product.id,
          productionDate: new Date(),
          initialQuantity: String(input.quantity),
          remainingQuantity: String(input.quantity),
          unit: product.unit,
          status: 'activo',
          warehouseId: input.warehouseId ?? null,
          unitCost: input.unitCost != null ? String(input.unitCost) : null,
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
  ): Promise<number> {
    const lots = await manager.getRepository(BatchEntity).find({
      where: { productId, status: 'activo' },
      order: { expirationDate: 'ASC' },
    });
    let toConsume = quantity;
    for (const lot of lots) {
      if (toConsume <= 0) break;
      const avail = Number(lot.remainingQuantity);
      const take = Math.min(avail, toConsume);
      if (take <= 0) continue;
      lot.remainingQuantity = String(avail - take);
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
          referenceType: 'stock_adjustment',
          notes,
          createdById: userId,
        }),
      );
      toConsume -= take;
    }
    return quantity - toConsume;
  }

  // Dar de baja stock por descarte/merma/vencimiento (salida con motivo, FEFO).
  async discardStock(input: DiscardStockInput, userId: string): Promise<{ discarded: number }> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const notes = `Baja: ${input.reason}${input.notes ? ` — ${input.notes}` : ''}`;
      const discarded = await this.discardFefo(manager, input.productId, input.quantity, 'discard', 'out', notes, userId);
      return { discarded };
    });
  }

  // Ajuste por conteo físico: lleva el stock del producto a la cantidad contada.
  async countAdjust(input: CountAdjustInput, userId: string): Promise<{ adjusted: number }> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(ProductEntity).findOne({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const lots = await manager.getRepository(BatchEntity).find({ where: { productId: input.productId, status: 'activo' } });
      const current = lots.reduce((a, l) => a + Number(l.remainingQuantity), 0);
      const diff = input.countedQuantity - current;
      const notes = `Conteo físico${input.notes ? ` — ${input.notes}` : ''}`;
      if (Math.abs(diff) < 1e-9) return { adjusted: 0 };
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
      return { adjusted: diff };
    });
  }

  // Lotes disponibles para consumir en producción (CLAUDE.md §4.3 — apertura de orden).
  // Ej: lotes de categoría "intermedio" (masa) para el paso masa→mozzarella.
  // Sólo lotes activos con saldo > 0; ordenados por vencimiento (FEFO) y luego por código.
  async consumableBatches(category?: string): Promise<ConsumableBatchDto[]> {
    const qb = this.batches
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.product', 'p')
      .where("b.status = 'activo'")
      .andWhere('b.remaining_quantity > 0');
    if (category) qb.andWhere('p.category = :category', { category });
    qb.orderBy('b.expiration_date', 'ASC').addOrderBy('b.code', 'ASC');
    const rows = await qb.getMany();
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      productId: b.productId ?? '',
      productName: b.product?.name ?? '',
      category: b.product?.category ?? '',
      remainingQuantity: Number(b.remainingQuantity),
      unit: b.unit,
      unitCost: b.unitCost != null ? Number(b.unitCost) : null,
      expirationDate: b.expirationDate?.toISOString(),
    }));
  }

  // FEFO — lotes activos ordenados por vencimiento más próximo.
  async fefoBatchesForProduct(productId: string): Promise<BatchEntity[]> {
    return this.batches.find({
      where: { productId, status: 'activo' },
      order: { expirationDate: 'ASC' },
    });
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
    // Lote de leche → productor (vía recepción).
    const producerByBatchId = new Map<string, TraceProducer>();
    for (const r of receptions) {
      if (r.batchId) {
        producerByBatchId.set(r.batchId, {
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
    return { productId, quantity, ...result };
  }

  warehouseToDto(w: WarehouseEntity): Warehouse {
    return {
      id: w.id,
      code: w.code,
      name: w.name,
      kind: w.kind,
      targetTemperatureCelsius: w.targetTemperatureCelsius ? Number(w.targetTemperatureCelsius) : undefined,
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
