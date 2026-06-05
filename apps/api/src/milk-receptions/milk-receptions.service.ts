import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import type {
  CreateMilkReceptionInput,
  MilkReception,
  MilkReceptionStatus,
} from '@lasmarias/shared-schemas';
import { MilkReceptionEntity } from './milk-reception.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProducersService } from '../producers/producers.service';
import { evaluateMilkQuality } from './milk-quality-limits';
import { formatMilkBatchCode } from './batch-code';
import { SettingsService } from '../settings/settings.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import type { Currency } from '@lasmarias/shared-schemas';

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

  // Reporte agregado de volumen por productor (CLAUDE.md §4.1).
  async volumeByProducer(from: Date, to: Date) {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.producer_id', 'producerId')
      .addSelect('MAX(r.producer_name)', 'producerName')
      .addSelect('SUM(r.liters)', 'totalLiters')
      .addSelect('COUNT(*)', 'receptionCount')
      .where('r.received_at BETWEEN :from AND :to', { from, to })
      .andWhere("r.status <> 'anulada'")
      .groupBy('r.producer_id')
      .orderBy('"totalLiters"', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      producerId: r.producerId as string,
      producerName: r.producerName as string,
      totalLiters: Number(r.totalLiters),
      receptionCount: Number(r.receptionCount),
    }));
  }

  // Crear una recepción es la operación crítica del módulo (CLAUDE.md §4.1).
  // Pasos en una sola transacción:
  //   1. Evaluar calidad → estado aceptada | bloqueada.
  //   2. Generar código de lote único secuencial del día.
  //   3. Crear el batch de leche cruda si la recepción es aceptada.
  //   4. Persistir la recepción asociada al batch.
  async create(input: CreateMilkReceptionInput, userId: string): Promise<MilkReception> {
    const producer = await this.producers.get(input.producerId);

    const limits = await this.settings.getQualityLimits();
    const evaluation = evaluateMilkQuality(input.quality, limits);
    const status: MilkReceptionStatus = evaluation.acceptable ? 'aceptada' : 'bloqueada';
    const blockedReason = evaluation.acceptable ? null : evaluation.reasons.join(' ');

    const receivedAt = new Date(input.receivedAt);

    // Costo de la leche en PESOS (convertido desde la moneda del tambo con la cotización
    // vigente a la fecha de recepción) y CONGELADO en el lote. La calculadora trabaja en $.
    const milkUnitCostArs =
      producer.agreedPricePerLiter != null
        ? String(
            await this.exchangeRates.toArs(
              producer.agreedPricePerLiter,
              (producer.priceCurrency as Currency) ?? 'ARS',
              receivedAt,
            ),
          )
        : null;

    return this.dataSource.transaction(async (manager) => {
      const code = await this.nextBatchCode(manager, receivedAt);

      let batchId: string | null = null;
      if (status === 'aceptada') {
        const batchRepo = manager.getRepository(BatchEntity);
        const batch = batchRepo.create({
          code,
          productId: null,
          productionDate: receivedAt,
          expirationDate: null,
          initialQuantity: String(input.liters),
          remainingQuantity: String(input.liters),
          unit: 'litro' as const,
          status: 'activo' as const,
          parentBatchId: null,
          warehouseId: input.warehouseId ?? null,
          // Costo de la leche en $/litro (ya convertido desde la moneda del tambo). Habilita el costeo.
          unitCost: milkUnitCostArs,
          notes: `Leche cruda — productor ${producer.name}`,
        });
        const savedBatch = await batchRepo.save(batch);
        batchId = savedBatch.id;
      }

      const receptionRepo = manager.getRepository(MilkReceptionEntity);
      const entity = receptionRepo.create({
        code,
        receivedAt,
        producerId: producer.id,
        producerName: producer.name,
        vehiclePlate: input.vehiclePlate ?? null,
        driverName: input.driverName ?? null,
        remito: input.remito ?? null,
        declaredLiters: input.declaredLiters != null ? String(input.declaredLiters) : null,
        liters: String(input.liters),
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

  // Próximo código secuencial del día. Usa pg_advisory_xact_lock para evitar
  // races entre transacciones concurrentes. La clave de lock es YYYYMMDD del día.
  // (Postgres no permite FOR UPDATE en queries con agregados como COUNT.)
  private async nextBatchCode(manager: import('typeorm').EntityManager, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const lockKey = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    await manager.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    const count = await manager
      .getRepository(MilkReceptionEntity)
      .createQueryBuilder('r')
      .where('r.received_at BETWEEN :start AND :end', { start, end })
      .getCount();

    return formatMilkBatchCode({ date, sequence: count + 1 });
  }

  toDto(e: MilkReceptionEntity): MilkReception {
    return {
      id: e.id,
      code: e.code,
      receivedAt: e.receivedAt.toISOString(),
      producerId: e.producerId,
      producerName: e.producerName,
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
