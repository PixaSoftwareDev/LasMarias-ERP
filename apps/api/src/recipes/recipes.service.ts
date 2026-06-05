import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CreateRecipeInput,
  CreateRecipeVersionInput,
  Recipe,
  RecipeSimulationResult,
  RecipeVersion,
  SimulateRecipeInput,
} from '@lasmarias/shared-schemas';
import { RecipeEntity, RecipeVersionEntity } from './recipe.entity';
import { ProductsService } from '../products/products.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import type { Currency } from '@lasmarias/shared-schemas';
import {
  computeByproducts,
  computeIngredients,
  computeYield,
} from './yield-calculator';

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(RecipeEntity)
    private readonly recipes: Repository<RecipeEntity>,
    @InjectRepository(RecipeVersionEntity)
    private readonly versions: Repository<RecipeVersionEntity>,
    private readonly products: ProductsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<Recipe[]> {
    const rows = await this.recipes.find({
      relations: { product: true, versions: true },
      order: { name: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<Recipe> {
    const r = await this.recipes.findOne({
      where: { id },
      relations: { product: true, versions: true },
    });
    if (!r) throw new NotFoundException(`Receta ${id} no encontrada`);
    return this.toDto(r);
  }

  async create(input: CreateRecipeInput): Promise<Recipe> {
    const product = await this.products.get(input.productId);

    return this.dataSource.transaction(async (manager) => {
      const recipe = manager.getRepository(RecipeEntity).create({
        productId: product.id,
        name: input.name,
        description: input.description ?? null,
        isActive: true,
      });
      const savedRecipe = await manager.getRepository(RecipeEntity).save(recipe);

      const ingredientsWithNames = await this.enrichIngredients(input.initialVersion.ingredients);

      const version = manager.getRepository(RecipeVersionEntity).create({
        recipeId: savedRecipe.id,
        versionNumber: 1,
        baseYieldKgPerLiter: String(input.initialVersion.baseYieldKgPerLiter),
        yieldSensitivityFat: String(input.initialVersion.yieldSensitivityFat ?? 0),
        yieldSensitivityProtein: String(input.initialVersion.yieldSensitivityProtein ?? 0),
        baselineFatPercent: String(input.initialVersion.baselineFatPercent ?? 3.4),
        baselineProteinPercent: String(input.initialVersion.baselineProteinPercent ?? 3.2),
        standardWastePercent: String(input.initialVersion.standardWastePercent ?? 0),
        ingredients: ingredientsWithNames,
        byproducts: input.initialVersion.byproducts ?? [],
        isActive: true,
        notes: input.initialVersion.notes ?? null,
      });
      await manager.getRepository(RecipeVersionEntity).save(version);

      const reloaded = await manager.getRepository(RecipeEntity).findOne({
        where: { id: savedRecipe.id },
        relations: { product: true, versions: true },
      });
      return this.toDto(reloaded!);
    });
  }

  // Crea una versión nueva y desactiva las anteriores (mantiene historial).
  async createVersion(recipeId: string, input: CreateRecipeVersionInput): Promise<RecipeVersion> {
    const recipe = await this.recipes.findOne({
      where: { id: recipeId },
      relations: { versions: true },
    });
    if (!recipe) throw new NotFoundException(`Receta ${recipeId} no encontrada`);

    return this.dataSource.transaction(async (manager) => {
      const versionRepo = manager.getRepository(RecipeVersionEntity);
      await versionRepo.update({ recipeId, isActive: true }, { isActive: false });

      const lastVersion = Math.max(0, ...recipe.versions.map((v) => v.versionNumber));
      const ingredientsWithNames = await this.enrichIngredients(input.ingredients);

      const v = versionRepo.create({
        recipeId,
        versionNumber: lastVersion + 1,
        baseYieldKgPerLiter: String(input.baseYieldKgPerLiter),
        yieldSensitivityFat: String(input.yieldSensitivityFat ?? 0),
        yieldSensitivityProtein: String(input.yieldSensitivityProtein ?? 0),
        baselineFatPercent: String(input.baselineFatPercent ?? 3.4),
        baselineProteinPercent: String(input.baselineProteinPercent ?? 3.2),
        standardWastePercent: String(input.standardWastePercent ?? 0),
        ingredients: ingredientsWithNames,
        byproducts: input.byproducts ?? [],
        isActive: true,
        notes: input.notes ?? null,
      });
      return this.versionToDto(await versionRepo.save(v));
    });
  }

  async simulate(input: SimulateRecipeInput): Promise<RecipeSimulationResult> {
    const recipe = await this.recipes.findOne({
      where: { id: input.recipeId },
      relations: { versions: true },
    });
    if (!recipe) throw new NotFoundException(`Receta ${input.recipeId} no encontrada`);
    const version = recipe.versions.find((v) => v.isActive);
    if (!version) throw new BadRequestException(`La receta "${recipe.name}" no tiene versión activa — creá una versión antes de simular`);

    const yieldResult = computeYield({
      liters: input.liters,
      baseYieldKgPerLiter: Number(version.baseYieldKgPerLiter),
      yieldSensitivityFat: Number(version.yieldSensitivityFat),
      yieldSensitivityProtein: Number(version.yieldSensitivityProtein),
      baselineFatPercent: Number(version.baselineFatPercent),
      baselineProteinPercent: Number(version.baselineProteinPercent),
      standardWastePercent: Number(version.standardWastePercent),
      fatPercent: input.fatPercent,
      proteinPercent: input.proteinPercent,
    });

    const ingredients = computeIngredients(input.liters, yieldResult.expectedYieldKg, version.ingredients);
    const byproducts = computeByproducts(input.liters, yieldResult.expectedYieldKg, version.byproducts);

    return {
      expectedYieldKg: yieldResult.expectedYieldKg,
      appliedYieldKgPerLiter: yieldResult.appliedYieldKgPerLiter,
      ingredients,
      byproducts,
    };
  }

  private async enrichIngredients(
    ingredients: { productId: string; quantity: number; unit: string; basis: string; unitCost?: number; currency?: string }[],
  ) {
    // El costo se carga en la moneda del insumo (ARS/USD/EUR) y se CONGELA en pesos
    // con la cotización del día al crear la versión. La calculadora siempre usa $ (CLAUDE.md §5).
    const when = new Date();
    const enriched = await Promise.all(
      ingredients.map(async (i) => {
        const p = await this.products.get(i.productId);
        const currency = (i.currency as Currency) ?? 'ARS';
        const original = i.unitCost ?? 0;
        const unitCostArs =
          currency === 'ARS'
            ? original
            : Number(await this.exchangeRates.toArs(original, currency, when));
        return {
          productId: i.productId,
          productName: p.name,
          quantity: i.quantity,
          unit: i.unit as 'kg' | 'litro' | 'unidad' | 'gramo',
          basis: i.basis as 'per_liter_milk' | 'per_kg_product' | 'fixed_per_order',
          // Costo unitario congelado en la versión, EN PESOS ($/unidad del insumo). Default 0
          // para tolerar recetas sin costo cargado (CLAUDE.md §4.2).
          unitCost: unitCostArs,
          // Moneda original cargada + monto original (informativo, para mostrar "USD 0,30 ≈ $300").
          currency,
          originalUnitCost: original,
        };
      }),
    );
    return enriched;
  }

  toDto(e: RecipeEntity): Recipe {
    const versions = (e.versions ?? [])
      .map((v) => this.versionToDto(v))
      // Más nueva primero para el historial.
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const active = versions.find((v) => v.isActive);
    return {
      id: e.id,
      productId: e.productId,
      productName: e.product?.name ?? '',
      name: e.name,
      description: e.description ?? undefined,
      isActive: e.isActive,
      activeVersion: active,
      versions,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  versionToDto(v: RecipeVersionEntity): RecipeVersion {
    return {
      id: v.id,
      recipeId: v.recipeId,
      versionNumber: v.versionNumber,
      baseYieldKgPerLiter: Number(v.baseYieldKgPerLiter),
      yieldSensitivityFat: Number(v.yieldSensitivityFat),
      yieldSensitivityProtein: Number(v.yieldSensitivityProtein),
      baselineFatPercent: Number(v.baselineFatPercent),
      baselineProteinPercent: Number(v.baselineProteinPercent),
      standardWastePercent: Number(v.standardWastePercent),
      ingredients: v.ingredients,
      byproducts: v.byproducts,
      isActive: v.isActive,
      notes: v.notes ?? undefined,
      createdAt: v.createdAt.toISOString(),
    };
  }

  async getActiveVersionOrThrow(recipeId: string): Promise<RecipeVersionEntity> {
    const v = await this.versions.findOne({ where: { recipeId, isActive: true } });
    if (!v) throw new BadRequestException(`La receta ${recipeId} no tiene versión activa`);
    return v;
  }
}
