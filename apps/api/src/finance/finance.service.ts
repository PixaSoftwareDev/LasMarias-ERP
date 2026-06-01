import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  CashFlowReport,
  CashMovement,
  CreateCashMovementInput,
} from '@lasmarias/shared-schemas';
import { CashMovementEntity } from './cash-movement.entity';
import { computeCashFlow, type CashFlowMovement } from './cash-flow.helpers';
import { toCsv } from '../common/csv';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly repo: Repository<CashMovementEntity>,
  ) {}

  // Carga manual de un movimiento de caja (típicamente un gasto).
  async createCashMovement(
    input: CreateCashMovementInput,
    userId: string,
  ): Promise<CashMovement> {
    const entity = this.repo.create({
      kind: input.kind,
      amount: String(input.amount),
      category: input.category,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      referenceType: null,
      referenceId: null,
      notes: input.notes ?? null,
      createdById: userId,
    });
    return this.toDto(await this.repo.save(entity));
  }

  async listCashMovements(from: Date, to: Date): Promise<CashMovement[]> {
    const rows = await this.repo.find({
      where: { occurredAt: Between(from, to) },
      order: { occurredAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  // Flujo de caja agregado (función pura). Bordes de fecha inclusivos.
  async cashFlow(from: Date, to: Date, granularity: 'day' | 'month'): Promise<CashFlowReport> {
    const rows = await this.repo.find({ where: { occurredAt: Between(from, to) } });
    const movements: CashFlowMovement[] = rows.map((r) => ({
      kind: r.kind,
      amount: Number(r.amount),
      occurredAt: r.occurredAt,
    }));
    return computeCashFlow(movements, from, to, granularity);
  }

  async exportCashFlowCsv(from: Date, to: Date, granularity: 'day' | 'month'): Promise<string> {
    const report = await this.cashFlow(from, to, granularity);
    return toCsv(
      report.rows.map((r) => ({
        periodo: r.period,
        ingresos: r.income,
        egresos: r.expense,
        neto: r.net,
      })),
      ['periodo', 'ingresos', 'egresos', 'neto'],
    );
  }

  private toDto(e: CashMovementEntity): CashMovement {
    return {
      id: e.id,
      kind: e.kind,
      amount: Number(e.amount),
      category: e.category,
      occurredAt: e.occurredAt.toISOString(),
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      notes: e.notes,
      createdById: e.createdById,
    };
  }
}
