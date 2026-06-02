import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import Big from 'big.js';
import type { HomeCalendar, HomeCalendarEvent, HomeSummary } from '@lasmarias/shared-schemas';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { AccountMovementEntity } from '../sales/account-movement.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { BatchEntity } from '../batches/batch.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    @InjectRepository(AccountMovementEntity)
    private readonly accountMovements: Repository<AccountMovementEntity>,
    @InjectRepository(CashMovementEntity)
    private readonly cashMovements: Repository<CashMovementEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>,
    @InjectRepository(MilkReceptionEntity)
    private readonly receptions: Repository<MilkReceptionEntity>,
    @InjectRepository(ProductionOrderEntity)
    private readonly production: Repository<ProductionOrderEntity>,
  ) {}

  // Resumen de KPIs comerciales/financieros. Fechas en hora local del servidor.
  async summary(now = new Date()): Promise<HomeSummary> {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    const startOfWeek = this.startOfWeek(now);
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1);
    const in7Days = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Saldo total por cobrar = Σ saldos positivos por cliente (Σcharge − Σpayment − Σcredit_note).
    const allMovements = await this.accountMovements.find();
    const balanceByClient = new Map<string, Big>();
    for (const m of allMovements) {
      const prev = balanceByClient.get(m.clientId) ?? new Big(0);
      const amt = new Big(m.amount);
      balanceByClient.set(m.clientId, m.kind === 'charge' ? prev.plus(amt) : prev.minus(amt));
    }
    let saldoTotal = new Big(0);
    for (const b of balanceByClient.values()) {
      if (b.gt(0)) saldoTotal = saldoTotal.plus(b);
    }

    // Cobros de esta semana (payment).
    const weekPayments = await this.accountMovements.find({
      where: { kind: 'payment', occurredAt: Between(startOfWeek, endOfWeek) },
    });
    const cobrosEstaSemana = weekPayments.reduce((acc, m) => acc.plus(new Big(m.amount)), new Big(0));

    // Despachos de hoy.
    const despachosHoy = await this.orders.count({
      where: { dispatchedAt: Between(startOfDay, endOfDay) },
    });

    // Ventas del mes (Σ total despachos).
    const monthOrders = await this.orders.find({
      where: { dispatchedAt: Between(startOfMonth, endOfMonth) },
      select: { id: true, total: true },
    });
    const ventasMes = monthOrders.reduce((acc, o) => acc.plus(new Big(o.total)), new Big(0));

    // Caja neta del mes (income − expense).
    const monthCash = await this.cashMovements.find({
      where: { occurredAt: Between(startOfMonth, endOfMonth) },
    });
    let cajaNeta = new Big(0);
    for (const c of monthCash) {
      cajaNeta = c.kind === 'income' ? cajaNeta.plus(new Big(c.amount)) : cajaNeta.minus(new Big(c.amount));
    }

    // Lotes activos que vencen en los próximos 7 días.
    const lotesPorVencer = await this.batches.count({
      where: {
        status: 'activo',
        expirationDate: Between(startOfDay, in7Days),
      },
    });

    // --- La planta hoy ---
    // Leche recibida hoy (litros) = Σ litros de recepciones aceptadas de hoy.
    const receptionsToday = await this.receptions.find({
      where: { receivedAt: Between(startOfDay, endOfDay), status: 'aceptada' },
      select: { id: true, liters: true },
    });
    const lecheHoyLitros = receptionsToday.reduce((acc, r) => acc.plus(new Big(r.liters)), new Big(0));

    // Kg producidos hoy = Σ kg de producto principal de órdenes cerradas hoy.
    const closedToday = await this.production.find({
      where: { status: 'closed', closedAt: Between(startOfDay, endOfDay) },
      select: { id: true, totalPrincipalKg: true },
    });
    const kgProducidosHoy = closedToday.reduce(
      (acc, o) => acc.plus(new Big(o.totalPrincipalKg ?? '0')),
      new Big(0),
    );

    return {
      saldoTotalPorCobrar: saldoTotal.round(2).toNumber(),
      cobrosEstaSemana: cobrosEstaSemana.round(2).toNumber(),
      ventasMes: ventasMes.round(2).toNumber(),
      cajaNetaMes: cajaNeta.round(2).toNumber(),
      lecheHoyLitros: lecheHoyLitros.round(1).toNumber(),
      kgProducidosHoy: kgProducidosHoy.round(1).toNumber(),
      despachosHoy,
      lotesPorVencer,
    };
  }

  // Calendario mensual: cobros por vencer (cargos con due_date), vencimientos de lote
  // y despachos del mes indicado (YYYY-MM).
  async calendar(month: string): Promise<HomeCalendar> {
    const parts = month.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1, 0, 0, 0, -1);
    const events: HomeCalendarEvent[] = [];

    // Cargos por vencer (due_date dentro del mes).
    const charges = await this.accountMovements.find({
      where: { kind: 'charge', dueDate: Between(start, end) },
    });
    for (const c of charges) {
      events.push({
        date: this.dateKey(c.dueDate!),
        type: 'cobro',
        label: c.notes ?? 'Cobro por vencer',
        amount: Number(c.amount),
        refId: c.referenceId,
      });
    }

    // Vencimientos de lote.
    const batches = await this.batches.find({
      where: { expirationDate: Between(start, end) },
      relations: { product: true },
    });
    for (const b of batches) {
      events.push({
        date: this.dateKey(b.expirationDate!),
        type: 'vencimiento_lote',
        label: `Vence lote ${b.code}${b.product ? ` (${b.product.name})` : ''}`,
        refId: b.id,
      });
    }

    // El calendario muestra solo lo que VIENE y hay que atender (cobros por vencer y
    // vencimientos de lote). Los despachos ya hechos se ven en Ventas, no acá.

    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { month, events };
  }

  // Lunes como inicio de semana (hora local, a medianoche).
  private startOfWeek(d: Date): Date {
    const day = d.getDay(); // 0 = domingo
    const diff = (day + 6) % 7; // días desde el lunes
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  }

  private dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
