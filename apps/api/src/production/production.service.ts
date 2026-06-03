import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CloseProductionInput,
  OpenProductionInput,
  ProductionMilkInput,
  ProductionOrder,
  ProductionOutput,
} from '@lasmarias/shared-schemas';
import { ProductionOrderEntity } from './production-order.entity';
import { RecipesService } from '../recipes/recipes.service';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { computeByproducts, computeIngredients, computeYield } from '../recipes/yield-calculator';
import {
  computeElaborationCost,
  computeElaborationVariance,
  type IngredientCost,
  type PrimaryInput,
} from './elaboration-cost';
import { UsersService } from '../users/users.service';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionOrderEntity)
    private readonly orders: Repository<ProductionOrderEntity>,
    private readonly recipes: RecipesService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<ProductionOrder[]> {
    const rows = await this.orders.find({
      relations: { recipe: true, operator: true },
      order: { startedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<ProductionOrder> {
    const r = await this.orders.findOne({
      where: { id },
      relations: { recipe: true, operator: true },
    });
    if (!r) throw new NotFoundException(`Orden de producción ${id} no encontrada`);
    return this.toDto(r);
  }

  async open(input: OpenProductionInput): Promise<ProductionOrder> {
    const recipe = await this.recipes.get(input.recipeId);
    if (!recipe.activeVersion) throw new BadRequestException('La receta no tiene versión activa');
    const operator = await this.users.findById(input.operatorId);

    return this.dataSource.transaction(async (manager) => {
      // Validar lotes de leche y litros disponibles
      const milkInputs: ProductionMilkInput[] = [];
      let totalLiters = 0;
      for (const mi of input.milkInputs) {
        const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: mi.batchId } });
        if (!batch) throw new BadRequestException(`Lote de leche ${mi.batchId} no encontrado`);
        if (batch.status !== 'activo' && batch.status !== 'en_proceso')
          throw new BadRequestException(`El lote ${batch.code} no está disponible`);
        if (Number(batch.remainingQuantity) < mi.liters)
          throw new BadRequestException(
            `El lote ${batch.code} no tiene suficiente: pide ${mi.liters}, queda ${batch.remainingQuantity}`,
          );
        milkInputs.push({ batchId: batch.id, batchCode: batch.code, liters: mi.liters });
        totalLiters += mi.liters;
        // Marcar lote como en proceso
        batch.status = 'en_proceso';
        await manager.getRepository(BatchEntity).save(batch);
      }

      // Calcular salidas esperadas con la versión activa (ya validamos arriba que existe)
      const version = recipe.activeVersion!;
      const yieldResult = computeYield({
        liters: totalLiters,
        baseYieldKgPerLiter: version.baseYieldKgPerLiter,
        yieldSensitivityFat: version.yieldSensitivityFat,
        yieldSensitivityProtein: version.yieldSensitivityProtein,
        baselineFatPercent: version.baselineFatPercent,
        baselineProteinPercent: version.baselineProteinPercent,
        standardWastePercent: version.standardWastePercent,
      });
      const ingredients = computeIngredients(totalLiters, yieldResult.expectedYieldKg, version.ingredients);
      const byproducts = computeByproducts(totalLiters, yieldResult.expectedYieldKg, version.byproducts);

      const expectedOutputs: ProductionOutput[] = [
        {
          productId: recipe.productId,
          productName: recipe.productName,
          quantity: yieldResult.expectedYieldKg,
          unit: 'kg',
          isPrincipal: true,
        },
        ...byproducts.map((bp) => {
          // Si el subproducto está mapeado a un producto del catálogo (destinationProductId),
          // usamos ese id para que al cerrar genere su propio lote de stock (ej. suero).
          const recipeBp = version.byproducts.find((b) => b.name === bp.name);
          return {
            productId: recipeBp?.destinationProductId ?? recipe.productId,
            productName: bp.name,
            quantity: bp.expectedQuantity,
            unit: bp.unit as 'kg' | 'litro' | 'unidad',
            isPrincipal: false,
          };
        }),
      ];

      // Generar código de orden de producción: OP-YYYYMMDD-NNNN
      const code = await this.nextOrderCode(manager, new Date(input.startedAt));

      const order = manager.getRepository(ProductionOrderEntity).create({
        code,
        recipeId: recipe.id,
        recipeVersionId: version.id,
        status: 'open',
        startedAt: new Date(input.startedAt),
        operatorId: operator.id,
        milkInputs,
        expectedOutputs,
        actualOutputs: [],
        totalMilkLiters: String(totalLiters),
        notes: input.notes ?? null,
        // ingredientes y byproducts ya están en el snapshot de la versión
      });
      const saved = await manager.getRepository(ProductionOrderEntity).save(order);
      // referenciar ingredients en notes informativo — los ingredients están registrados en la versión congelada
      void ingredients;

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: saved.id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  async close(orderId: string, input: CloseProductionInput): Promise<ProductionOrder> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: orderId },
        relations: { recipe: true, operator: true, recipeVersion: true },
      });
      if (!order) throw new NotFoundException(`Orden ${orderId} no encontrada`);
      if (order.status === 'closed') throw new ForbiddenException(`La orden ${order.code} ya está cerrada`);
      if (order.status === 'cancelled') throw new ForbiddenException(`La orden ${order.code} fue cancelada`);

      const recipe = order.recipe;
      const version = order.recipeVersion;

      // --- 1. Descontar la materia prima principal (leche o masa) y recolectar su costo ---
      // primaryInputs alimenta la calculadora: cada lote consumido con su costo unitario.
      // En leche→masa son litros de leche ($/litro); en masa→mozzarella son kg de masa
      // ($/kg) heredados del cierre de la orden anterior vía batch.unitCost.
      const primaryInputs: PrimaryInput[] = [];
      for (const mi of order.milkInputs) {
        const batch = await manager.getRepository(BatchEntity).findOneByOrFail({ id: mi.batchId });
        primaryInputs.push({
          name: batch.code,
          quantity: String(mi.liters),
          unitCost: batch.unitCost ?? '0',
        });
        const remaining = Math.max(0, Number(batch.remainingQuantity) - mi.liters);
        batch.remainingQuantity = String(remaining);
        batch.status = remaining === 0 ? 'agotado' : 'activo';
        await manager.getRepository(BatchEntity).save(batch);
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: batch.id,
            productId: batch.productId,
            type: 'out',
            reason: 'production',
            quantity: String(mi.liters),
            unit: batch.unit,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
      }

      // --- 2. Validar producto principal ---
      const principalProductId = recipe.productId;
      const principalOutput = input.actualOutputs.find(
        (o) => o.isPrincipal && o.productId === principalProductId,
      );
      if (!principalOutput || principalOutput.quantity <= 0)
        throw new BadRequestException(`Tenés que cargar la cantidad producida de ${recipe.name} (producto principal)`);

      // --- 3. Calcular el costo real y estándar con la calculadora de elaboración ---
      const totalLiters = Number(order.totalMilkLiters);
      const ingredients: IngredientCost[] = version.ingredients.map((ing) => ({
        name: ing.productName,
        quantity: String(ing.quantity),
        unitCost: String(ing.unitCost ?? 0),
        basis: ing.basis,
      }));

      // Cantidades reales de subproductos (por nombre, desde lo que carga el operario).
      const byproductActuals: Record<string, number> = {};
      for (const o of input.actualOutputs) {
        if (!o.isPrincipal) {
          const exp = order.expectedOutputs.find((e) => e.productId === o.productId);
          if (exp?.productName) byproductActuals[exp.productName] = o.quantity;
        }
      }

      const realCost = computeElaborationCost({
        mode: 'real',
        litros: String(totalLiters),
        productKg: String(principalOutput.quantity),
        primaryInputs,
        ingredients,
        byproducts: version.byproducts.map((bp) => ({
          name: bp.name,
          quantity: String(byproductActuals[bp.name] ?? 0),
          valorRecupero: bp.referenceValuePerUnit != null ? String(bp.referenceValuePerUnit) : null,
        })),
      });

      // Estándar: mismas entradas, pero con rendimiento y subproductos ESPERADOS de la receta.
      const expectedYieldKg = computeYield({
        liters: totalLiters,
        baseYieldKgPerLiter: Number(version.baseYieldKgPerLiter),
        yieldSensitivityFat: Number(version.yieldSensitivityFat),
        yieldSensitivityProtein: Number(version.yieldSensitivityProtein),
        baselineFatPercent: Number(version.baselineFatPercent),
        baselineProteinPercent: Number(version.baselineProteinPercent),
        standardWastePercent: Number(version.standardWastePercent),
      }).expectedYieldKg;
      const expectedByproducts = computeByproducts(totalLiters, expectedYieldKg, version.byproducts);
      const estandarCost = computeElaborationCost({
        mode: 'estandar',
        litros: String(totalLiters),
        productKg: String(expectedYieldKg),
        primaryInputs,
        ingredients,
        byproducts: version.byproducts.map((bp) => {
          const exp = expectedByproducts.find((e) => e.name === bp.name);
          return {
            name: bp.name,
            quantity: String(exp?.expectedQuantity ?? 0),
            valorRecupero: bp.referenceValuePerUnit != null ? String(bp.referenceValuePerUnit) : null,
          };
        }),
      });
      const variance = computeElaborationVariance(estandarCost, realCost);

      // --- 4. Crear el lote de producto, sellando su costo/kg (encadena los dos pasos) ---
      const productionBatch = await manager.getRepository(BatchEntity).save(
        manager.getRepository(BatchEntity).create({
          code: `LM-PP-${order.code.replace('OP-', '')}`,
          productId: principalProductId,
          productionDate: new Date(),
          initialQuantity: String(principalOutput.quantity),
          remainingQuantity: String(principalOutput.quantity),
          unit: 'kg',
          status: 'activo',
          parentBatchId: order.milkInputs[0]?.batchId ?? null,
          warehouseId: input.warehouseId ?? null,
          unitCost: realCost.costoPorKg, // costo/kg heredable al siguiente paso (masa→mozzarella)
          notes: `Producido en ${order.code}`,
        }),
      );
      await manager.getRepository(InventoryMovementEntity).save(
        manager.getRepository(InventoryMovementEntity).create({
          batchId: productionBatch.id,
          productId: principalProductId,
          type: 'in',
          reason: 'production',
          quantity: String(principalOutput.quantity),
          unit: 'kg',
          referenceType: 'production_order',
          referenceId: order.id,
          createdById: order.operatorId,
        }),
      );

      // --- 4b. Subproductos con producto del catálogo (ej. suero) → generan su lote de stock ---
      const byproductBatch = new Map<string, { id: string; code: string }>();
      let bpIdx = 0;
      for (const o of input.actualOutputs) {
        if (o.isPrincipal || o.quantity <= 0) continue;
        if (o.productId === principalProductId) continue; // sin producto propio: solo descuenta costo
        const bpProduct = await manager.getRepository(ProductEntity).findOne({ where: { id: o.productId } });
        if (!bpProduct) continue;
        bpIdx += 1;
        const bpBatch = await manager.getRepository(BatchEntity).save(
          manager.getRepository(BatchEntity).create({
            code: `LM-SP-${order.code.replace('OP-', '')}-${bpIdx}`,
            productId: o.productId,
            productionDate: new Date(),
            initialQuantity: String(o.quantity),
            remainingQuantity: String(o.quantity),
            unit: bpProduct.unit,
            status: 'activo',
            parentBatchId: productionBatch.id,
            warehouseId: input.warehouseId ?? null,
            unitCost: null, // el valor del subproducto es el de recupero, no un costo de producción
            notes: `Subproducto de ${order.code}`,
          }),
        );
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: bpBatch.id,
            productId: o.productId,
            type: 'in',
            reason: 'production',
            quantity: String(o.quantity),
            unit: bpProduct.unit,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
        byproductBatch.set(o.productId, { id: bpBatch.id, code: bpBatch.code });
      }

      // --- 4c. Descontar insumos del stock por FEFO. No bloquea si falta (solo descuenta lo
      // disponible); los insumos sin stock trackeado (ej. mano de obra, energía) se ignoran. ---
      for (const ing of version.ingredients) {
        const consumed =
          ing.basis === 'per_liter_milk'
            ? Number(ing.quantity) * totalLiters
            : ing.basis === 'per_kg_product'
              ? Number(ing.quantity) * Number(principalOutput.quantity)
              : Number(ing.quantity);
        if (!(consumed > 0)) continue;
        const lots = await manager.getRepository(BatchEntity).find({
          where: { productId: ing.productId, status: 'activo' },
          order: { expirationDate: 'ASC' },
        });
        if (lots.length === 0) continue;
        let toConsume = consumed;
        for (const lot of lots) {
          if (toConsume <= 0) break;
          const avail = Number(lot.remainingQuantity);
          const take = Math.min(avail, toConsume);
          if (take <= 0) continue;
          lot.remainingQuantity = String(avail - take);
          if (Number(lot.remainingQuantity) <= 0) lot.status = 'agotado';
          await manager.getRepository(BatchEntity).save(lot);
          await manager.getRepository(InventoryMovementEntity).save(
            manager.getRepository(InventoryMovementEntity).create({
              batchId: lot.id,
              productId: ing.productId,
              type: 'out',
              reason: 'consumption',
              quantity: String(take),
              unit: lot.unit,
              referenceType: 'production_order',
              referenceId: order.id,
              createdById: order.operatorId,
            }),
          );
          toConsume -= take;
        }
      }

      const actualOutputs: ProductionOutput[] = input.actualOutputs.map((o) => {
        const exp = order.expectedOutputs.find((e) => e.productId === o.productId);
        const batch = o.isPrincipal
          ? { id: productionBatch.id, code: productionBatch.code }
          : byproductBatch.get(o.productId);
        return {
          productId: o.productId,
          productName: exp?.productName ?? '',
          quantity: o.quantity,
          unit: exp?.unit ?? 'kg',
          isPrincipal: o.isPrincipal,
          batchId: batch?.id,
          batchCode: batch?.code,
        };
      });

      // --- 5. Cerrar la orden y persistir el costo ---
      order.status = 'closed';
      order.closedAt = new Date();
      order.actualOutputs = actualOutputs;
      order.totalPrincipalKg = String(principalOutput.quantity);
      order.totalCost = realCost.costoNeto;
      order.unitCost = realCost.costoPorKg;
      order.costBreakdown = { real: realCost, estandar: estandarCost, variance };
      if (input.notes) order.notes = input.notes;
      const saved = await manager.getRepository(ProductionOrderEntity).save(order);

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: saved.id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  // Secuencia atómica por día con pg_advisory_xact_lock (mismo patrón que recepciones).
  // Lock key prefijada con 1 para no colisionar con la de leche.
  private async nextOrderCode(manager: import('typeorm').EntityManager, date: Date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const lockKey = 1_00000000 + date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    await manager.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
    const count = await manager
      .getRepository(ProductionOrderEntity)
      .createQueryBuilder('o')
      .where('o.started_at BETWEEN :start AND :end', { start, end })
      .getCount();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const seq = String(count + 1).padStart(4, '0');
    return `OP-${yyyy}${mm}${dd}-${seq}`;
  }

  toDto(e: ProductionOrderEntity): ProductionOrder {
    return {
      id: e.id,
      code: e.code,
      recipeId: e.recipeId,
      recipeVersionId: e.recipeVersionId,
      recipeName: e.recipe?.name ?? '',
      status: e.status,
      startedAt: e.startedAt.toISOString(),
      closedAt: e.closedAt?.toISOString(),
      operatorId: e.operatorId,
      operatorName: e.operator?.fullName ?? '',
      milkInputs: e.milkInputs,
      expectedOutputs: e.expectedOutputs,
      actualOutputs: e.actualOutputs,
      totalMilkLiters: Number(e.totalMilkLiters),
      totalPrincipalKg: e.totalPrincipalKg ? Number(e.totalPrincipalKg) : undefined,
      totalCost: e.totalCost ? Number(e.totalCost) : undefined,
      unitCost: e.unitCost ? Number(e.unitCost) : undefined,
      costBreakdown: e.costBreakdown ?? undefined,
      notes: e.notes ?? undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
