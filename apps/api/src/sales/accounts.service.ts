import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  AccountBalance,
  AccountDetail,
  AccountMovement,
  RegisterPaymentInput,
} from '@lasmarias/shared-schemas';
import { AccountMovementEntity } from './account-movement.entity';
import { ClientEntity } from '../clients/client.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { computeReceivable, type ReceivableMovement } from './accounts.helpers';
import { toCsv } from '../common/csv';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountMovementEntity)
    private readonly movements: Repository<AccountMovementEntity>,
    @InjectRepository(ClientEntity)
    private readonly clients: Repository<ClientEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // Saldo por cliente (lista). Calcula con la función pura sobre todos los movimientos.
  async listBalances(): Promise<AccountBalance[]> {
    const clients = await this.clients.find({ order: { businessName: 'ASC' } });
    const allMovements = await this.movements.find();
    const byClient = new Map<string, AccountMovementEntity[]>();
    for (const m of allMovements) {
      const arr = byClient.get(m.clientId) ?? [];
      arr.push(m);
      byClient.set(m.clientId, arr);
    }
    const now = new Date();
    return clients.map((c) => {
      const r = computeReceivable(this.toReceivable(byClient.get(c.id) ?? []), now);
      return {
        clientId: c.id,
        clientName: c.businessName,
        balance: r.balance,
        warnings: r.warnings,
      };
    });
  }

  // Detalle de un cliente: movimientos + saldo + antigüedad por tramos.
  async getDetail(clientId: string): Promise<AccountDetail> {
    const client = await this.clients.findOne({ where: { id: clientId } });
    const rows = await this.movements.find({
      where: { clientId },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    });
    const r = computeReceivable(this.toReceivable(rows), new Date());
    return {
      clientId,
      clientName: client?.businessName ?? '',
      balance: r.balance,
      aging: r.aging,
      movements: rows.map((m) => this.toDto(m)),
      warnings: r.warnings,
    };
  }

  // Registra un cobro: baja saldo (account_movement payment) + ingreso de caja
  // (cash_movement income, categoría 'cobro_cliente') en una sola transacción.
  async registerPayment(input: RegisterPaymentInput, userId: string): Promise<AccountMovement> {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    return this.dataSource.transaction(async (manager) => {
      const payment = manager.getRepository(AccountMovementEntity).create({
        clientId: input.clientId,
        kind: 'payment',
        amount: String(input.amount),
        referenceType: 'payment',
        referenceId: null,
        occurredAt,
        dueDate: null,
        notes: input.notes ?? (input.method ? `Cobro (${input.method})` : null),
        createdById: userId,
      });
      const saved = await manager.getRepository(AccountMovementEntity).save(payment);

      await manager.getRepository(CashMovementEntity).save(
        manager.getRepository(CashMovementEntity).create({
          kind: 'income',
          amount: String(input.amount),
          category: 'cobro_cliente',
          occurredAt,
          referenceType: 'account_movement',
          referenceId: saved.id,
          notes: input.method ? `Cobro (${input.method})` : null,
          createdById: userId,
        }),
      );

      return this.toDto(saved);
    });
  }

  // CSV de saldos por cliente (cuentas corrientes).
  async exportBalancesCsv(): Promise<string> {
    const balances = await this.listBalances();
    return toCsv(
      balances.map((b) => ({
        cliente: b.clientName,
        saldo: b.balance,
      })),
      ['cliente', 'saldo'],
    );
  }

  private toReceivable(rows: AccountMovementEntity[]): ReceivableMovement[] {
    return rows.map((m) => ({
      kind: m.kind,
      amount: Number(m.amount),
      occurredAt: m.occurredAt,
      dueDate: m.dueDate,
    }));
  }

  private toDto(e: AccountMovementEntity): AccountMovement {
    return {
      id: e.id,
      clientId: e.clientId,
      kind: e.kind,
      amount: Number(e.amount),
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      occurredAt: e.occurredAt.toISOString(),
      dueDate: e.dueDate ? e.dueDate.toISOString() : null,
      notes: e.notes,
      createdById: e.createdById,
    };
  }
}
