import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  CashFlowReport,
  CashMovement,
  CreateCashMovementInput,
  ReconcileMovementInput,
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

  async createCashMovement(input: CreateCashMovementInput, userId: string): Promise<CashMovement> {
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
      reconciled: input.reconciled ?? false,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved, await this.accountNames());
  }

  async listCashMovements(from: Date, to: Date, accountId?: string): Promise<CashMovement[]> {
    const where: Record<string, unknown> = { occurredAt: Between(from, to) };
    if (accountId) where.accountId = accountId;
    const rows = await this.repo.find({ where, order: { occurredAt: 'DESC' } });
    const names = await this.accountNames();
    return rows.map((r) => this.toDto(r, names));
  }

  // Movimientos sin conciliar de una cuenta (para la pantalla de conciliación).
  async listUnreconciled(accountId: string): Promise<CashMovement[]> {
    const rows = await this.repo.find({
      where: { accountId, reconciled: false },
      order: { occurredAt: 'DESC' },
    });
    const names = await this.accountNames();
    return rows.map((r) => this.toDto(r, names));
  }

  async reconcileMovement(id: string, input: ReconcileMovementInput): Promise<CashMovement> {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Movimiento ${id} no encontrado`);
    m.reconciled = input.reconciled;
    const saved = await this.repo.save(m);
    return this.toDto(saved, await this.accountNames());
  }

  private async accountNames(): Promise<Map<string, string>> {
    const accounts = await this.accountRepo.find();
    return new Map(accounts.map((a) => [a.id, a.name]));
  }

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
      reconciled: e.reconciled,
    };
  }
}
