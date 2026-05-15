import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// CLAUDE.md §3 — auditoría obligatoria en entidades sensibles.
// Por ahora se insertan manualmente desde services críticos (producción, ventas, liquidaciones).
@Entity({ name: 'audit_logs' })
@Index(['entityType', 'entityId'])
@Index(['createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entityType!: string;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: string; // 'create' | 'update' | 'delete' | 'close' | 'cancel' | ...

  @Column({ type: 'uuid', name: 'actor_id' })
  actorId!: string;

  @Column({ type: 'jsonb', nullable: true })
  diff!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
