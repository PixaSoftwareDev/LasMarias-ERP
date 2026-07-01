import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  ProductionReportRow,
  ProfitabilityRow,
  ReportGranularity,
  SalesByClientRow,
  SalesByPeriodRow,
  SalesByProductRow,
  YieldReportRow,
} from '@lasmarias/shared-schemas';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { CreditNoteEntity } from '../sales/credit-note.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import {
  aggregateSalesByProduct,
  buildYieldRow,
  computeMargin,
  type CostRow,
  type RevenueRow,
} from './reports.helpers';
import { toXlsx } from '../common/xlsx';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ProductionOrderEntity)
    private readonly productionRepo: Repository<ProductionOrderEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly salesRepo: Repository<SalesOrderEntity>,
    @InjectRepository(CreditNoteEntity)
    private readonly creditNotesRepo: Repository<CreditNoteEntity>,
    @InjectRepository(InventoryMovementEntity)
    private readonly movementsRepo: Repository<InventoryMovementEntity>,
    @InjectRepository(MilkReceptionEntity)
    private readonly receptionsRepo: Repository<MilkReceptionEntity>,
    @InjectRepository(CashMovementEntity)
    private readonly cashRepo: Repository<CashMovementEntity>,
  ) {}

  // Producción agrupada por día o mes sobre órdenes cerradas (closedAt en rango).
  async production(
    from: Date,
    to: Date,
    granularity: ReportGranularity,
  ): Promise<ProductionReportRow[]> {
    const rows = await this.productionRepo
      .createQueryBuilder('o')
      .select(`date_trunc(:granularity, o.closed_at)`, 'period')
      .addSelect('COUNT(*)', 'ordersCount')
      .addSelect('COALESCE(SUM(o.total_milk_liters), 0)', 'totalMilkLiters')
      .addSelect('COALESCE(SUM(o.total_principal_kg), 0)', 'totalPrincipalKg')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .where("o.status = 'closed'")
      .andWhere('o.closed_at BETWEEN :from AND :to', { from, to })
      .groupBy('period')
      .orderBy('period', 'ASC')
      .setParameter('granularity', granularity)
      .getRawMany();

    return rows.map((r) => ({
      period: (r.period instanceof Date ? r.period.toISOString() : String(r.period)),
      ordersCount: Number(r.ordersCount),
      totalMilkLiters: Number(r.totalMilkLiters),
      totalPrincipalKg: Number(r.totalPrincipalKg),
      totalCost: Number(r.totalCost),
    }));
  }

  // Ventas totales por período (día / semana / mes) sobre la fecha de venta (taken_at).
  // Reusa el patrón date_trunc del reporte de producción. 'week' arranca lunes.
  async salesByPeriod(from: Date, to: Date, granularity: ReportGranularity): Promise<SalesByPeriodRow[]> {
    const rows = await this.salesRepo
      .createQueryBuilder('s')
      .select('date_trunc(:granularity, s.taken_at)', 'period')
      .addSelect('COUNT(*)', 'dispatchCount')
      .addSelect('COALESCE(SUM(s.total), 0)', 'total')
      .where('s.taken_at BETWEEN :from AND :to', { from, to })
      .groupBy('period')
      .orderBy('period', 'ASC')
      .setParameter('granularity', granularity)
      .getRawMany();

    return rows.map((r) => ({
      period: r.period instanceof Date ? r.period.toISOString() : String(r.period),
      dispatchCount: Number(r.dispatchCount),
      total: Number(r.total),
    }));
  }

  // Ventas por cliente: Σ total y cantidad de despachos agrupado por cliente.
  async salesByClient(from: Date, to: Date): Promise<SalesByClientRow[]> {
    const rows = await this.salesRepo
      .createQueryBuilder('s')
      .leftJoin('s.client', 'c')
      .select('s.client_id', 'clientId')
      .addSelect('MAX(c.business_name)', 'clientName')
      .addSelect('COUNT(*)', 'dispatchCount')
      .addSelect('COALESCE(SUM(s.total), 0)', 'total')
      .where('s.taken_at BETWEEN :from AND :to', { from, to })
      .groupBy('s.client_id')
      .orderBy('"total"', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      clientId: r.clientId as string,
      clientName: (r.clientName as string) ?? '',
      dispatchCount: Number(r.dispatchCount),
      total: Number(r.total),
    }));
  }

  // Ventas por producto: agregación en memoria sobre las líneas (jsonb) del rango.
  async salesByProduct(from: Date, to: Date): Promise<SalesByProductRow[]> {
    const orders = await this.salesRepo.find({
      where: { dispatchedAt: Between(from, to) },
      select: { id: true, lines: true },
    });
    return aggregateSalesByProduct(orders.map((o) => o.lines ?? []));
  }

  // Rendimiento real vs esperado por orden cerrada. Reusa costBreakdown persistido.
  async yield(from: Date, to: Date): Promise<YieldReportRow[]> {
    const orders = await this.productionRepo.find({
      where: { status: 'closed', closedAt: Between(from, to) },
      relations: { recipe: true },
      order: { closedAt: 'ASC' },
    });

    return orders.map((o) =>
      buildYieldRow({
        orderCode: o.code,
        productName: o.recipe?.name ?? '',
        totalMilkLiters: o.totalMilkLiters,
        totalPrincipalKg: o.totalPrincipalKg,
        costBreakdown: o.costBreakdown,
      }),
    );
  }

  // Rentabilidad por cliente: ingresos (Σ total despachos, neto de NC) − costo de lo
  // despachado (Σ cantidad × unitCost del lote). El cálculo en sí es una función pura.
  async profitability(from: Date, to: Date): Promise<ProfitabilityRow[]> {
    // Ingresos por cliente.
    const revenueRaw = await this.salesRepo
      .createQueryBuilder('s')
      .leftJoin('s.client', 'c')
      .select('s.client_id', 'clientId')
      .addSelect('MAX(c.business_name)', 'clientName')
      .addSelect('COALESCE(SUM(s.total), 0)', 'revenue')
      .where('s.taken_at BETWEEN :from AND :to', { from, to })
      .groupBy('s.client_id')
      .getRawMany();

    // Notas de crédito por cliente (a netear de los ingresos) en el mismo rango.
    const creditRaw = await this.creditNotesRepo
      .createQueryBuilder('cn')
      .select('cn.client_id', 'clientId')
      .addSelect('COALESCE(SUM(cn.total), 0)', 'creditNotes')
      .where('cn.created_at BETWEEN :from AND :to', { from, to })
      .groupBy('cn.client_id')
      .getRawMany();
    const creditByClient = new Map<string, number>(
      creditRaw.map((r) => [r.clientId as string, Number(r.creditNotes)]),
    );

    const revenueRows: RevenueRow[] = revenueRaw.map((r) => ({
      clientId: r.clientId as string,
      clientName: (r.clientName as string) ?? '',
      revenue: Number(r.revenue),
      creditNotes: creditByClient.get(r.clientId as string) ?? 0,
    }));

    // Costo de lo despachado: une movimientos de venta con el cliente del despacho
    // y el unitCost del lote. Lote sin unitCost → unitCost null (se marca, no se asume 0).
    const costRaw = await this.movementsRepo
      .createQueryBuilder('im')
      .innerJoin(SalesOrderEntity, 'so', 'so.id = im.reference_id')
      .leftJoin('im.batch', 'b')
      .select('so.client_id', 'clientId')
      .addSelect('im.quantity', 'quantity')
      .addSelect('b.unit_cost', 'unitCost')
      .where("im.reason = 'sale'")
      .andWhere("im.reference_type = 'sales_order'")
      .andWhere('so.taken_at BETWEEN :from AND :to', { from, to })
      .getRawMany();

    const costRows: CostRow[] = costRaw.map((r) => ({
      clientId: r.clientId as string,
      quantity: r.quantity,
      unitCost: r.unitCost,
    }));

    return computeMargin(revenueRows, costRows);
  }

  // Excel de ventas por cliente (reporte comercial).
  async exportSalesXlsx(from: Date, to: Date): Promise<Buffer> {
    const rows = await this.salesByClient(from, to);
    return toXlsx(
      'Ventas por cliente',
      [
        { header: 'Cliente', key: 'cliente' },
        { header: 'Ventas', key: 'ventas' },
        { header: 'Total', key: 'total' },
      ],
      rows.map((r) => ({ cliente: r.clientName, ventas: r.dispatchCount, total: r.total })),
    );
  }

  // Todos los movimientos de un día (pedido #6): ingresos de leche, producción, ventas y
  // caja (que incluye cobros, pagos y gastos). Una fila por movimiento, con su tipo.
  async exportDailyMovementsXlsx(day: Date): Promise<Buffer> {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    type MovRow = {
      hora: string;
      tipo: string;
      comprobante: string;
      contraparte: string;
      detalle: string;
      cantidad: number | null;
      importe: number | null;
      _ts: number;
    };
    const rows: MovRow[] = [];
    const hhmm = (d: Date) =>
      d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

    // 1) Ingresos de leche.
    const receptions = await this.receptionsRepo.find({ where: { receivedAt: Between(start, end) } });
    for (const r of receptions) {
      rows.push({
        hora: hhmm(r.receivedAt),
        tipo: 'Ingreso de leche',
        comprobante: r.code,
        contraparte: r.producerName,
        detalle: r.remito ? `Remito ${r.remito}` : '',
        cantidad: Number(r.liters),
        importe: null,
        _ts: r.receivedAt.getTime(),
      });
    }

    // 2) Producción (órdenes cerradas ese día).
    const orders = await this.productionRepo.find({
      where: { closedAt: Between(start, end), status: 'closed' },
      relations: { recipe: true },
    });
    for (const o of orders) {
      const ts = o.closedAt ?? o.startedAt;
      rows.push({
        hora: hhmm(ts),
        tipo: 'Producción',
        comprobante: o.code,
        contraparte: o.recipe?.name ?? '',
        detalle: `${Number(o.totalMilkLiters)} L de leche`,
        cantidad: o.totalPrincipalKg != null ? Number(o.totalPrincipalKg) : null,
        importe: o.totalCost != null ? Number(o.totalCost) : null,
        _ts: ts.getTime(),
      });
    }

    // 3) Ventas (despachos).
    const sales = await this.salesRepo.find({
      where: { dispatchedAt: Between(start, end) },
      relations: { client: true },
    });
    for (const s of sales) {
      rows.push({
        hora: hhmm(s.dispatchedAt),
        tipo: 'Venta',
        comprobante: s.code,
        contraparte: s.client?.businessName ?? '',
        detalle: `${s.lines.length} ítem(s)`,
        cantidad: null,
        importe: Number(s.total),
        _ts: s.dispatchedAt.getTime(),
      });
    }

    // 4) Caja: ingresos y egresos (cobros, pagos y gastos ya impactan acá).
    const cash = await this.cashRepo.find({ where: { occurredAt: Between(start, end) } });
    for (const c of cash) {
      rows.push({
        hora: hhmm(c.occurredAt),
        tipo: c.kind === 'income' ? 'Ingreso de caja' : 'Egreso de caja',
        comprobante: '',
        contraparte: '',
        detalle: c.notes ? `${c.category} — ${c.notes}` : c.category,
        cantidad: null,
        importe: c.kind === 'income' ? Number(c.amount) : -Number(c.amount),
        _ts: c.occurredAt.getTime(),
      });
    }

    rows.sort((a, b) => a._ts - b._ts);
    return toXlsx(
      'Movimientos del día',
      [
        { header: 'Hora', key: 'hora' },
        { header: 'Tipo', key: 'tipo' },
        { header: 'Comprobante', key: 'comprobante' },
        { header: 'Contraparte', key: 'contraparte' },
        { header: 'Detalle', key: 'detalle' },
        { header: 'Cantidad', key: 'cantidad' },
        { header: 'Importe', key: 'importe' },
      ],
      rows.map(({ _ts, ...r }) => r),
    );
  }
}
