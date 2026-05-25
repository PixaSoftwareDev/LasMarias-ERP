import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { ReturnableContainerEntity } from './returnable-container.entity';

@Entity({ name: 'returnable_container_movements' })
@Index(['clientId'])
@Index(['movementDate'])
export class ReturnableContainerMovementEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'container_id' })
  containerId!: string;

  @ManyToOne(() => ReturnableContainerEntity)
  @JoinColumn({ name: 'container_id' })
  container!: ReturnableContainerEntity;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'uuid', name: 'sales_order_id', nullable: true })
  salesOrderId!: string | null;

  // Envases que salieron con la entrega
  @Column({ type: 'integer', name: 'quantity_out', default: 0 })
  quantityOut!: number;

  // Envases que volvieron del cliente
  @Column({ type: 'integer', name: 'quantity_in', default: 0 })
  quantityIn!: number;

  @Column({ type: 'date', name: 'movement_date' })
  movementDate!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById!: string | null;
}
