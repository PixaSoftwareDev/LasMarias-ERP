import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type {
  ProductionCostBreakdown,
  ProductionMilkInput,
  ProductionOutput,
  ProductionStatus,
} from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'production_orders' })
@Index(['code'], { unique: true })
@Index(['status', 'startedAt'])
export class ProductionOrderEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'uuid', name: 'recipe_id' })
  recipeId!: string;

  @ManyToOne(() => RecipeEntity)
  @JoinColumn({ name: 'recipe_id' })
  recipe!: RecipeEntity;

  @Column({ type: 'uuid', name: 'recipe_version_id' })
  recipeVersionId!: string;

  @ManyToOne(() => RecipeVersionEntity)
  @JoinColumn({ name: 'recipe_version_id' })
  recipeVersion!: RecipeVersionEntity;

  @Column({ type: 'varchar', length: 16 })
  status!: ProductionStatus;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt!: Date | null;

  @Column({ type: 'uuid', name: 'operator_id' })
  operatorId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'operator_id' })
  operator!: UserEntity;

  @Column({ type: 'jsonb', name: 'milk_inputs', default: [] })
  milkInputs!: ProductionMilkInput[];

  @Column({ type: 'jsonb', name: 'expected_outputs', default: [] })
  expectedOutputs!: ProductionOutput[];

  @Column({ type: 'jsonb', name: 'actual_outputs', default: [] })
  actualOutputs!: ProductionOutput[];

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'total_milk_liters', default: '0' })
  totalMilkLiters!: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'total_principal_kg', nullable: true })
  totalPrincipalKg!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_cost', nullable: true })
  totalCost!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 4, name: 'unit_cost', nullable: true })
  unitCost!: string | null;

  // Desglose de costo (real + estándar + desvíos) calculado al cerrar. CLAUDE.md §5.
  @Column({ type: 'jsonb', name: 'cost_breakdown', nullable: true })
  costBreakdown!: ProductionCostBreakdown | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
