import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { RecipeByproduct, RecipeIngredient } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';
import { ProductEntity } from '../products/product.entity';

@Entity({ name: 'recipes' })
export class RecipeEntity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => RecipeVersionEntity, (v) => v.recipe)
  versions!: RecipeVersionEntity[];
}

@Entity({ name: 'recipe_versions' })
@Index(['recipeId', 'versionNumber'], { unique: true })
export class RecipeVersionEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'recipe_id' })
  recipeId!: string;

  @ManyToOne(() => RecipeEntity, (r) => r.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipe_id' })
  recipe!: RecipeEntity;

  @Column({ type: 'int', name: 'version_number' })
  versionNumber!: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'base_yield_kg_per_liter' })
  baseYieldKgPerLiter!: string;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'yield_sensitivity_fat', default: '0' })
  yieldSensitivityFat!: string;

  @Column({ type: 'numeric', precision: 10, scale: 4, name: 'yield_sensitivity_protein', default: '0' })
  yieldSensitivityProtein!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, name: 'baseline_fat_percent', default: '3.4' })
  baselineFatPercent!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, name: 'baseline_protein_percent', default: '3.2' })
  baselineProteinPercent!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3, name: 'standard_waste_percent', default: '0' })
  standardWastePercent!: string;

  @Column({ type: 'jsonb', default: [] })
  ingredients!: RecipeIngredient[];

  @Column({ type: 'jsonb', default: [] })
  byproducts!: RecipeByproduct[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
