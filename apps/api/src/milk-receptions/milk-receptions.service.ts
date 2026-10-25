import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import Big from 'big.js';
import type {
  CreateMilkReceptionInput,
  UpdateMilkReceptionInput,
  MilkReception,
  MilkReceptionLine,
  MilkReceptionStatus,
} from '@lasmarias/shared-schemas';
import { MilkReceptionEntity } from './milk-reception.entity';
import { BatchEntity } from '../batches/batch.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';
import { siloHasRoomFor } from '../inventory/silo.helpers';
import { lockBatches, lockDuplicateSignature, lockRow } from '../common/locks';
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
  // Una descarga puede traer leche de varios tambos (pedido #17). Para cada tambo
  // congelamos su precio por litro EN PESOS (convertido + IVA si corresponde): es la
  // base del pago a ese productor. El lote de leche guarda el costo PROMEDIO PONDERADO.
  // Compartido entre CREAR y EDITAR una recepción.
  private async buildLines(producersInput: CreateMilkReceptionInput['producers'], receivedAt: Date) {
    const ivaRate = await this.settings.getIvaRate();
    const lines: MilkReceptionLine[] = [];
    let totalLiters = new Big(0);
    let totalDeclared = new Big(0);
    let hasDeclared = false;
    let totalCost = new Big(0); // pesos
    for (const pl of producersInput) {
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
    return { lines, totalLiters, totalDeclared, hasDeclared, milkUnitCostArs, primary, producerName };
  }

  // Crea los lotes de leche de una recepción aceptada (uno por silo asignado), validando
  // el reparto y la capacidad de cada silo. Compartido entre CREAR y EDITAR.
  private async createMilkBatches(
    manager: import('typeorm').EntityManager,
    opts: {
      code: string;
      receivedAt: Date;
      totalLiters: Big;
      silos?: { warehouseId: string; liters: number }[];
      warehouseId?: string | null;
      unitCost: string | null;
      producerName: string;
    },
  ): Promise<string[]> {
    const batchRepo = manager.getRepository(BatchEntity);

    // Destino: reparto explícito por silos, o un único lote (silo/cámara o sin asignar).
    const allocations: { warehouseId: string | null; liters: number }[] =
      opts.silos && opts.silos.length > 0
        ? opts.silos.map((s) => ({ warehouseId: s.warehouseId, liters: s.liters }))
        : [{ warehouseId: opts.warehouseId ?? null, liters: opts.totalLiters.toNumber() }];

    // CANDADO de cada silo destino ANTES de leer su nivel: dos cargas (o una carga y una
    // edición) al mismo silo no pueden pasarse de capacidad entre las dos.
    for (const alloc of allocations) {
      if (alloc.warehouseId) await lockRow(manager, 'warehouses', alloc.warehouseId);
    }

    // Reparto explícito por silos: la suma asignada tiene que dar los litros recibidos.
    if (opts.silos && opts.silos.length > 0) {
      const allocSum = opts.silos.reduce((a, s) => a.plus(s.liters), new Big(0));
      if (!allocSum.eq(opts.totalLiters)) {
        throw new BadRequestException(
          `Los litros asignados a los silos (${allocSum.toString()}) no coinciden con los litros recibidos (${opts.totalLiters.toString()}).`,
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
    const createdBatchIds: string[] = [];
    let idx = 0;
    for (const alloc of allocations) {
      idx += 1;
      const batch = batchRepo.create({
        code: allocations.length > 1 ? `${opts.code}-${idx}` : opts.code,
        productId: null,
        productionDate: opts.receivedAt,
        expirationDate: null,
        initialQuantity: String(alloc.liters),
        remainingQuantity: String(alloc.liters),
        unit: 'litro' as const,
        status: 'activo' as const,
        parentBatchId: null,
        warehouseId: alloc.warehouseId,
        // Costo de la leche en $/litro (promedio ponderado de los tambos). Habilita el costeo.
        unitCost: opts.unitCost,
        notes: `Leche cruda — ${opts.producerName}`,
      });
      const saved = await batchRepo.save(batch);
      createdBatchIds.push(saved.id);
    }
    return createdBatchIds;
  }

  async create(input: CreateMilkReceptionInput, userId: string): Promise<MilkReception> {
    const limits = await this.settings.getQualityLimits();
    const evaluation = evaluateMilkQuality(input.quality, limits);
    const status: MilkReceptionStatus = evaluation.acceptable ? 'aceptada' : 'bloqueada';
    const blockedReason = evaluation.acceptable ? null : evaluation.reasons.join(' ');

    const receivedAt = new Date(input.receivedAt);
    const { lines, totalLiters, totalDeclared, hasDeclared, milkUnitCostArs, primary, producerName } =
      await this.buildLines(input.producers, receivedAt);
    const litersStr = totalLiters.toString();

    return this.dataSource.transaction(async (manager) => {
      // Serializa las recepciones IDÉNTICAS: antes este chequeo corría FUERA de la
      // transacción, así que dos cargas simultáneas no se veían y entraban las dos
      // (probado: +1.000 L de leche que nunca entró a la planta).
      await lockDuplicateSignature(manager, `recepcion:${primary.producerId}:${litersStr}`);
      // Además, el candado del silo: la validación de capacidad de más abajo lee el nivel
      // actual, así que dos descargas al mismo silo no pueden pasarse de capacidad entre las dos.
      for (const s of input.silos ?? []) await lockRow(manager, 'warehouses', s.warehouseId);
      if (input.warehouseId) await lockRow(manager, 'warehouses', input.warehouseId);

      // Aviso de posible doble carga: misma recepción del mismo tambo, el mismo día y por los
      // mismos litros. No bloquea de una (puede haber dos descargas reales): frena y pide
      // confirmar. Al confirmar, el front reenvía con confirmDuplicate=true y se salta el chequeo.
      if (!input.confirmDuplicate) {
        const dayStart = new Date(receivedAt);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(receivedAt);
        dayEnd.setHours(23, 59, 59, 999);
        const sameDay = await manager.getRepository(MilkReceptionEntity).find({
          where: { producerId: primary.producerId, receivedAt: Between(dayStart, dayEnd) },
        });
        const dup = sameDay.find((r) => Number(r.liters) === Number(litersStr));
        if (dup)
          throw new ConflictException(
            `Ya cargaste una recepción de ${primary.producerName} el ${dayStart.toLocaleDateString('es-AR')} por ${litersStr} litros (${dup.code}). Si es otra descarga real, confirmá para cargarla igual.`,
          );
      }

      const code = await this.nextBatchCode(manager, receivedAt);

      let batchId: string | null = null;
      let createdBatchIds: string[] = [];
      if (status === 'aceptada') {
        createdBatchIds = await this.createMilkBatches(manager, {
          code,
          receivedAt,
          totalLiters,
          silos: input.silos,
          warehouseId: input.warehouseId ?? null,
          unitCost: milkUnitCostArs,
          producerName,
        });
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

  // ¿La leche de estos lotes ya se usó? Reservada por una orden abierta (en_proceso) o con
  // movimientos que no sean ajustes de stock. Criterio único para get(), update() y remove().
  private async milkUsed(
    batches: BatchEntity[],
    movementRepo: Repository<InventoryMovementEntity>,
  ): Promise<boolean> {
    if (batches.some((b) => b.status === 'en_proceso')) return true;
    if (batches.length === 0) return false;
    const movs = await movementRepo
      .createQueryBuilder('m')
      .where('m.batch_id IN (:...ids)', { ids: batches.map((b) => b.id) })
      .andWhere("m.reference_type IS DISTINCT FROM 'stock_adjustment'")
      .getCount();
    return movs > 0;
  }

  // Detalle de una recepción, con lo que la pantalla de edición necesita: si la leche ya
  // se usó (limita la edición) y el reparto actual en silos (derivado de sus lotes).
  async get(id: string): Promise<MilkReception> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Recepción ${id} no encontrada`);
    const batchIds = r.batchIds && r.batchIds.length > 0 ? r.batchIds : r.batchId ? [r.batchId] : [];
    const batches = batchIds.length
      ? await this.dataSource.getRepository(BatchEntity).find({ where: { id: In(batchIds) } })
      : [];
    const milkUsed = await this.milkUsed(batches, this.dataSource.getRepository(InventoryMovementEntity));
    return {
      ...this.toDto(r),
      milkUsed,
      silos: batches.map((b) => ({ warehouseId: b.warehouseId ?? null, liters: Number(b.initialQuantity) })),
    };
  }

  // Editar una recepción (pedido del dueño, oct 2026). Dos caminos según si la leche ya se usó:
  //  - SIN USAR: edición total. Se rehacen los lotes de leche (con el MISMO código) con los
  //    litros, silos y costo nuevos, y la calidad se reevalúa (puede pasar de bloqueada a
  //    aceptada y al revés). La cuenta del tambo se recalcula sola (deriva de las recepciones).
  //  - YA USADA en elaboración: se editan los datos (tambos, calidad, remito, fecha, notas)
  //    y los litros solo hasta lo NO consumido; los silos no se tocan y el estado tampoco
  //    (la leche ya se procesó). El costo nuevo del lote aplica hacia adelante: lo ya
  //    elaborado no se recalcula (CLAUDE.md §5).
  async update(id: string, input: UpdateMilkReceptionInput): Promise<MilkReception> {
    const receivedAt = new Date(input.receivedAt);
    return this.dataSource.transaction(async (manager) => {
      const receptionRepo = manager.getRepository(MilkReceptionEntity);
      const batchRepo = manager.getRepository(BatchEntity);
      const movementRepo = manager.getRepository(InventoryMovementEntity);

      // CANDADO: dos ediciones (o una edición y un borrado) de la misma recepción se serializan.
      await lockRow(manager, 'milk_receptions', id);
      const reception = await receptionRepo.findOne({ where: { id } });
      if (!reception) throw new NotFoundException(`Recepción ${id} no encontrada`);
      if (reception.status === 'anulada')
        throw new BadRequestException(`La recepción ${reception.code} está anulada y no se puede editar.`);

      const batchIds =
        reception.batchIds && reception.batchIds.length > 0
          ? reception.batchIds
          : reception.batchId
            ? [reception.batchId]
            : [];
      await lockBatches(manager, batchIds);

      // ¿La leche ya se usó? Mismo criterio que el borrado y que get().
      const batches = batchIds.length ? await batchRepo.find({ where: { id: In(batchIds) } }) : [];
      const usada = await this.milkUsed(batches, movementRepo);

      const { lines, totalLiters, totalDeclared, hasDeclared, milkUnitCostArs, primary, producerName } =
        await this.buildLines(input.producers, receivedAt);

      if (!usada) {
        // --- Edición total: afuera los lotes viejos (y sus ajustes), adentro los nuevos. ---
        if (batchIds.length > 0) {
          const adjustments = await movementRepo
            .createQueryBuilder('m')
            .where('m.batch_id IN (:...ids)', { ids: batchIds })
            .getMany();
          if (adjustments.length > 0) await movementRepo.remove(adjustments);
          await batchRepo.delete(batchIds);
        }

        const limits = await this.settings.getQualityLimits();
        const evaluation = evaluateMilkQuality(input.quality, limits);
        const status: MilkReceptionStatus = evaluation.acceptable ? 'aceptada' : 'bloqueada';
        reception.status = status;
        reception.blockedReason = evaluation.acceptable ? null : evaluation.reasons.join(' ');

        let createdBatchIds: string[] = [];
        if (status === 'aceptada') {
          createdBatchIds = await this.createMilkBatches(manager, {
            code: reception.code, // el código de la recepción no cambia aunque cambie la fecha
            receivedAt,
            totalLiters,
            silos: input.silos,
            warehouseId: input.warehouseId ?? null,
            unitCost: milkUnitCostArs,
            producerName,
          });
        }
        reception.batchIds = createdBatchIds;
        reception.batchId = createdBatchIds[0] ?? null;
      } else {
        // --- Leche ya usada: los litros solo pueden moverse en lo NO consumido. ---
        const oldTotal = new Big(reception.liters);
        const diff = totalLiters.minus(oldTotal);
        if (!diff.eq(0)) {
          const totalRemaining = batches.reduce((a, b) => a.plus(b.remainingQuantity), new Big(0));
          if (diff.lt(0) && totalRemaining.lt(diff.abs())) {
            const consumido = oldTotal.minus(totalRemaining);
            throw new BadRequestException(
              `De esta recepción ya se usaron ${consumido.toString()} L en elaboración: los litros no pueden quedar por debajo de eso. Si hace falta menos, editá primero esa orden de producción.`,
            );
          }
          // Si se AGREGAN litros, van al primer lote: su silo tiene que tener lugar
          // (mismo control de capacidad que una descarga, con su candado).
          const target = batches[0];
          if (diff.gt(0) && target?.warehouseId) {
            await lockRow(manager, 'warehouses', target.warehouseId);
            const wh = await manager
              .getRepository(WarehouseEntity)
              .findOne({ where: { id: target.warehouseId } });
            const capacity = wh?.capacityLiters != null ? Number(wh.capacityLiters) : 0;
            if (capacity > 0) {
              const raw = await batchRepo
                .createQueryBuilder('b')
                .select('COALESCE(SUM(b.remaining_quantity), 0)', 'current')
                .where('b.warehouse_id = :wid', { wid: target.warehouseId })
                .andWhere("b.unit = 'litro'")
                .andWhere('b.product_id IS NULL')
                .andWhere("b.status IN ('activo','en_proceso')")
                .getRawOne<{ current: string }>();
              const current = Number(raw?.current ?? 0);
              if (!siloHasRoomFor(capacity, current, diff.toNumber())) {
                const available = Math.max(0, Math.round((capacity - current) * 10) / 10);
                throw new BadRequestException(
                  `Los litros agregados no entran en el silo "${wh?.name ?? ''}" (tiene ${available} L disponibles). Ajustá primero el nivel de ese silo.`,
                );
              }
            }
          }
          // Repartir la diferencia entre los lotes: saldo e inicial se mueven juntos, así
          // inicial − consumido = saldo se mantiene en cada lote. Si se agrega, va al primero.
          let pendiente = diff;
          for (const b of batches) {
            if (pendiente.eq(0)) break;
            const remaining = new Big(b.remainingQuantity);
            const delta = pendiente.gt(0)
              ? pendiente
              : remaining.gte(pendiente.abs())
                ? pendiente
                : remaining.neg();
            b.remainingQuantity = remaining.plus(delta).toString();
            b.initialQuantity = new Big(b.initialQuantity).plus(delta).toString();
            pendiente = pendiente.minus(delta);
          }
        }
        // Costo y datos del lote hacia adelante (lo ya elaborado no se recalcula).
        for (const b of batches) {
          b.productionDate = receivedAt;
          b.unitCost = milkUnitCostArs;
          b.notes = `Leche cruda — ${producerName}`;
          const rem = Number(b.remainingQuantity);
          if (rem <= 0 && b.status === 'activo') b.status = 'agotado';
          if (rem > 0 && b.status === 'agotado') b.status = 'activo';
          await batchRepo.save(b);
        }
      }

      reception.receivedAt = receivedAt;
      reception.producerId = primary.producerId;
      reception.producerName = producerName;
      reception.lines = lines;
      reception.vehiclePlate = input.vehiclePlate ?? null;
      reception.driverName = input.driverName ?? null;
      reception.remito = input.remito ?? null;
      reception.declaredLiters = hasDeclared ? totalDeclared.toString() : null;
      reception.liters = totalLiters.toString();
      reception.quality = input.quality;
      reception.notes = input.notes ?? null;
      const saved = await receptionRepo.save(reception);
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

      // CANDADO antes de leer: un borrado y una edición simultáneos de la misma recepción
      // se serializan; sin esto, el borrado podía quedarse con la lista vieja de lotes y
      // dejar huérfano el lote que la edición acababa de crear.
      await lockRow(manager, 'milk_receptions', id);
      const reception = await receptionRepo.findOne({ where: { id } });
      if (!reception) throw new NotFoundException(`Recepción ${id} no encontrada`);

      const batchIds =
        reception.batchIds && reception.batchIds.length > 0
          ? reception.batchIds
          : reception.batchId
            ? [reception.batchId]
            : [];

      // CANDADO sobre los lotes de la recepción: si una orden los está tomando en este
      // mismo momento, esperamos y recién ahí evaluamos la guardia de abajo con el estado real.
      await lockBatches(manager, batchIds);

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
