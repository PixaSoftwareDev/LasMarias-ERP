import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Cheque recibido (de un cliente) o propio (emitido a un proveedor). En cartera hasta
// que se cobra (impacta el saldo de la cuenta) o se rechaza.
@Entity({ name: 'cheques' })
@Index(['status'])
export class ChequeEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  kind!: 'recibido' | 'propio';

  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'timestamptz', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'en_cartera' })
  status!: 'en_cartera' | 'cobrado' | 'rechazado';

  // Cuenta a la que impacta cuando se cobra/acredita.
  @Column({ type: 'uuid', name: 'account_id', nullable: true })
  accountId!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  counterparty!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;
}
