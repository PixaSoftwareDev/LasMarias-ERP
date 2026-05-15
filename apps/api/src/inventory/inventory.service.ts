import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CreateWarehouseInput,
  InventoryMovement,
  StockCountInput,
  StockSummary,
  Warehouse,
} from '@lasmarias/shared-schemas';
import { WarehouseEntity } from './warehouse.entity';
import { InventoryMovementEntity } from './inventory-movement.entity';
import { BatchEntity } from '../batches/batch.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    @InjectRepository(InventoryMovementEntity)
    private readonly movements: Repository<InventoryMovementEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // --- Warehouses
  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.warehouses.find({ where: { isActive: true }, order: { name: 'ASC' } });
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

  // --- Stock summary
  // Devuelve el stock agregado por producto. CLAUDE.md §4.4 — FEFO ordena por vencimiento.
  async stockSummary(): Promise<StockSummary[]> {
    const rows = await this.batches
      .createQueryBuilder('b')
      .leftJoin('b.product', 'p')
      .select('b.product_id', 'productId')
      .addSelect('p.name', 'productName')
      .addSelect('p.sku', 'sku')
      .addSelect('p.unit', 'unit')
      .addSelect('SUM(b.remaining_quantity)', 'totalQuantity')
      .addSelect('COUNT(*)', 'batchCount')
      .addSelect('MIN(b.expiration_date)', 'nearestExpiration')
      .where("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.product_id IS NOT NULL')
      .groupBy('b.product_id')
      .addGroupBy('p.name')
      .addGroupBy('p.sku')
      .addGroupBy('p.unit')
      .orderBy('p.name', 'ASC')
      .getRawMany();

    const now = Date.now();
    return rows.map((r) => {
      const nearest = r.nearestExpiration ? new Date(r.nearestExpiration) : null;
      let alertLevel: StockSummary['alertLevel'] = 'ok';
      if (nearest) {
        const daysToExpire = Math.floor((nearest.getTime() - now) / 86_400_000);
        if (daysToExpire <= 0) alertLevel = 'critical';
        else if (daysToExpire <= 7) alertLevel = 'expiring';
      }
      return {
        productId: r.productId as string,
        productName: r.productName as string,
        sku: r.sku as string,
        unit: r.unit as string,
        totalQuantity: Number(r.totalQuantity),
        batchCount: Number(r.batchCount),
        nearestExpiration: nearest?.toISOString(),
        alertLevel,
      };
    });
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

  // Trazabilidad ascendente: dado un lote, devuelve el árbol de lotes padre.
  async traceback(batchId: string): Promise<BatchEntity[]> {
    const chain: BatchEntity[] = [];
    let current: BatchEntity | null = await this.batches.findOne({ where: { id: batchId } });
    while (current) {
      chain.push(current);
      if (!current.parentBatchId) break;
      const parentId: string = current.parentBatchId;
      current = await this.batches.findOne({ where: { id: parentId } });
    }
    return chain;
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
