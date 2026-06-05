import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  CashFlowReport,
  CashMovement,
  CreateCashMovementInput,
} from '@lasmarias/shared-schemas';
import { CashMovementEntity } from './cash-movement.entity';
import { AccountEntity } from './account.entity';
import { AccountsService } from './accounts.service';
import { computeCashFlow, type CashFlowMovement } from './cash-flow.helpers';
import { toXlsx } from '../common/xlsx';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(CashMovementEntity)
    private readonly repo: Repository<CashMovementEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
    private readonly accounts: AccountsService,
  ) {}

  // Carga manual de un movimiento de caja (típicamente un gasto). Si no se indica
  // cuenta, va a la cuenta "Caja" por defecto (CLAUDE.md §6, punto 5).
  async createCashMovement(
    input: CreateCashMovementInput,
    userId: string,
  ): Promise<CashMovement> {
    const accountId = input.accountId ?? (await this.accounts.defaultAccountId());
    const entity = this.repo.create({
      kind: input.kind,
      amount: String(input.amount),
      category: input.category,
      accountId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      referenceType: null,
      referenceId: null,
      notes: input.notes ?? null,
      createdById: userId,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved, await this.accountNames());
  }

  async listCashMovements(from: Date, to: Date): Promise<CashMovement[]> {
    const rows = await this.repo.find({
      where: { occurredAt: Between(from, to) },
      order: { occurredAt: 'DESC' },
    });
    const names = await this.accountNames();
    return rows.map((r) => this.toDto(r, names));
  }

  // Mapa id→nombre de cuenta, para no consultar de a una.
  private async accountNames(): Promise<Map<string, string>> {
    const accounts = await this.accountRepo.find();
    return new Map(accounts.map((a) => [a.id, a.name]));
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

  async exportCashFlowXlsx(from: Date, to: Date, granularity: 'day' | 'month'): Promise<Buffer> {
    const report = await this.cashFlow(from, to, granularity);
    return toXlsx(
      'Flujo de caja',
      [
        { header: 'Período', key: 'periodo' },
        { header: 'Ingresos', key: 'ingresos' },
        { header: 'Egresos', key: 'egresos' },
        { header: 'Neto', key: 'neto' },
      ],
      report.rows.map((r) => ({ periodo: r.period, ingresos: r.income, egresos: r.expense, neto: r.net })),
    );
  }

  private toDto(e: CashMovementEntity, names?: Map<string, string>): CashMovement {
    return {
      id: e.id,
      kind: e.kind,
      amount: Number(e.amount),
      category: e.category,
      accountId: e.accountId,
      accountName: e.accountId ? names?.get(e.accountId) : undefined,
      occurredAt: e.occurredAt.toISOString(),
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      notes: e.notes,
      createdById: e.createdById,
    };
  }
}
