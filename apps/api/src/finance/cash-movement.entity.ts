import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CashMovementKind } from '@lasmarias/shared-schemas';

// Movimiento de caja (flujo simple, sin partida doble). amount positivo; el signo lo
// da el kind (income suma, expense resta). Inmutable.
@Entity({ name: 'cash_movements' })
@Index(['occurredAt'])
export class CashMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: CashMovementKind;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: string;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
