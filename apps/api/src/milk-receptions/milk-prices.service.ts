import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import Big from 'big.js';
import type {
  Currency,
  IvaMode,
  MilkMonthPriceRow,
  MilkMonthPrices,
  MilkReceptionLine,
  SaveMilkMonthPricesInput,
  SaveMilkMonthPricesResult,
} from '@lasmarias/shared-schemas';
import { MilkReceptionEntity } from './milk-reception.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { ProducerMonthPriceEntity } from '../producers/producer-month-price.entity';
import { SettingsService } from '../settings/settings.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { applyIva } from '../common/iva';
import { debeActualizarAcordado } from './milk-price-rules';
import { lockBatches, lockRow } from '../common/locks';

// Precio de la leche por mes de cada tambo (pedido del dueño 10/11/2026).
//   - Una recepción toma el precio del MES en que se recibió (hora Argentina); si ese mes no
//     tiene precio propio, el precio acordado del tambo.
//   - Guardar el precio de un mes re-precia TODAS las recepciones de ese tambo en ese mes:
//     la cuenta corriente queda real y el costo de la leche que todavía no se usó también.
//   - Lo ya elaborado NO se recalcula (las órdenes cerradas congelaron su costo, CLAUDE.md §5):
//     se informa cuántos litros quedaron con el precio viejo y por cuánta plata.

export const TZ_AR = 'America/Argentina/Buenos_Aires';

export function mesDe(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_AR, year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

@Injectable()
export class MilkPricesService {
  constructor(
    private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  // Precio base (moneda del tambo, sin convertir) para una fecha: el del mes o el acordado.
  async precioBase(producer: ProducerEntity, receivedAt: Date, m: EntityManager = this.ds.manager): Promise<string | null> {
    const delMes = await m
      .getRepository(ProducerMonthPriceEntity)
      .findOne({ where: { producerId: producer.id, month: mesDe(receivedAt) } });
    return delMes?.price ?? producer.agreedPricePerLiter ?? null;
  }

  // $/litro en PESOS con IVA (lo que se congela en la línea de la recepción).
  async precioPesos(producer: ProducerEntity, base: string | null, receivedAt: Date, ivaRate: number): Promise<number> {
    if (base == null) return 0;
    const ars = await this.exchangeRates.toArs(base, (producer.priceCurrency as Currency) ?? 'ARS', receivedAt);
    return Number(applyIva(ars, (producer.priceIvaMode as IvaMode) ?? 'sin_iva', ivaRate));
  }

  // Litros de un lote de leche usados en elaboraciones ya cerradas.
  private async litrosEnOrdenesCerradas(m: EntityManager, batchId: string): Promise<Big> {
    const [r]: { litros: string }[] = await m.query(
      `SELECT COALESCE(SUM((mi->>'liters')::numeric), 0)::text AS litros
         FROM production_orders o
         CROSS JOIN LATERAL jsonb_array_elements(o.milk_inputs) mi
        WHERE o.status = 'closed' AND mi->>'batchId' = $1`,
      [batchId],
    );
    return new Big(r?.litros ?? 0);
  }

  private async recepcionesDelMes(m: EntityManager, month: string): Promise<MilkReceptionEntity[]> {
    return m
      .getRepository(MilkReceptionEntity)
      .createQueryBuilder('r')
      .where("to_char(r.received_at AT TIME ZONE :tz, 'YYYY-MM') = :month", { tz: TZ_AR, month })
      .andWhere("r.status <> 'anulada'")
      .orderBy('r.received_at', 'ASC')
      .getMany();
  }

  // Líneas de una recepción (las viejas single-tambo no tienen `lines`: una sola línea al costo del lote).
  private static lineas(r: MilkReceptionEntity, batchUnitCost: string | null): MilkReceptionLine[] {
    if (r.lines && r.lines.length > 0) return r.lines;
    return [
      {
        producerId: r.producerId,
        producerName: r.producerName,
        liters: Number(r.liters),
        pricePerLiter: batchUnitCost != null ? Number(batchUnitCost) : 0,
      } as MilkReceptionLine,
    ];
  }

  async overview(month: string, m: EntityManager = this.ds.manager): Promise<MilkMonthPrices> {
    const producers = await m.getRepository(ProducerEntity).find({ order: { name: 'ASC' } });
    const precios = await m.getRepository(ProducerMonthPriceEntity).find({ where: { month } });
    const recs = await this.recepcionesDelMes(m, month);
    const batchCost = await this.costosDeLotes(m, recs);

    const agg = new Map<string, { litros: Big; importe: Big; recepciones: number; precios: Set<number> }>();
    for (const r of recs) {
      if (r.status !== 'aceptada') continue; // la cuenta corriente cuenta solo las aceptadas
      for (const l of MilkPricesService.lineas(r, batchCost.get(r.id) ?? null)) {
        const a = agg.get(l.producerId) ?? { litros: new Big(0), importe: new Big(0), recepciones: 0, precios: new Set<number>() };
        a.litros = a.litros.plus(l.liters);
        a.importe = a.importe.plus(new Big(l.liters).times(l.pricePerLiter ?? 0));
        a.recepciones += 1;
        a.precios.add(Number(l.pricePerLiter ?? 0));
        agg.set(l.producerId, a);
      }
    }
    const rows: MilkMonthPriceRow[] = producers
      .filter((p) => p.isActive || agg.has(p.id))
      .map((p) => {
        const a = agg.get(p.id);
        const pm = precios.find((x) => x.producerId === p.id);
        return {
          producerId: p.id,
          producerName: p.name,
          currency: p.priceCurrency ?? 'ARS',
          ivaMode: p.priceIvaMode ?? 'sin_iva',
          litros: a ? a.litros.toString() : '0',
          recepciones: a?.recepciones ?? 0,
          preciosUsados: a ? [...a.precios].sort((x, y) => x - y) : [],
          importe: a ? a.importe.round(2).toFixed(2) : '0.00',
          precioMes: pm ? Number(pm.price) : null,
          precioAcordado: p.agreedPricePerLiter != null ? Number(p.agreedPricePerLiter) : null,
        };
      })
      // Primero los que entregaron leche ese mes.
      .sort((x, y) => Number(Number(y.litros) > 0) - Number(Number(x.litros) > 0) || x.producerName.localeCompare(y.producerName));
    return { month, mesActual: mesDe(new Date()), ivaRate: await this.settings.getIvaRate(), rows };
  }

  private async costosDeLotes(m: EntityManager, recs: MilkReceptionEntity[]): Promise<Map<string, string | null>> {
    const ids = recs.flatMap((r) => (r.batchIds?.length ? r.batchIds : r.batchId ? [r.batchId] : []));
    const batches = ids.length ? await m.getRepository(BatchEntity).find({ where: { id: In(ids) } }) : [];
    const byId = new Map(batches.map((b) => [b.id, b]));
    return new Map(
      recs.map((r) => {
        const first = (r.batchIds?.length ? r.batchIds : r.batchId ? [r.batchId] : [])[0];
        return [r.id, first ? (byId.get(first)?.unitCost ?? null) : null];
      }),
    );
  }

  async save(month: string, input: SaveMilkMonthPricesInput): Promise<SaveMilkMonthPricesResult> {
    return this.ds.transaction(async (m) => {
      const ivaRate = await this.settings.getIvaRate();
      const prodRepo = m.getRepository(ProducerEntity);
      const priceRepo = m.getRepository(ProducerMonthPriceEntity);
      const ids = input.prices.map((p) => p.producerId);
      const producers = await prodRepo.find({ where: { id: In(ids) } });
      if (producers.length !== new Set(ids).size) throw new NotFoundException('Algún tambo no existe.');
      const byId = new Map(producers.map((p) => [p.id, p]));

      // 1. Guardar (o sacar) el precio del mes. Si es el precio más nuevo (mes actual, o el anterior
      //    mientras el actual no tiene precio) pasa a ser también el acordado: las recepciones
      //    nuevas lo toman solas. Corregir un mes viejo no pisa el acordado.
      for (const { producerId, price } of input.prices) {
        if (price == null) {
          await priceRepo.delete({ producerId, month });
          continue;
        }
        await priceRepo.save({ producerId, month, price: String(price) });
        const posterior = await priceRepo
          .createQueryBuilder('x')
          .where('x.producer_id = :producerId AND x.month > :month', { producerId, month })
          .getCount();
        const hoy = mesDe(new Date());
        const actualTienePrecio = (await priceRepo.count({ where: { producerId, month: hoy } })) > 0;
        if (debeActualizarAcordado(month, hoy, actualTienePrecio, posterior > 0)) {
          const p = byId.get(producerId)!;
          p.agreedPricePerLiter = String(price);
          await prodRepo.save(p);
        }
      }

      // 2. Re-preciar las recepciones del mes donde aparecen esos tambos.
      const cambiados = new Set(ids);
      let actualizadas = 0;
      let antes = new Big(0);
      let despues = new Big(0);
      let litrosElab = new Big(0);
      let difElab = new Big(0);
      const precioCache = new Map<string, number>(); // producerId|día → $/L

      for (const r of await this.recepcionesDelMes(m, month)) {
        const tiene = r.lines?.length ? r.lines.some((l) => cambiados.has(l.producerId)) : cambiados.has(r.producerId);
        if (!tiene) continue;
        const batchIds = r.batchIds?.length ? r.batchIds : r.batchId ? [r.batchId] : [];
        await lockRow(m, 'milk_receptions', r.id);
        await lockBatches(m, batchIds);
        const batches = batchIds.length ? await m.getRepository(BatchEntity).find({ where: { id: In(batchIds) } }) : [];
        const lineas = MilkPricesService.lineas(r, batches[0]?.unitCost ?? null);

        const nuevas: MilkReceptionLine[] = [];
        for (const l of lineas) {
          if (!cambiados.has(l.producerId)) {
            nuevas.push(l);
            continue;
          }
          const p = byId.get(l.producerId)!;
          const key = `${p.id}|${r.receivedAt.toISOString().slice(0, 10)}`;
          let precio = precioCache.get(key);
          if (precio === undefined) {
            precio = await this.precioPesos(p, await this.precioBase(p, r.receivedAt, m), r.receivedAt, ivaRate);
            precioCache.set(key, precio);
          }
          if (r.status === 'aceptada') {
            antes = antes.plus(new Big(l.liters).times(l.pricePerLiter ?? 0));
            despues = despues.plus(new Big(l.liters).times(precio));
          }
          nuevas.push({ ...l, pricePerLiter: precio });
        }

        // Costo del lote = promedio ponderado de los tambos de la descarga (igual que al cargarla).
        const totalL = nuevas.reduce((a, l) => a.plus(l.liters), new Big(0));
        const totalC = nuevas.reduce((a, l) => a.plus(new Big(l.liters).times(l.pricePerLiter ?? 0)), new Big(0));
        const unitCost = totalL.gt(0) ? totalC.div(totalL).toFixed(4) : null;

        for (const b of batches) {
          // Lo que ya se elaboró de este lote (órdenes CERRADAS) quedó con el costo viejo. La leche
          // reservada en órdenes abiertas no cuenta: al cerrarlas toman el precio nuevo.
          const usado = await this.litrosEnOrdenesCerradas(m, b.id);
          if (usado.gt(0) && unitCost != null) {
            litrosElab = litrosElab.plus(usado);
            difElab = difElab.plus(usado.times(new Big(unitCost).minus(b.unitCost ?? 0)));
          }
          b.unitCost = unitCost;
          await m.getRepository(BatchEntity).save(b);
        }
        if (r.lines && r.lines.length > 0) {
          r.lines = nuevas;
          await m.getRepository(MilkReceptionEntity).save(r);
        }
        actualizadas += 1;
      }

      return {
        overview: await this.overview(month, m),
        recepcionesActualizadas: actualizadas,
        importeAntes: antes.round(2).toFixed(2),
        importeDespues: despues.round(2).toFixed(2),
        litrosYaElaborados: litrosElab.toString(),
        diferenciaYaElaborada: difElab.round(2).toFixed(2),
      };
    });
  }
}
