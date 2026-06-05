import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Categoría de gasto normalizada (catálogo). Las categorías de los egresos manuales
// salen de acá para evitar texto libre disperso.
@Entity({ name: 'expense_categories' })
export class ExpenseCategoryEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  name!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
