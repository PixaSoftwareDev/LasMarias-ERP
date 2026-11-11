import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { COSTO_FIJO_NOMBRE, cuotaDe, cuotasDelMes, sumarMeses } from '@lasmarias/shared-schemas';
import type {
  FixedCostLine,
  FixedCostMonth,
  FixedCostsOverview,
  FixedCostType,
  FixedCostTypeInput,
} from '@lasmarias/shared-schemas';
import { FixedCostMonthEntity } from './fixed-cost-month.entity';
import { FixedCostTypeEntity } from './fixed-cost-type.entity';
import { FixedCostSettingsEntity } from './fixed-cost-settings.entity';
import { baseDelMes, cobertura, computeFixedCosts, mesEnUso, promedioLitros } from './fixed-cost-calculator';

// Costos fijos de planta (audio del dueño 10/11/2026). Se cargan por mes y se guardan; el
// $/litro del último mes cargado se suma SIEMPRE al cerrar cada elaboración que usa leche cruda
// (ver production.service → applyClose). Sin tocar recetas. Las órdenes ya cerradas no cambian.

const TZ = 'America/Argentina/Buenos_Aires';

const mesActual = (): string => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
};

export interface CostoFijoVigente {
  month: string;
  costoPorLitro: string;
}

@Injectable()
export class FixedCostsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // Litros de LECHE elaborados por mes: lotes de leche cruda (sin producto) usados en órdenes
  // no anuladas, según la fecha de inicio de la orden (la leche se descuenta al reservar).
  // No cuenta masa, crema ni ricota usadas como origen (no son litros de leche).
  private async litrosPorMes(m: EntityManager = this.ds.manager): Promise<Map<string, string>> {
    const rows: { mes: string; litros: string }[] = await m.query(
      `SELECT to_char(o.started_at AT TIME ZONE $1, 'YYYY-MM') AS mes,
              COALESCE(SUM((mi->>'liters')::numeric), 0)::text AS litros
         FROM production_orders o
         CROSS JOIN LATERAL jsonb_array_elements(o.milk_inputs) mi
         JOIN batches b ON b.id = (mi->>'batchId')::uuid
        WHERE o.status <> 'cancelled' AND b.product_id IS NULL
        GROUP BY 1`,
      [TZ],
    );
    return new Map(rows.map((r) => [r.mes, r.litros]));
  }

  // Costos fijos cargados DE VERDAD por mes: suma de las líneas "COSTOS FIJOS DE PLANTA" de las
  // órdenes cerradas, por el mismo mes que los litros (inicio de la orden). Y cuántas órdenes
  // cerradas con leche cruda NO tienen la línea (cerradas antes de cargar los costos fijos).
  private async cargadoPorMes(m: EntityManager): Promise<{ cargado: Map<string, string>; sinFijo: Map<string, number> }> {
    const rows: { mes: string; cargado: string }[] = await m.query(
      `SELECT to_char(o.started_at AT TIME ZONE $1, 'YYYY-MM') AS mes,
              COALESCE(SUM((l->>'subtotal')::numeric), 0)::text AS cargado
         FROM production_orders o
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.cost_breakdown->'real'->'detalleInsumos', '[]'::jsonb)) l
        WHERE o.status = 'closed' AND l->>'name' = $2
        GROUP BY 1`,
      [TZ, COSTO_FIJO_NOMBRE],
    );
    const sin: { mes: string; n: number }[] = await m.query(
      `SELECT to_char(o.started_at AT TIME ZONE $1, 'YYYY-MM') AS mes, COUNT(*)::int AS n
         FROM production_orders o
        WHERE o.status = 'closed'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.milk_inputs) mi
                        JOIN batches b ON b.id = (mi->>'batchId')::uuid
                       WHERE b.product_id IS NULL AND (mi->>'liters')::numeric > 0)
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(o.cost_breakdown->'real'->'detalleInsumos', '[]'::jsonb)) l
                           WHERE l->>'name' = $2)
        GROUP BY 1`,
      [TZ, COSTO_FIJO_NOMBRE],
    );
    return { cargado: new Map(rows.map((r) => [r.mes, r.cargado])), sinFijo: new Map(sin.map((r) => [r.mes, r.n])) };
  }

  private async manual(m: EntityManager): Promise<string | null> {
    return (await m.getRepository(FixedCostSettingsEntity).findOne({ where: { id: 1 } }))?.litrosNormales ?? null;
  }

  private async inflacion(m: EntityManager): Promise<string> {
    return (await m.getRepository(FixedCostSettingsEntity).findOne({ where: { id: 1 } }))?.inflacionMensual ?? '0.00';
  }

  private async calc(m: EntityManager) {
    const rows = await m.getRepository(FixedCostMonthEntity).find({ order: { month: 'DESC' } });
    const litros = await this.litrosPorMes(m);
    const { cargado, sinFijo } = await this.cargadoPorMes(m);
    const manual = await this.manual(m);
    const inflacion = await this.inflacion(m);
    const actual = mesActual();
    // Tarjeta de arriba: la leche de un mes normal que se usa para el mes actual.
    const { promedio, meses } = promedioLitros(litros, actual);
    const normales: FixedCostsOverview['litrosNormales'] = { valor: manual ?? promedio, promedio, mesesPromedio: meses, manual };

    const dtos: FixedCostMonth[] = rows.map((e) => {
      const L = litros.get(e.month) ?? '0';
      // Gastos del mes (los repartidos entran con su 1ª cuota) + cuotas de meses anteriores.
      const cuotas = cuotasDelMes(e.month, rows);
      const montos = [
        ...e.lines.map((l) => ({ monto: cuotaDe(l.monto, l.repartirEn ?? 1, 1) })),
        ...cuotas.map((c) => ({ monto: c.cuota })),
      ];
      // Se divide por la leche de un mes normal DE ESE MES; sin historia, por la del propio mes.
      const base = baseDelMes(e.litrosBase, manual, litros, e.month) ?? L;
      const infl = e.inflacion ?? '0.00';
      const c = computeFixedCosts(montos, base, infl);
      return {
        month: e.month,
        lines: e.lines,
        cuotas,
        ...c,
        inflacion: infl,
        ...cobertura(c.total, cargado.get(e.month) ?? '0'),
        ordenesSinCostoFijo: sinFijo.get(e.month) ?? 0,
        litros: L,
        litrosBase: base,
        listo: e.listo,
        enUso: false,
        mesCompleto: e.month < actual,
      };
    });
    // En uso: el mes más nuevo marcado LISTO que tenga $/litro. Un mes a medio cargar (faltan
    // facturas) no se usa: se sigue con el último listo. Siempre se suma (no se puede apagar).
    const ultimo = mesEnUso(dtos);
    if (ultimo) ultimo.enUso = true;

    // Para la vista previa de cualquier mes (también uno todavía sin cargar): su base y lo cargado.
    const basePorMes: Record<string, string | null> = {};
    const desde = [...litros.keys(), ...rows.map((r) => r.month), actual].sort()[0]!;
    const guardada = new Map(rows.map((r) => [r.month, r.litrosBase]));
    for (let mes = desde; mes <= actual; mes = sumarMeses(mes, 1)) {
      basePorMes[mes] = baseDelMes(guardada.get(mes) ?? null, manual, litros, mes);
    }
    return { months: dtos, litros, normales, basePorMes, cargado, sinFijo, inflacion };
  }

  private async months(m: EntityManager): Promise<FixedCostMonth[]> {
    return (await this.calc(m)).months;
  }

  // Lo usa el cierre de cada elaboración. null = todavía no hay ningún mes cargado.
  async vigente(m: EntityManager): Promise<CostoFijoVigente | null> {
    const uso = (await this.months(m)).find((d) => d.enUso);
    return uso ? { month: uso.month, costoPorLitro: uso.costoPorLitro! } : null;
  }

  async overview(): Promise<FixedCostsOverview> {
    const { months, litros, normales, basePorMes, cargado, sinFijo, inflacion } = await this.calc(this.ds.manager);
    const uso = months.find((d) => d.enUso);
    const tipos = await this.ds.getRepository(FixedCostTypeEntity).find({ order: { nombre: 'ASC' } });
    return {
      months,
      tipos: tipos.map((t) => ({ id: t.id, nombre: t.nombre, campos: t.campos, variable: t.variable })),
      enUso: uso ? { month: uso.month, costoPorLitro: uso.costoPorLitro! } : null,
      litrosPorMes: Object.fromEntries(litros),
      basePorMes,
      cargadoPorMes: Object.fromEntries(cargado),
      sinCostoFijoPorMes: Object.fromEntries(sinFijo),
      mesActual: mesActual(),
      litrosNormales: normales,
      inflacion,
    };
  }

  // La primera vez que se carga un mes queda guardada su leche de un mes normal: así su $/litro
  // no cambia cuando pasan los meses. Editarlo después mantiene la base guardada.
  async save(month: string, lines: FixedCostLine[]): Promise<FixedCostsOverview> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(FixedCostMonthEntity);
      const prev = await repo.findOne({ where: { month } });
      const litrosBase = prev?.litrosBase ?? baseDelMes(null, await this.manual(m), await this.litrosPorMes(m), month);
      const inflacion = prev ? prev.inflacion : await this.inflacion(m);
      await repo.save({ month, lines, litrosBase, inflacion });
    });
    return this.overview();
  }

  // Marcar un mes como terminado (listo = se empieza a usar) o volver a abrirlo. No se puede
  // marcar listo un mes sin gastos o con facturas pendientes: se usaría un $/litro incompleto.
  async setListo(month: string, listo: boolean): Promise<FixedCostsOverview> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(FixedCostMonthEntity);
      const row = await repo.findOne({ where: { month } });
      if (!row) throw new NotFoundException('Ese mes todavía no tiene gastos guardados.');
      if (listo) {
        if (month > mesActual()) throw new BadRequestException('No se puede confirmar un mes que todavía no empezó.');
        const pend = row.lines.filter((l) => l.pendiente).map((l) => l.tipo);
        if (pend.length) throw new BadRequestException(`Falta la factura de ${pend.join(', ')}. Cargala (o tocá "Es el mismo monto") antes de confirmar el mes.`);
        const dto = (await this.calc(m)).months.find((d) => d.month === month)!;
        if (!(Number(dto.total) > 0)) throw new BadRequestException('El mes no tiene gastos: cargalos antes de confirmarlo.');
        if (dto.costoPorLitro == null) throw new BadRequestException('Todavía no hay leche para dividir los gastos de este mes.');
      }
      row.listo = listo;
      await repo.save(row);
    });
    return this.overview();
  }

  // Cambia la leche de un mes normal (null = volver al promedio de los últimos 12 meses).
  // Solo afecta al mes más nuevo cargado (el que se usa) y a los que vengan: los meses viejos
  // quedan con la base con que se usaron. Antes se les guarda la base a los que no la tenían.
  async setLitrosNormales(litros: number | null): Promise<FixedCostsOverview> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(FixedCostMonthEntity);
      const rows = await repo.find({ order: { month: 'DESC' } });
      const L = await this.litrosPorMes(m);
      const manualViejo = await this.manual(m);
      for (const r of rows.slice(1)) {
        if (r.litrosBase == null) {
          r.litrosBase = baseDelMes(null, manualViejo, L, r.month);
          await repo.save(r);
        }
      }
      const nuevo = litros == null ? null : String(litros);
      await m.getRepository(FixedCostSettingsEntity).save({ id: 1, litrosNormales: nuevo });
      if (rows[0]) {
        rows[0].litrosBase = baseDelMes(null, nuevo, L, rows[0].month);
        await repo.save(rows[0]);
      }
    });
    return this.overview();
  }

  // Cambia el ajuste por inflación (% por mes). Se aplica al mes en uso y a los más nuevos (los
  // que todavía no se usaron); los meses que ya se usaron quedan con el % con que se usaron.
  async setInflacion(porcentaje: number): Promise<FixedCostsOverview> {
    await this.ds.transaction(async (m) => {
      const nuevo = porcentaje.toFixed(2);
      const uso = (await this.calc(m)).months.find((d) => d.enUso);
      const repo = m.getRepository(FixedCostMonthEntity);
      for (const r of await repo.find()) {
        if (!uso || r.month >= uso.month) {
          r.inflacion = nuevo;
          await repo.save(r);
        } else if (r.inflacion == null) {
          r.inflacion = '0.00';
          await repo.save(r);
        }
      }
      const settings = m.getRepository(FixedCostSettingsEntity);
      const s = (await settings.findOne({ where: { id: 1 } })) ?? settings.create({ id: 1, litrosNormales: null });
      s.inflacionMensual = nuevo;
      await settings.save(s);
    });
    return this.overview();
  }

  // --- Tipos de gasto (los arma el dueño) ---------------------------------------------

  private async nombreLibre(nombre: string, exceptId?: string): Promise<void> {
    const otro = await this.ds
      .getRepository(FixedCostTypeEntity)
      .createQueryBuilder('t')
      .where('lower(t.nombre) = lower(:nombre)', { nombre })
      .getOne();
    if (otro && otro.id !== exceptId) throw new ConflictException(`Ya existe un tipo de gasto "${otro.nombre}".`);
  }

  async createType(input: FixedCostTypeInput): Promise<FixedCostType> {
    await this.nombreLibre(input.nombre);
    const t = await this.ds.getRepository(FixedCostTypeEntity).save({ nombre: input.nombre, campos: input.campos, variable: input.variable });
    return { id: t.id, nombre: t.nombre, campos: t.campos, variable: t.variable };
  }

  // Cambiar un tipo NO toca los meses ya cargados: cada gasto guardó su copia de los campos.
  async updateType(id: string, input: FixedCostTypeInput): Promise<FixedCostType> {
    const repo = this.ds.getRepository(FixedCostTypeEntity);
    const t = await repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Ese tipo de gasto no existe.');
    await this.nombreLibre(input.nombre, id);
    t.nombre = input.nombre;
    t.campos = input.campos;
    t.variable = input.variable;
    await repo.save(t);
    return { id: t.id, nombre: t.nombre, campos: t.campos, variable: t.variable };
  }

  async removeType(id: string): Promise<{ deleted: true }> {
    const res = await this.ds.getRepository(FixedCostTypeEntity).delete({ id });
    if (!res.affected) throw new NotFoundException('Ese tipo de gasto no existe.');
    return { deleted: true };
  }
}
