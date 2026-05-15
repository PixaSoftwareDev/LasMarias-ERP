import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { BatchEntity } from '../batches/batch.entity';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(MilkReceptionEntity)
    private readonly milk: Repository<MilkReceptionEntity>,
    @InjectRepository(ProductionOrderEntity)
    private readonly production: Repository<ProductionOrderEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>,
    private readonly inventory: InventoryService,
  ) {}

  // KPIs del día (CLAUDE.md §4.9 — dashboard principal).
  async dashboard() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);

    const [milkReceived, receptionsCount, productionsToday, ordersToday, openInvoices, stock] = await Promise.all([
      this.milk
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.liters), 0)', 'total')
        .where('r.received_at BETWEEN :start AND :end', { start, end })
        .andWhere("r.status = 'aceptada'")
        .getRawOne<{ total: string }>(),
      this.milk.count({ where: { receivedAt: Between(start, end) } }),
      this.production.count({ where: { closedAt: Between(start, end), status: 'closed' } }),
      this.orders.count({ where: { takenAt: Between(start, end) } }),
      this.invoices
        .createQueryBuilder('i')
        .select('COALESCE(SUM(i.total - i.paid_amount), 0)', 'pending')
        .addSelect('COUNT(*)', 'count')
        .where("i.status = 'issued'")
        .andWhere('i.total > i.paid_amount')
        .getRawOne<{ pending: string; count: string }>(),
      this.inventory.stockSummary(),
    ]);

    const stockLow = stock.filter((s) => s.alertLevel === 'critical' || s.alertLevel === 'expiring');

    return {
      milkReceivedTodayLiters: Number(milkReceived?.total ?? 0),
      receptionsToday: receptionsCount,
      productionsClosedToday: productionsToday,
      ordersTakenToday: ordersToday,
      openInvoicesCount: Number(openInvoices?.count ?? 0),
      openInvoicesAmount: Number(openInvoices?.pending ?? 0),
      stockAlerts: stockLow.length,
    };
  }

  // Producción por período agrupada por producto.
  async productionByProduct(from: string, to: string) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const rows = await this.production
      .createQueryBuilder('o')
      .leftJoin('o.recipe', 'r')
      .leftJoin('r.product', 'p')
      .select('p.id', 'productId')
      .addSelect('MAX(p.name)', 'productName')
      .addSelect('SUM(o.total_principal_kg)', 'totalKg')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('AVG(o.unit_cost)', 'avgUnitCost')
      .where('o.closed_at BETWEEN :start AND :end', { start, end })
      .andWhere("o.status = 'closed'")
      .groupBy('p.id')
      .getRawMany();
    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      totalKg: Number(r.totalKg ?? 0),
      orderCount: Number(r.orderCount),
      avgUnitCost: Number(r.avgUnitCost ?? 0),
    }));
  }

  // Ventas por canal (tipo de cliente).
  async salesByChannel(from: string, to: string) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const rows = await this.orders
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .select('c.type', 'channel')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('SUM(o.total)', 'totalAmount')
      .where('o.taken_at BETWEEN :start AND :end', { start, end })
      .andWhere("o.status <> 'cancelled'")
      .groupBy('c.type')
      .getRawMany();
    return rows.map((r) => ({
      channel: r.channel,
      orderCount: Number(r.orderCount),
      totalAmount: Number(r.totalAmount ?? 0),
    }));
  }

  // Lotes próximos a vencer (próximos 14 días).
  async expiringBatches() {
    const now = new Date();
    const limit = new Date(); limit.setDate(limit.getDate() + 14);
    const rows = await this.batches
      .createQueryBuilder('b')
      .leftJoin('b.product', 'p')
      .where('b.expiration_date IS NOT NULL')
      .andWhere('b.expiration_date <= :limit', { limit })
      .andWhere("b.status IN ('activo', 'en_proceso')")
      .andWhere('b.remaining_quantity > 0')
      .select('b.id', 'batchId')
      .addSelect('b.code', 'code')
      .addSelect('b.remaining_quantity', 'remaining')
      .addSelect('b.expiration_date', 'expiration')
      .addSelect('p.name', 'productName')
      .orderBy('b.expiration_date', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      batchId: r.batchId,
      code: r.code,
      productName: r.productName,
      remaining: Number(r.remaining),
      expirationDate: r.expiration ? new Date(r.expiration).toISOString() : null,
      daysToExpire: r.expiration
        ? Math.ceil((new Date(r.expiration).getTime() - now.getTime()) / 86_400_000)
        : null,
    }));
  }
}
