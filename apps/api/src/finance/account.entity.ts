import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Cuenta de dinero (caja o banco). El saldo se CALCULA (saldo inicial + movimientos),
// no se persiste, para evitar desincronización. CLAUDE.md §6 (finanzas simple).
@Entity({ name: 'accounts' })
export class AccountEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: 'caja' | 'banco';

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'opening_balance', default: '0' })
  openingBalance!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
