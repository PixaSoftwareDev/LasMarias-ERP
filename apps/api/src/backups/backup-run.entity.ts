import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Historial de copias de seguridad (una fila por corrida, automática o a mano).
// El archivo .dump vive en disco (BACKUP_DIR); acá queda el resultado y el nombre.
@Entity({ name: 'backup_runs' })
export class BackupRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'varchar', length: 10 })
  status!: 'ok' | 'error';

  @Column({ type: 'varchar', length: 10 })
  trigger!: 'auto' | 'manual';

  @Column({ type: 'varchar', length: 120, name: 'file_name', nullable: true })
  fileName!: string | null;

  // bigint en Postgres llega como string por TypeORM; se convierte a number al exponerlo.
  @Column({ type: 'bigint', name: 'size_bytes', nullable: true })
  sizeBytes!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  // false cuando la rotación ya borró el archivo (la fila queda como historial).
  @Column({ type: 'boolean', name: 'file_available', default: true })
  fileAvailable!: boolean;
}
