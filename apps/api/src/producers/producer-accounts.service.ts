import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  ProducerAccountDetail,
  ProducerBalance,
  ProducerPayment,
  ProducerReceptionLine,
  RegisterProducerPaymentInput,
} from '@lasmarias/shared-schemas';
import { ProducerEntity } from './producer.entity';
import { ProducerPaymentEntity } from './producer-payment.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Cuentas por pagar a tambos. El "debe" se deriva de las recepciones aceptadas
// (litros × precio congelado en el lote); los pagos lo bajan. CLAUDE.md §4 (liquidación simple).
@Injectable()
export class ProducerAccountsService {
  constructor(
    @InjectRepository(ProducerEntity)
    private readonly producers: Repository<ProducerEntity>,
    @InjectRepository(ProducerPaymentEntity)
    private readonly payments: Repository<ProducerPaymentEntity>,
    @InjectRepository(MilkReceptionEntity)
    private readonly receptions: Repository<MilkReceptionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // Importe de una recepción = litros × precio fijo congelado en el lote (batch.unitCost).
  private receptionAmount(r: MilkReceptionEntity): { liters: number; price: number; amount: number } {
    const liters = Number(r.liters);
    const price = r.batch?.unitCost != null ? Number(r.batch.unitCost) : 0;
    return { liters, price, amount: liters * price };
  }

  async listBalances(): Promise<ProducerBalance[]> {
    const producers = await this.producers.find({ where: { isActive: true }, order: { name: 'ASC' } });
    const receptions = await this.receptions.find({ where: { status: 'aceptada' }, relations: { batch: true } });
    const payments = await this.payments.find();

    const chargeBy = new Map<string, number>();
    for (const r of receptions) {
      chargeBy.set(r.producerId, (chargeBy.get(r.producerId) ?? 0) + this.receptionAmount(r).amount);
    }
    const paidBy = new Map<string, number>();
    for (const p of payments) {
      paidBy.set(p.producerId, (paidBy.get(p.producerId) ?? 0) + Number(p.amount));
    }

    return producers.map((p) => {
      const totalReceived = round2(chargeBy.get(p.id) ?? 0);
      const totalPaid = round2(paidBy.get(p.id) ?? 0);
      return {
        producerId: p.id,
        producerName: p.name,
        totalReceived,
        totalPaid,
        balance: round2(totalReceived - totalPaid),
      };
    });
  }

  // Detalle: saldo acumulado total + recepciones y pagos del mes (YYYY-MM) si se filtra.
  async getDetail(producerId: string, month?: string): Promise<ProducerAccountDetail> {
    const producer = await this.producers.findOne({ where: { id: producerId } });
    if (!producer) throw new NotFoundException('Tambo no encontrado');

    const allReceptions = await this.receptions.find({
      where: { producerId, status: 'aceptada' },
      relations: { batch: true },
      order: { receivedAt: 'DESC' },
    });
    const allPayments = await this.payments.find({ where: { producerId }, order: { occurredAt: 'DESC' } });

    const totalCharge = allReceptions.reduce((a, r) => a + this.receptionAmount(r).amount, 0);
    const totalPaid = allPayments.reduce((a, p) => a + Number(p.amount), 0);
    const balance = round2(totalCharge - totalPaid);

    const inMonth = (d: Date) =>
      !month || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;

    const receptions: ProducerReceptionLine[] = allReceptions
      .filter((r) => inMonth(r.receivedAt))
      .map((r) => {
        const { liters, price, amount } = this.receptionAmount(r);
        return {
          receptionId: r.id,
          code: r.code,
          receivedAt: r.receivedAt.toISOString(),
          liters,
          pricePerLiter: price,
          amount: round2(amount),
        };
      });
    const payments = allPayments.filter((p) => inMonth(p.occurredAt)).map((p) => this.toPaymentDto(p));

    return { producerId, producerName: producer.name, balance, receptions, payments };
  }

  // Registra un pago al tambo: baja el saldo + egreso de caja (espejo del cobro de cliente).
  async registerPayment(input: RegisterProducerPaymentInput, userId: string): Promise<ProducerPayment> {
    const producer = await this.producers.findOne({ where: { id: input.producerId } });
    if (!producer) throw new NotFoundException('Tambo no encontrado');
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(ProducerPaymentEntity).save(
        manager.getRepository(ProducerPaymentEntity).create({
          producerId: input.producerId,
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
          category: 'pago_tambo',
          occurredAt,
          referenceType: 'producer_payment',
          referenceId: payment.id,
          notes: `Pago a ${producer.name}${input.method ? ` (${input.method})` : ''}`,
          createdById: userId,
        }),
      );
      return this.toPaymentDto(payment);
    });
  }

  private toPaymentDto(p: ProducerPaymentEntity): ProducerPayment {
    return {
      id: p.id,
      producerId: p.producerId,
      amount: Number(p.amount),
      occurredAt: p.occurredAt.toISOString(),
      method: p.method,
      notes: p.notes,
    };
  }
}
