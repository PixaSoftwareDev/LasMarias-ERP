import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AccountMovementKind } from '@lasmarias/shared-schemas';

// Movimiento de cuenta corriente del cliente. amount SIEMPRE positivo: el signo lo
// da el kind (charge suma deuda, payment y credit_note la bajan). Inmutable.
@Entity({ name: 'account_movements' })
@Index(['clientId'])
export class AccountMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: AccountMovementKind;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'timestamptz', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
