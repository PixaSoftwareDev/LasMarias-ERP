import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import Big from 'big.js';
import type {
  CreateMilkReceptionInput,
  MilkReception,
  MilkReceptionLine,
  MilkReceptionStatus,
} from '@lasmarias/shared-schemas';
import { MilkReceptionEntity } from './milk-reception.entity';
import { BatchEntity } from '../batches/batch.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';
import { siloHasRoomFor } from '../inventory/silo.helpers';
import { ProducersService } from '../producers/producers.service';
import { evaluateMilkQuality } from './milk-quality-limits';
import { formatMilkBatchCode } from './batch-code';
import { SettingsService } from '../settings/settings.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { applyIva } from '../common/iva';
import type { Currency, IvaMode } from '@lasmarias/shared-schemas';

@Injectable()
export class MilkReceptionsService {
  constructor(
    @InjectRepository(MilkReceptionEntity)
    private readonly repo: Repository<MilkReceptionEntity>,
    private readonly producers: ProducersService,
    private readonly settings: SettingsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<MilkReception[]> {
    const rows = await this.repo.find({ order: { receivedAt: 'DESC' }, take: 200 });
    return rows.map((r) => this.toDto(r));
  }

  async listByDateRange(from: Date, to: Date): Promise<MilkReception[]> {
    const rows = await this.repo.find({
      where: { receivedAt: Between(from, to) },
      order: { receivedAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  // Reporte agregado de volumen por productor (CLAUDE.md §4.1). Suma por tambo desde el
  // detalle de cada descarga (lines); para recepciones viejas single-tambo usa el nivel raíz.
  async volumeByProducer(from: Date, to: Date) {
    const receptions = await this.repo.find({
      where: { receivedAt: Between(from, to) },
    });
    const agg = new Map<string, { producerName: string; totalLiters: number; receptionCount: number }>();
    const add = (producerId: string, producerName: string, liters: number) => {
      const cur = agg.get(producerId) ?? { producerName, totalLiters: 0, receptionCount: 0 };
      cur.totalLiters += liters;
      cur.receptionCount += 1;
      cur.producerName = producerName;
      agg.set(producerId, cur);
    };
    for (const r of receptions) {
      if (r.status === 'anulada') continue;
      if (r.lines && r.lines.length > 0) {
        for (const l of r.lines) add(l.producerId, l.producerName, l.liters);
      } else {
        add(r.producerId, r.producerName, Number(r.liters));
      }
    }
    return [...agg.entries()]
      .map(([producerId, v]) => ({ producerId, producerName: v.producerName, totalLiters: v.totalLiters, receptionCount: v.receptionCount }))
      .sort((a, b) => b.totalLiters - a.totalLiters);
  }

  // Crear una recepción es la operación crítica del módulo (CLAUDE.md §4.1).
  // Pasos en una sola transacción:
  //   1. Evaluar calidad → estado aceptada | bloqueada.
  //   2. Generar código de lote único secuencial del día.
  //   3. Crear el batch de leche cruda si la recepción es aceptada.
  //   4. Persistir la recepción asociada al batch.
  async create(input: CreateMilkReceptionInput, userId: string): Promise<MilkReception> {
    const limits = await this.settings.getQualityLimits();
    const evaluation = evaluateMilkQuality(input.quality, limits);
    const status: MilkReceptionStatus = evaluation.acceptable ? 'aceptada' : 'bloqueada';
    const blockedReason = evaluation.acceptable ? null : evaluation.reasons.join(' ');

    const receivedAt = new Date(input.receivedAt);
    const ivaRate = await this.settings.getIvaRate();

    // Una descarga puede traer leche de varios tambos (pedido #17). Para cada tambo
    // congelamos su precio por litro EN PESOS (convertido + IVA si corresponde): es la
    // base del pago a ese productor. El lote de leche guarda el costo PROMEDIO PONDERADO.
    const lines: MilkReceptionLine[] = [];
    let totalLiters = new Big(0);
    let totalDeclared = new Big(0);
    let hasDeclared = false;
    let totalCost = new Big(0); // pesos
    for (const pl of input.producers) {
      const producer = await this.producers.get(pl.producerId);
      const pricePerLiter =
        producer.agreedPricePerLiter != null
          ? Number(
              applyIva(
                await this.exchangeRates.toArs(
                  producer.agreedPricePerLiter,
                  (producer.priceCurrency as Currency) ?? 'ARS',
                  receivedAt,
                ),
                (producer.priceIvaMode as IvaMode) ?? 'sin_iva',
                ivaRate,
              ),
            )
          : 0;
      lines.push({
        producerId: producer.id,
        producerName: producer.name,
        liters: pl.liters,
        declaredLiters: pl.declaredLiters,
        pricePerLiter,
      });
      totalLiters = totalLiters.plus(pl.liters);
      if (pl.declaredLiters != null) {
        totalDeclared = totalDeclared.plus(pl.declaredLiters);
        hasDeclared = true;
      }
      totalCost = totalCost.plus(new Big(pl.liters).times(pricePerLiter));
    }

    // Costo unitario del lote = costo total / litros totales (promedio ponderado, $/litro).
    const milkUnitCostArs = totalLiters.gt(0) ? totalCost.div(totalLiters).toFixed(4) : null;
    const primary = lines[0]!;
    const producerName =
      lines.length > 1 ? `${primary.producerName} +${lines.length - 1} tambo(s)` : primary.producerName;
    const litersStr = totalLiters.toString();

    return this.dataSource.transaction(async (manager) => {
      const code = await this.nextBatchCode(manager, receivedAt);

      let batchId: string | null = null;
      const createdBatchIds: string[] = [];
      if (status === 'aceptada') {
        const batchRepo = manager.getRepository(BatchEntity);

        // Destino: reparto explícito por silos, o un único lote (silo/cámara o sin asignar).
        const allocations: { warehouseId: string | null; liters: number }[] =
          input.silos && input.silos.length > 0
            ? input.silos.map((s) => ({ warehouseId: s.warehouseId, liters: s.liters }))
            : [{ warehouseId: input.warehouseId ?? null, liters: totalLiters.toNumber() }];

        // Reparto explícito por silos: la suma asignada tiene que dar los litros recibidos.
        if (input.silos && input.silos.length > 0) {
          const allocSum = input.silos.reduce((a, s) => a.plus(s.liters), new Big(0));
          if (!allocSum.eq(totalLiters)) {
            throw new BadRequestException(
              `Los litros asignados a los silos (${allocSum.toString()}) no coinciden con los litros recibidos (${litersStr}).`,
            );
          }
        }

        // Capacidad: ningún silo puede quedar por encima de su capacidad. Vale para el reparto
        // en varios silos Y para el caso de un único silo (si no, se frena y se pide otro silo).
        for (const alloc of allocations) {
          if (!alloc.warehouseId) continue;
          const wh = await manager.getRepository(WarehouseEntity).findOne({ where: { id: alloc.warehouseId } });
          const capacity = wh?.capacityLiters != null ? Number(wh.capacityLiters) : 0;
          if (!(capacity > 0)) continue; // sin capacidad cargada → sin límite
          const raw = await batchRepo
            .createQueryBuilder('b')
            .select('COALESCE(SUM(b.remaining_quantity), 0)', 'current')
            .where('b.warehouse_id = :wid', { wid: alloc.warehouseId })
            .andWhere("b.unit = 'litro'")
            .andWhere('b.product_id IS NULL')
            .andWhere("b.status IN ('activo','en_proceso')")
            .getRawOne<{ current: string }>();
          const current = Number(raw?.current ?? 0);
          if (!siloHasRoomFor(capacity, current, alloc.liters)) {
            const available = Math.max(0, Math.round((capacity - current) * 10) / 10);
            throw new BadRequestException(
              `El silo "${wh?.name ?? ''}" tiene ${available} L disponibles y estás asignando ${alloc.liters} L. Repartí la descarga en otro silo.`,
            );
          }
        }

        // Un lote por asignación (mismo costo/litro ponderado). Código sufijado si hay varios.
        let idx = 0;
        for (const alloc of allocations) {
          idx += 1;
          const batch = batchRepo.create({
            code: allocations.length > 1 ? `${code}-${idx}` : code,
            productId: null,
            productionDate: receivedAt,
            expirationDate: null,
            initialQuantity: String(alloc.liters),
            remainingQuantity: String(alloc.liters),
            unit: 'litro' as const,
            status: 'activo' as const,
            parentBatchId: null,
            warehouseId: alloc.warehouseId,
            // Costo de la leche en $/litro (promedio ponderado de los tambos). Habilita el costeo.
            unitCost: milkUnitCostArs,
            notes: `Leche cruda — ${producerName}`,
          });
          const saved = await batchRepo.save(batch);
          createdBatchIds.push(saved.id);
        }
        batchId = createdBatchIds[0] ?? null;
      }

      const receptionRepo = manager.getRepository(MilkReceptionEntity);
      const entity = receptionRepo.create({
        code,
        receivedAt,
        producerId: primary.producerId,
        producerName,
        lines,
        batchIds: createdBatchIds,
        vehiclePlate: input.vehiclePlate ?? null,
        driverName: input.driverName ?? null,
        remito: input.remito ?? null,
        declaredLiters: hasDeclared ? totalDeclared.toString() : null,
        liters: litersStr,
        quality: input.quality,
        status,
        blockedReason,
        notes: input.notes ?? null,
        batchId,
        createdById: userId,
      });
      const saved = await receptionRepo.save(entity);
      return this.toDto(saved);
    });
  }

  // Borrar una recepción con reversa total de stock (mismo criterio que borrar una orden
  // de producción). Elimina los lotes de leche que creó (el silo baja solo) y la deuda con
  // el tambo se recalcula automáticamente porque se deriva de las recepciones aceptadas.
  // Se permite aunque el lote ya haya sido dado de baja por ajuste (vencido/merma): esos
  // ajustes también se borran. Lo único que frena es que la leche se haya usado en una
  // elaboración: ahí primero hay que borrar esa orden.
  async remove(id: string): Promise<{ deleted: true; code: string }> {
    return this.dataSource.transaction(async (manager) => {
      const receptionRepo = manager.getRepository(MilkReceptionEntity);
      const batchRepo = manager.getRepository(BatchEntity);
      const movementRepo = manager.getRepository(InventoryMovementEntity);

      const reception = await receptionRepo.findOne({ where: { id } });
      if (!reception) throw new NotFoundException(`Recepción ${id} no encontrada`);

      const batchIds =
        reception.batchIds && reception.batchIds.length > 0
          ? reception.batchIds
          : reception.batchId
            ? [reception.batchId]
            : [];

      // Guardia: la leche no tiene que haberse usado en ninguna elaboración.
      for (const batchId of batchIds) {
        const batch = await batchRepo.findOne({ where: { id: batchId } });
        if (!batch) continue;
        if (batch.status === 'en_proceso') {
          throw new BadRequestException(
            `No se puede borrar la recepción ${reception.code}: la leche del lote ${batch.code} está reservada por una orden de producción abierta. Borrá primero esa orden.`,
          );
        }
        const usedInProduction = await movementRepo
          .createQueryBuilder('m')
          .where('m.batch_id = :batchId', { batchId })
          .andWhere("m.reference_type IS DISTINCT FROM 'stock_adjustment'")
          .getCount();
        if (usedInProduction > 0) {
          throw new BadRequestException(
            `No se puede borrar la recepción ${reception.code}: la leche del lote ${batch.code} ya se usó en una elaboración. Borrá primero esa orden de producción.`,
          );
        }
      }

      // Reversa: primero la recepción (referencia al batch), después los ajustes de
      // stock que apunten a esos lotes, y al final los lotes (el nivel del silo baja solo).
      await receptionRepo.remove(reception);
      if (batchIds.length > 0) {
        const adjustments = await movementRepo
          .createQueryBuilder('m')
          .where('m.batch_id IN (:...ids)', { ids: batchIds })
          .getMany();
        if (adjustments.length > 0) await movementRepo.remove(adjustments);
        await batchRepo.delete(batchIds);
      }
      return { deleted: true as const, code: reception.code };
    });
  }

  // Próximo código secuencial del día. Usa pg_advisory_xact_lock para evitar
  // races entre transacciones concurrentes. La clave de lock es YYYYMMDD del día.
  // Secuencia = MAX(código del día)+1, no count(): si se borró una recepción intermedia,
  // count() repetiría un código ya usado (índice único).
  private async nextBatchCode(manager: import('typeorm').EntityManager, date: Date) {
    const lockKey = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    await manager.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    const prefix = formatMilkBatchCode({ date, sequence: 1 }).slice(0, -4); // LM-LC-YYYYMMDD-
    const row = await manager
      .getRepository(MilkReceptionEntity)
      .createQueryBuilder('r')
      .select('MAX(r.code)', 'max')
      .where('r.code LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const last = row?.max ? Number(row.max.slice(prefix.length)) : 0;
    return formatMilkBatchCode({ date, sequence: last + 1 });
  }

  toDto(e: MilkReceptionEntity): MilkReception {
    return {
      id: e.id,
      code: e.code,
      receivedAt: e.receivedAt.toISOString(),
      producerId: e.producerId,
      producerName: e.producerName,
      lines: e.lines ?? [],
      vehiclePlate: e.vehiclePlate ?? undefined,
      driverName: e.driverName ?? undefined,
      remito: e.remito ?? undefined,
      declaredLiters: e.declaredLiters != null ? Number(e.declaredLiters) : undefined,
      litersDifference:
        e.declaredLiters != null ? Number(e.liters) - Number(e.declaredLiters) : undefined,
      liters: Number(e.liters),
      quality: e.quality,
      status: e.status,
      blockedReason: e.blockedReason ?? undefined,
      notes: e.notes ?? undefined,
      batchId: e.batchId ?? undefined,
      createdBy: e.createdById,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
