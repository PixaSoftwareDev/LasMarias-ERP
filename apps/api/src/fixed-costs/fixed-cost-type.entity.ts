import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Tipo de gasto fijo que arma el dueño (Sueldo, Luz, Alquiler…) con los campos que quiera.
// Los campos son solo para identificar el gasto; el monto se carga aparte en cada mes.
@Entity({ name: 'fixed_cost_types' })
export class FixedCostTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  nombre!: string;

  @Column({ type: 'jsonb', default: [] })
  campos!: string[];

  // El monto cambia cada mes (luz, agua): al copiarlo avisa que falta la factura nueva.
  @Column({ type: 'boolean', default: false })
  variable!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
