import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { NotificationKind, NotificationSeverity } from '@lasmarias/shared-schemas';

@Entity({ name: 'notifications' })
@Index(['read', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', length: 16 })
  severity!: NotificationSeverity;

  @Column({ type: 'varchar', length: 32 })
  kind!: NotificationKind;

  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
