import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  Cheque,
  CreateChequeInput,
  UpdateChequeStatusInput,
} from '@lasmarias/shared-schemas';
import { ChequeEntity } from './cheque.entity';
import { CashMovementEntity } from './cash-movement.entity';
import { AccountsService } from './accounts.service';

// Cheques recibidos/propios. Al pasar a "cobrado" se acreditan: posteamos un movimiento
// de caja en la cuenta (ingreso si es recibido, egreso si es propio) y así impacta el saldo.
@Injectable()
export class ChequesService {
  constructor(
    @InjectRepository(ChequeEntity)
    private readonly cheques: Repository<ChequeEntity>,
    private readonly accounts: AccountsService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<Cheque[]> {
    const rows = await this.cheques.find({ order: { createdAt: 'DESC' } });
    const names = new Map<string, string | undefined>();
    for (const r of rows) {
      if (r.accountId && !names.has(r.accountId)) {
        names.set(r.accountId, await this.accounts.nameById(r.accountId));
      }
    }
    return rows.map((r) => this.toDto(r, r.accountId ? names.get(r.accountId) : undefined));
  }

  async create(input: CreateChequeInput, userId: string): Promise<Cheque> {
    const accountId = input.accountId ?? (await this.accounts.defaultAccountId());
    const saved = await this.cheques.save(
      this.cheques.create({
        kind: input.kind,
        number: input.number,
        amount: String(input.amount),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: 'en_cartera',
        accountId,
        counterparty: input.counterparty ?? null,
        notes: input.notes ?? null,
        createdById: userId,
      }),
    );
    return this.toDto(saved, await this.accounts.nameById(accountId));
  }

  // Cambia el estado. Al pasar a "cobrado" impacta el saldo (movimiento de caja).
  async updateStatus(id: string, input: UpdateChequeStatusInput, userId: string): Promise<Cheque> {
    const cheque = await this.cheques.findOne({ where: { id } });
    if (!cheque) throw new NotFoundException(`Cheque ${id} no encontrado`);
    if (cheque.status === 'cobrado' && input.status !== 'cobrado') {
      throw new BadRequestException('Un cheque ya cobrado no se puede revertir.');
    }
    if (cheque.status === input.status) {
      return this.toDto(cheque, cheque.accountId ? await this.accounts.nameById(cheque.accountId) : undefined);
    }

    const accountId = input.accountId ?? cheque.accountId ?? (await this.accounts.defaultAccountId());

    return this.dataSource.transaction(async (manager) => {
      cheque.status = input.status;
      cheque.accountId = accountId;
      const saved = await manager.getRepository(ChequeEntity).save(cheque);

      // Solo "cobrado" mueve plata. recibido → ingreso; propio → egreso.
      if (input.status === 'cobrado') {
        await manager.getRepository(CashMovementEntity).save(
          manager.getRepository(CashMovementEntity).create({
            kind: cheque.kind === 'recibido' ? 'income' : 'expense',
            amount: String(cheque.amount),
            category: cheque.kind === 'recibido' ? 'cheque_cobrado' : 'cheque_propio',
            accountId,
            occurredAt: new Date(),
            referenceType: 'cheque',
            referenceId: cheque.id,
            notes: `Cheque ${cheque.number}${cheque.counterparty ? ` — ${cheque.counterparty}` : ''}`,
            createdById: userId,
          }),
        );
      }
      return this.toDto(saved, await this.accounts.nameById(accountId));
    });
  }

  private toDto(c: ChequeEntity, accountName?: string): Cheque {
    return {
      id: c.id,
      kind: c.kind,
      number: c.number,
      amount: Number(c.amount),
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      status: c.status,
      accountId: c.accountId,
      accountName,
      counterparty: c.counterparty,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
