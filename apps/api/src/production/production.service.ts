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
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { computeByproducts, computeIngredients, computeYield } from '../recipes/yield-calculator';
import { computeProductionCost } from './cost-calculator';
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
    if (!r) throw new NotFoundException('Orden de producción no encontrada');
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
        ...byproducts.map((bp) => ({
          productId: recipe.productId, // placeholder; los subproductos no siempre son producto del catálogo
          productName: bp.name,
          quantity: bp.expectedQuantity,
          unit: bp.unit as 'kg' | 'litro' | 'unidad',
          isPrincipal: false,
        })),
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
      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.status === 'closed') throw new ForbiddenException('La orden ya está cerrada');
      if (order.status === 'cancelled') throw new ForbiddenException('La orden fue cancelada');

      const recipe = order.recipe;
      const version = order.recipeVersion;

      // Descontar leche de los lotes
      let totalMilkCost = 0; // sin precio de referencia por lote — se queda en 0 hasta que se integre liquidación
      for (const mi of order.milkInputs) {
        const batch = await manager.getRepository(BatchEntity).findOneByOrFail({ id: mi.batchId });
        const remaining = Math.max(0, Number(batch.remainingQuantity) - mi.liters);
        batch.remainingQuantity = String(remaining);
        if (remaining === 0) batch.status = 'agotado';
        else batch.status = 'activo';
        await manager.getRepository(BatchEntity).save(batch);
        // Registrar movimiento de inventario de salida
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: batch.id,
            productId: batch.productId,
            type: 'out',
            reason: 'production',
            quantity: String(mi.liters),
            unit: 'litro',
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
      }

      // Crear lotes de producto principal + registrar entrada
      const principalProductId = recipe.productId;
      const principalOutput = input.actualOutputs.find((o) => o.isPrincipal && o.productId === principalProductId);
      if (!principalOutput || principalOutput.quantity <= 0)
        throw new BadRequestException('Tenés que cargar la cantidad producida del producto principal');

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

      const actualOutputs: ProductionOutput[] = input.actualOutputs.map((o) => ({
        productId: o.productId,
        productName: order.expectedOutputs.find((e) => e.productId === o.productId)?.productName ?? '',
        quantity: o.quantity,
        unit: o.isPrincipal ? 'kg' : 'kg',
        isPrincipal: o.isPrincipal,
        batchId: o.isPrincipal ? productionBatch.id : undefined,
        batchCode: o.isPrincipal ? productionBatch.code : undefined,
      }));

      // Costo
      const byproductActuals: Record<string, number> = {};
      for (const o of input.actualOutputs) {
        if (!o.isPrincipal) {
          const exp = order.expectedOutputs.find((e) => e.productId === o.productId);
          if (exp?.productName) byproductActuals[exp.productName] = o.quantity;
        }
      }
      const cost = computeProductionCost({
        totalMilkCost,
        ingredientsCost: 0, // futuro: leer de movimientos de insumos
        laborCost: 0,
        totalPrincipalKg: principalOutput.quantity,
        byproducts: version.byproducts,
        byproductActualQuantities: byproductActuals,
      });

      order.status = 'closed';
      order.closedAt = new Date();
      order.actualOutputs = actualOutputs;
      order.totalPrincipalKg = String(principalOutput.quantity);
      order.totalCost = String(cost.totalCost);
      order.unitCost = String(cost.unitCost);
      if (input.notes) order.notes = input.notes;
      const saved = await manager.getRepository(ProductionOrderEntity).save(order);

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: saved.id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  private async nextOrderCode(manager: import('typeorm').EntityManager, date: Date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const count = await manager
      .getRepository(ProductionOrderEntity)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
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
      notes: e.notes ?? undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
