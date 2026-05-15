import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateInvoiceFromOrderInput,
  Invoice,
  RecordPaymentInput,
} from '@lasmarias/shared-schemas';
import { InvoiceEntity } from './invoice.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
  ) {}

  async list(): Promise<Invoice[]> {
    const rows = await this.repo.find({
      relations: { client: true },
      order: { issuedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<Invoice> {
    const r = await this.repo.findOne({ where: { id }, relations: { client: true } });
    if (!r) throw new NotFoundException('Comprobante no encontrado');
    return this.toDto(r);
  }

  // Cuentas por cobrar — facturas no totalmente pagas con antigüedad calculada.
  async accountsReceivable() {
    const rows = await this.repo.find({
      where: { status: 'issued' },
      relations: { client: true },
      order: { issuedAt: 'ASC' },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows
      .filter((r) => Number(r.paidAmount) < Number(r.total))
      .map((r) => {
        const due = r.dueDate ? new Date(r.dueDate) : null;
        const daysOverdue = due ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000)) : 0;
        return {
          invoiceId: r.id,
          number: r.number,
          clientName: r.client?.businessName ?? '',
          total: Number(r.total),
          paid: Number(r.paidAmount),
          pending: Number(r.total) - Number(r.paidAmount),
          dueDate: r.dueDate ?? undefined,
          daysOverdue,
        };
      });
  }

  async createFromOrder(input: CreateInvoiceFromOrderInput): Promise<Invoice> {
    const order = await this.orders.findOne({ where: { id: input.salesOrderId } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'delivered' && order.status !== 'in_delivery' && order.status !== 'loaded')
      throw new BadRequestException('Solo se factura un pedido preparado, en reparto o entregado');

    const subtotal = Number(order.total);
    const tax = Math.round(subtotal * (input.taxPercent / 100) * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const number = await this.nextInvoiceNumber();

    const entity = this.repo.create({
      number,
      clientId: order.clientId,
      salesOrderId: order.id,
      issuedAt: new Date(),
      dueDate: input.dueDate ?? null,
      status: 'issued',
      subtotal: String(subtotal),
      taxAmount: String(tax),
      total: String(total),
      paidAmount: '0',
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async recordPayment(invoiceId: string, input: RecordPaymentInput): Promise<Invoice> {
    const inv = await this.repo.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Comprobante no encontrado');
    if (inv.status === 'cancelled') throw new BadRequestException('No se pueden cobrar comprobantes anulados');
    const newPaid = Number(inv.paidAmount) + input.amount;
    if (newPaid > Number(inv.total)) throw new BadRequestException('El cobro excede el saldo pendiente');
    inv.paidAmount = String(newPaid);
    if (newPaid >= Number(inv.total)) inv.status = 'paid';
    if (input.notes) inv.notes = [inv.notes, `${input.method.toUpperCase()}: ${input.notes}`].filter(Boolean).join(' | ');
    await this.repo.save(inv);
    return this.get(invoiceId);
  }

  private async nextInvoiceNumber() {
    // Formato simple: 0001-NNNNNNNN. Punto de venta 0001 hardcoded.
    const last = await this.repo
      .createQueryBuilder('i')
      .orderBy('i.created_at', 'DESC')
      .getOne();
    let next = 1;
    if (last) {
      const parts = last.number.split('-');
      next = Number(parts[1] ?? '0') + 1;
    }
    return `0001-${String(next).padStart(8, '0')}`;
  }

  toDto(e: InvoiceEntity): Invoice {
    return {
      id: e.id,
      number: e.number,
      clientId: e.clientId,
      clientName: e.client?.businessName ?? '',
      salesOrderId: e.salesOrderId ?? undefined,
      issuedAt: e.issuedAt.toISOString(),
      dueDate: e.dueDate ?? undefined,
      status: e.status,
      subtotal: Number(e.subtotal),
      taxAmount: Number(e.taxAmount),
      total: Number(e.total),
      paidAmount: Number(e.paidAmount),
      notes: e.notes ?? undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
