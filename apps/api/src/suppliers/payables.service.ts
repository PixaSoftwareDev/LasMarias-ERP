import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CreatePayableInput,
  Payable,
  PayableStatus,
  RegisterSupplierPaymentInput,
  SupplierBalance,
  SupplierPayment,
} from '@lasmarias/shared-schemas';
import { SupplierEntity } from './supplier.entity';
import { PayableEntity } from './payable.entity';
import { SupplierPaymentEntity } from './supplier-payment.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Estado del comprobante según pagos vs monto (derivado, no persistido).
export function payableStatus(amount: number, paid: number): PayableStatus {
  if (paid + 1e-9 >= amount) return 'pagada';
  if (paid > 1e-9) return 'parcial';
  return 'pendiente';
}

// Cuentas por pagar a proveedores de insumos. Cada comprobante baja con sus pagos;
// cada pago registra un egreso de caja. NO toca la liquidación a tambos (candado).
@Injectable()
export class PayablesService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly suppliers: Repository<SupplierEntity>,
    @InjectRepository(PayableEntity)
    private readonly payables: Repository<PayableEntity>,
    @InjectRepository(SupplierPaymentEntity)
    private readonly payments: Repository<SupplierPaymentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // Saldo por proveedor: Σ comprobantes − Σ pagos, y cuánto está vencido.
  async listBalances(): Promise<SupplierBalance[]> {
    const suppliers = await this.suppliers.find({ where: { isActive: true }, order: { name: 'ASC' } });
    const payables = await this.payables.find();
    const payments = await this.payments.find();

    const paidByPayable = new Map<string, number>();
    for (const p of payments) {
      paidByPayable.set(p.payableId, (paidByPayable.get(p.payableId) ?? 0) + Number(p.amount));
    }

    const now = new Date();
    const owedBy = new Map<string, number>();
    const paidBy = new Map<string, number>();
    const overdueBy = new Map<string, number>();
    for (const pa of payables) {
      const amount = Number(pa.amount);
      const paid = paidByPayable.get(pa.id) ?? 0;
      const balance = amount - paid;
      owedBy.set(pa.supplierId, (owedBy.get(pa.supplierId) ?? 0) + amount);
      paidBy.set(pa.supplierId, (paidBy.get(pa.supplierId) ?? 0) + paid);
      if (balance > 1e-9 && pa.dueDate && pa.dueDate.getTime() < now.getTime()) {
        overdueBy.set(pa.supplierId, (overdueBy.get(pa.supplierId) ?? 0) + balance);
      }
    }

    return suppliers.map((s) => {
      const totalOwed = round2(owedBy.get(s.id) ?? 0);
      const totalPaid = round2(paidBy.get(s.id) ?? 0);
      return {
        supplierId: s.id,
        supplierName: s.name,
        totalOwed,
        totalPaid,
        balance: round2(totalOwed - totalPaid),
        overdue: round2(overdueBy.get(s.id) ?? 0),
      };
    });
  }

  // Lista de comprobantes (opcionalmente de un proveedor), con saldo/estado y pagos.
  async listPayables(supplierId?: string): Promise<Payable[]> {
    const payables = await this.payables.find({
      where: supplierId ? { supplierId } : {},
      relations: { supplier: true },
      order: { occurredAt: 'DESC' },
    });
    const ids = payables.map((p) => p.id);
    const payments = ids.length
      ? await this.payments.find({ order: { occurredAt: 'DESC' } })
      : [];
    const paymentsByPayable = new Map<string, SupplierPaymentEntity[]>();
    for (const p of payments) {
      if (!paymentsByPayable.has(p.payableId)) paymentsByPayable.set(p.payableId, []);
      paymentsByPayable.get(p.payableId)!.push(p);
    }
    return payables.map((pa) => this.toPayableDto(pa, paymentsByPayable.get(pa.id) ?? []));
  }

  async createPayable(input: CreatePayableInput, userId: string): Promise<Payable> {
    const supplier = await this.suppliers.findOne({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    // Vencimiento: el indicado, o el calculado con el plazo del proveedor (null = contado).
    let dueDate: Date | null;
    if (input.dueDate !== undefined) {
      dueDate = input.dueDate ? new Date(input.dueDate) : null;
    } else if (supplier.paymentTermDays != null) {
      dueDate = new Date(occurredAt.getTime() + supplier.paymentTermDays * 24 * 60 * 60 * 1000);
    } else {
      dueDate = null;
    }

    const saved = await this.payables.save(
      this.payables.create({
        supplierId: supplier.id,
        description: input.description,
        amount: String(input.amount),
        occurredAt,
        dueDate,
        referenceType: 'manual',
        referenceId: null,
        createdById: userId,
      }),
    );
    return this.toPayableDto({ ...saved, supplier }, []);
  }

  // Registra un pago aplicado a un comprobante: valida que no exceda el saldo, baja el
  // saldo y crea el egreso de caja (espejo del pago a tambo).
  async registerPayment(input: RegisterSupplierPaymentInput, userId: string): Promise<SupplierPayment> {
    const payable = await this.payables.findOne({
      where: { id: input.payableId },
      relations: { supplier: true },
    });
    if (!payable) throw new NotFoundException('Comprobante no encontrado');

    const priorPaid = (await this.payments.find({ where: { payableId: payable.id } })).reduce(
      (a, p) => a + Number(p.amount),
      0,
    );
    const balance = Number(payable.amount) - priorPaid;
    if (input.amount > balance + 1e-9) {
      throw new BadRequestException(
        `El pago (${round2(input.amount)}) supera el saldo del comprobante (${round2(balance)}).`,
      );
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(SupplierPaymentEntity).save(
        manager.getRepository(SupplierPaymentEntity).create({
          payableId: payable.id,
          supplierId: payable.supplierId,
          amount: String(input.amount),
          occurredAt,
          method: input.method ?? null,
          notes: input.notes ?? null,
          createdById: userId,
        }),
      );
      await manager.getRepository(CashMovementEntity).save(
        manager.getRepository(CashMovementEntity).create({
          kind: 'expense',
          amount: String(input.amount),
          category: 'pago_proveedor',
          occurredAt,
          referenceType: 'supplier_payment',
          referenceId: payment.id,
          notes: `Pago a ${payable.supplier?.name ?? 'proveedor'} — ${payable.description}${input.method ? ` (${input.method})` : ''}`,
          createdById: userId,
        }),
      );
      return this.toPaymentDto(payment);
    });
  }

  private toPayableDto(pa: PayableEntity, payments: SupplierPaymentEntity[]): Payable {
    const amount = Number(pa.amount);
    const paid = round2(payments.reduce((a, p) => a + Number(p.amount), 0));
    return {
      id: pa.id,
      supplierId: pa.supplierId,
      supplierName: pa.supplier?.name ?? '',
      description: pa.description,
      amount: round2(amount),
      paid,
      balance: round2(amount - paid),
      status: payableStatus(amount, paid),
      occurredAt: pa.occurredAt.toISOString(),
      dueDate: pa.dueDate ? pa.dueDate.toISOString() : null,
      referenceType: pa.referenceType,
      referenceId: pa.referenceId,
      payments: payments.map((p) => this.toPaymentDto(p)),
      createdAt: pa.createdAt.toISOString(),
    };
  }

  private toPaymentDto(p: SupplierPaymentEntity): SupplierPayment {
    return {
      id: p.id,
      payableId: p.payableId,
      supplierId: p.supplierId,
      amount: Number(p.amount),
      occurredAt: p.occurredAt.toISOString(),
      method: p.method,
      notes: p.notes,
    };
  }
}
