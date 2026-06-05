import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  Account,
  CreateAccountInput,
  UpdateAccountInput,
} from '@lasmarias/shared-schemas';
import { AccountEntity } from './account.entity';
import { CashMovementEntity } from './cash-movement.entity';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Cuentas de dinero (caja/banco). El saldo se CALCULA: saldo inicial + ingresos − egresos
// de los movimientos de caja de esa cuenta. No se persiste el saldo (evita desincronización).
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(CashMovementEntity)
    private readonly movements: Repository<CashMovementEntity>,
  ) {}

  async list(): Promise<Account[]> {
    const accounts = await this.accounts.find({ order: { name: 'ASC' } });
    const movements = await this.movements.find();
    // Cuenta por defecto: los movimientos sin cuenta (los que generan otros módulos —
    // pagos a tambos/proveedores, cobros contado — y los previos al punto 5) se imputan
    // a "Caja", para que ninguna plata quede sin reflejarse en un saldo.
    const caja = accounts.find((a) => a.name === 'Caja') ?? accounts[0];
    const deltaByAccount = new Map<string, number>();
    for (const m of movements) {
      const accountId = m.accountId ?? caja?.id;
      if (!accountId) continue;
      const delta = (m.kind === 'income' ? 1 : -1) * Number(m.amount);
      deltaByAccount.set(accountId, (deltaByAccount.get(accountId) ?? 0) + delta);
    }
    return accounts.map((a) => this.toDto(a, deltaByAccount.get(a.id) ?? 0));
  }

  async create(input: CreateAccountInput): Promise<Account> {
    const a = this.accounts.create({
      name: input.name,
      kind: input.kind,
      openingBalance: String(input.openingBalance ?? 0),
      isActive: true,
    });
    const saved = await this.accounts.save(a);
    return this.toDto(saved, 0);
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const a = await this.accounts.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Cuenta ${id} no encontrada`);
    if (input.name !== undefined) a.name = input.name;
    if (input.openingBalance !== undefined) a.openingBalance = String(input.openingBalance);
    if (input.isActive !== undefined) a.isActive = input.isActive;
    await this.accounts.save(a);
    const list = await this.list();
    return list.find((x) => x.id === id)!;
  }

  // Id de la cuenta "Caja" por defecto (o la primera cuenta). Crea "Caja" si no hay ninguna.
  async defaultAccountId(): Promise<string> {
    const caja = await this.accounts.findOne({ where: { name: 'Caja' } });
    if (caja) return caja.id;
    const any = await this.accounts.findOne({ where: {}, order: { createdAt: 'ASC' } });
    if (any) return any.id;
    const created = await this.accounts.save(
      this.accounts.create({ name: 'Caja', kind: 'caja', openingBalance: '0', isActive: true }),
    );
    return created.id;
  }

  async nameById(id: string): Promise<string | undefined> {
    const a = await this.accounts.findOne({ where: { id } });
    return a?.name;
  }

  private toDto(a: AccountEntity, delta: number): Account {
    const opening = Number(a.openingBalance);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      openingBalance: round2(opening),
      balance: round2(opening + delta),
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
