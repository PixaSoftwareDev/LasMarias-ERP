import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CloseProductionInput,
  Currency,
  OpenProductionInput,
  ProductionMilkInput,
  ProductionOrder,
  ProductionOutput,
  UpdateProductionInput,
} from '@lasmarias/shared-schemas';
import { ProductionOrderEntity } from './production-order.entity';
import { RecipesService } from '../recipes/recipes.service';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { computeByproducts, computeYield } from '../recipes/yield-calculator';
import {
  computeElaborationCost,
  computeElaborationVariance,
  type IngredientCost,
  type PrimaryInput,
} from './elaboration-cost';
import { UsersService } from '../users/users.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

// Leche (o masa) descontada al reservar una orden. Con estos datos el que abre/edita la orden
// registra el movimiento de salida una vez que ya tiene el id de la orden.
type MilkConsumption = { batchId: string; productId: string | null; unit: 'kg' | 'litro' | 'unidad'; liters: number };

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionOrderEntity)
    private readonly orders: Repository<ProductionOrderEntity>,
    private readonly recipes: RecipesService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
    private readonly exchangeRates: ExchangeRatesService,
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

  // Reserva los lotes de materia prima (leche o masa) y calcula las salidas esperadas con la
  // versión activa de la receta. Es la parte común de ABRIR y EDITAR una orden. Desde el pedido
  // del dueño (jul 2026) la reserva SÍ DESCUENTA el stock del silo en el acto: baja el saldo del
  // lote y lo marca en_proceso. El movimiento de salida lo registra quien llama (recordMilkOut),
  // ya con el id de la orden. No corre la calculadora de costo: eso sigue siendo al cerrar.
  private async reserveMilkAndPlan(
    manager: import('typeorm').EntityManager,
    input: OpenProductionInput,
  ) {
    const recipe = await this.recipes.get(input.recipeId);
    const version = recipe.activeVersion;
    if (!version) throw new BadRequestException('La receta no tiene versión activa');

    // Una orden puede consumir leche de VARIOS silos para llegar a los litros que necesita:
    // cada lote entra con su propio costo/litro y la calculadora los suma (elaboration-cost.ts).
    // Como ahora la reserva descuenta el saldo real, el disponible es directamente
    // batch.remainingQuantity: lo que otras órdenes ya reservaron ya está descontado, así que no
    // hace falta la vieja cuenta de "comprometido por otras órdenes abiertas".
    const milkInputs: ProductionMilkInput[] = [];
    const consumed: MilkConsumption[] = [];
    let totalLiters = 0;
    for (const mi of input.milkInputs) {
      const batch = await manager.getRepository(BatchEntity).findOne({ where: { id: mi.batchId } });
      if (!batch) throw new BadRequestException(`Lote de leche ${mi.batchId} no encontrado`);
      if (batch.status !== 'activo' && batch.status !== 'en_proceso')
        throw new BadRequestException(`El lote ${batch.code} no está disponible`);
      const available = Number(batch.remainingQuantity);
      if (available < mi.liters)
        throw new BadRequestException(
          `El lote ${batch.code} no tiene suficiente: pide ${mi.liters}, queda ${batch.remainingQuantity}`,
        );
      milkInputs.push({ batchId: batch.id, batchCode: batch.code, liters: mi.liters });
      consumed.push({ batchId: batch.id, productId: batch.productId, unit: batch.unit, liters: mi.liters });
      totalLiters += mi.liters;
      // Descontar el stock del silo YA (reserva = consumo): baja el saldo y marca en_proceso
      // mientras la orden esté abierta; agotado si el lote quedó en cero.
      const remaining = Math.round((available - mi.liters) * 1000) / 1000;
      batch.remainingQuantity = String(remaining);
      batch.status = remaining === 0 ? 'agotado' : 'en_proceso';
      await manager.getRepository(BatchEntity).save(batch);
    }

    // Sin rendimiento esperado, la salida esperada queda en 0 (se conoce al cerrar).
    const yieldResult = computeYield({
      liters: totalLiters,
      baseYieldKgPerLiter: version.baseYieldKgPerLiter ?? 0,
      yieldSensitivityFat: version.yieldSensitivityFat,
      yieldSensitivityProtein: version.yieldSensitivityProtein,
      baselineFatPercent: version.baselineFatPercent,
      baselineProteinPercent: version.baselineProteinPercent,
      standardWastePercent: version.standardWastePercent,
    });
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

    return { recipe, version, milkInputs, expectedOutputs, totalLiters, consumed };
  }

  // Registra el movimiento de salida de la leche/masa reservada, ya con el id de la orden. Estos
  // movimientos son los que después usa reverseClosedOrderEffects/releaseReservedMilk para
  // devolver el stock si la orden se edita o se borra.
  private async recordMilkOut(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
    consumed: MilkConsumption[],
  ): Promise<void> {
    const repo = manager.getRepository(InventoryMovementEntity);
    for (const c of consumed) {
      await repo.save(
        repo.create({
          batchId: c.batchId,
          productId: c.productId,
          type: 'out',
          reason: 'production',
          quantity: String(c.liters),
          unit: c.unit,
          referenceType: 'production_order',
          referenceId: order.id,
          createdById: order.operatorId,
        }),
      );
    }
  }

  // Devuelve al silo la leche que una orden ABIERTA tenía reservada (descontada) y borra sus
  // movimientos de salida. Se usa al editar o borrar una orden abierta. Cada orden restaura solo
  // lo suyo (por sus propios movimientos), sin pisar lo que otra orden haya reservado del mismo lote.
  private async releaseReservedMilk(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
  ): Promise<void> {
    const batchRepo = manager.getRepository(BatchEntity);
    const movementRepo = manager.getRepository(InventoryMovementEntity);
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const movements = await movementRepo.find({
      where: { referenceType: 'production_order', referenceId: order.id, type: 'out' },
    });
    for (const m of movements) {
      const batch = await batchRepo.findOne({ where: { id: m.batchId } });
      if (!batch) continue;
      batch.remainingQuantity = String(round3(Number(batch.remainingQuantity) + Number(m.quantity)));
      if (Number(batch.remainingQuantity) > 0 && (batch.status === 'agotado' || batch.status === 'en_proceso'))
        batch.status = 'activo';
      await batchRepo.save(batch);
    }
    if (movements.length > 0) await movementRepo.remove(movements);
  }

  async open(input: OpenProductionInput): Promise<ProductionOrder> {
    const operator = await this.users.findById(input.operatorId);

    return this.dataSource.transaction(async (manager) => {
      const plan = await this.reserveMilkAndPlan(manager, input);

      // Generar código de orden de producción: OP-YYYYMMDD-NNNN
      const code = await this.nextOrderCode(manager, new Date(input.startedAt));

      const order = manager.getRepository(ProductionOrderEntity).create({
        code,
        recipeId: plan.recipe.id,
        recipeVersionId: plan.version.id,
        status: 'open',
        startedAt: new Date(input.startedAt),
        operatorId: operator.id,
        milkInputs: plan.milkInputs,
        expectedOutputs: plan.expectedOutputs,
        actualOutputs: [],
        totalMilkLiters: String(plan.totalLiters),
        notes: input.notes ?? null,
        // ingredientes y byproducts ya están en el snapshot de la versión
      });
      const saved = await manager.getRepository(ProductionOrderEntity).save(order);

      // La leche ya se descontó en reserveMilkAndPlan; acá registramos su salida con el id de la orden.
      await this.recordMilkOut(manager, saved, plan.consumed);

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: saved.id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  // Edita una orden (por si se cargó algo mal). Según el estado:
  // - ABIERTA/en curso: la leche ya está descontada (reserva = consumo). Se DEVUELVE al silo la
  //   leche vieja y se reserva la nueva. Simple y seguro; la calculadora no se toca.
  // - CERRADA: ya consumió stock y corrió la calculadora. Se REVIERTE su efecto (con el mismo
  //   guard del borrado: si el producto ya se vendió o se usó en otra elaboración, se rechaza)
  //   y se vuelve a cerrar con los datos nuevos, recalculando el costo. Todo en una transacción.
  async update(id: string, input: UpdateProductionInput): Promise<ProductionOrder> {
    const operator = await this.users.findById(input.operatorId);

    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrderEntity);

      const order = await orderRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException(`Orden de producción ${id} no encontrada`);
      if (order.status === 'cancelled')
        throw new ForbiddenException(`La orden ${order.code} está cancelada y no se puede editar.`);

      const wasClosed = order.status === 'closed';

      // Deshacer el efecto anterior de la orden en el stock, según su estado.
      if (wasClosed) {
        // Cerrada: revierte el consumo de leche/insumos y elimina los lotes producidos (con guard).
        await this.reverseClosedOrderEffects(manager, order);
      } else {
        // Abierta/en curso: la leche estaba reservada (descontada) → se devuelve al silo.
        await this.releaseReservedMilk(manager, order);
      }

      // Reservar los nuevos lotes (descuenta el stock) y recalcular salidas esperadas con la
      // versión activa vigente.
      const plan = await this.reserveMilkAndPlan(manager, input);

      order.recipeId = plan.recipe.id;
      order.recipeVersionId = plan.version.id;
      order.startedAt = new Date(input.startedAt);
      order.operatorId = operator.id;
      order.milkInputs = plan.milkInputs;
      order.expectedOutputs = plan.expectedOutputs;
      order.totalMilkLiters = String(plan.totalLiters);
      order.notes = input.notes ?? null;
      // El código de la orden se conserva (se asignó al abrir); no se regenera aunque cambie la fecha.

      // Registrar la salida de la leche recién reservada (para ambos estados: si más tarde se
      // edita o borra, reverseClosedOrderEffects/releaseReservedMilk la devuelven por estos movimientos).
      await this.recordMilkOut(manager, order, plan.consumed);

      if (wasClosed) {
        // Volver a cerrar con la producción real nueva → recalcula el costo con la calculadora.
        if (!input.actualOutputs || input.actualOutputs.length === 0)
          throw new BadRequestException(
            'Para editar una orden cerrada tenés que cargar la producción real (kg del producto).',
          );
        const recipeEntity = await manager.getRepository(RecipeEntity).findOneByOrFail({ id: order.recipeId });
        const versionEntity = await manager
          .getRepository(RecipeVersionEntity)
          .findOneByOrFail({ id: order.recipeVersionId });
        await this.applyClose(
          manager,
          order,
          {
            actualOutputs: input.actualOutputs,
            warehouseId: input.warehouseId,
            expectedYieldKgPerLiter: input.expectedYieldKgPerLiter,
            notes: input.notes,
          },
          recipeEntity,
          versionEntity,
        );
      } else {
        await orderRepo.save(order);
      }

      const reloaded = await orderRepo.findOne({
        where: { id: order.id },
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

      await this.applyClose(manager, order, input, order.recipe, order.recipeVersion);

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id: order.id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  // Corazón del sistema: consume la materia prima e insumos, corre la calculadora de costo
  // (real vs estándar), crea el/los lote(s) de producto con su costo/kg sellado y marca la
  // orden como cerrada. Lo usan CERRAR y también EDITAR una orden cerrada (tras revertir su
  // efecto anterior). Recibe la receta y la versión a usar como parámetros.
  private async applyClose(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
    input: CloseProductionInput,
    recipe: RecipeEntity,
    version: RecipeVersionEntity,
  ): Promise<void> {
      // --- 1. Descontar la materia prima principal (leche o masa) y recolectar su costo ---
      // primaryInputs alimenta la calculadora: cada lote consumido con su costo unitario.
      // En leche→masa son litros de leche ($/litro); en masa→mozzarella son kg de masa
      // ($/kg) heredados del cierre de la orden anterior vía batch.unitCost.
      const primaryInputs: PrimaryInput[] = [];
      for (const mi of order.milkInputs) {
        const batch = await manager.getRepository(BatchEntity).findOneByOrFail({ id: mi.batchId });
        // Por defecto, el costo del input es el congelado en el lote ($/litro de leche o
        // $/kg de masa producida). EXCEPCIÓN (pedidos #14/#15): si el input es MASA
        // (producto intermedio) con un "precio de masa" cargado a mano, se usa ese precio
        // —valga la masa propia o comprada—, no el costo calculado del lote.
        let unitCost = batch.unitCost ?? '0';
        if (batch.productId) {
          const inputProduct = await manager
            .getRepository(ProductEntity)
            .findOne({ where: { id: batch.productId } });
          if (inputProduct?.category === 'intermedio' && inputProduct.defaultCost != null) {
            unitCost = inputProduct.defaultCost;
          }
        }
        primaryInputs.push({
          name: batch.code,
          quantity: String(mi.liters),
          unitCost,
        });
        // Normalmente la leche/masa YA se descontó del silo al ABRIR la orden (la reserva es
        // consumo) y su salida quedó registrada; al cerrar solo liberamos la marca "en proceso".
        // RETROCOMPAT: las órdenes que quedaron ABIERTAS de antes del cambio no tienen ese descuento
        // ni el movimiento. Si no encontramos su salida para este lote, la descontamos acá al cerrar
        // —con el mismo guard anti-doble-consumo— para no perder la leche.
        const yaDescontada = await manager.getRepository(InventoryMovementEntity).count({
          where: { referenceType: 'production_order', referenceId: order.id, batchId: batch.id, type: 'out' },
        });
        if (yaDescontada === 0) {
          if (Number(batch.remainingQuantity) < mi.liters)
            throw new BadRequestException(
              `El lote ${batch.code} no alcanza para cerrar la orden ${order.code}: pide ${mi.liters} y quedan ${batch.remainingQuantity}. Puede que otra orden ya lo haya consumido.`,
            );
          const remaining = Math.round((Number(batch.remainingQuantity) - mi.liters) * 1000) / 1000;
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
        } else {
          // Orden nueva: el saldo ya bajó al reservar. Solo liberamos la marca "en proceso".
          batch.status = Number(batch.remainingQuantity) > 0 ? 'activo' : 'agotado';
          await manager.getRepository(BatchEntity).save(batch);
        }
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
      // El precio de cada insumo vive en la FICHA del producto (Datos maestros → Productos):
      // al cerrar se usa el precio vigente de la ficha (convertido a $ del día de elaboración
      // si está en USD/EUR). El congelado en la versión de receta queda solo de respaldo,
      // para insumos sin precio en la ficha o sin producto asociado. Así el administrativo
      // actualiza un precio en UN solo lugar y las próximas elaboraciones lo toman solas.
      const ingredients: IngredientCost[] = [];
      for (const ing of version.ingredients) {
        let unitCost = String(ing.unitCost ?? 0);
        if (ing.productId) {
          const ingProduct = await manager
            .getRepository(ProductEntity)
            .findOne({ where: { id: ing.productId } });
          if (ingProduct && ingProduct.defaultCost != null && String(ingProduct.defaultCost) !== '') {
            const currency = (ingProduct.defaultCostCurrency ?? 'ARS') as Currency;
            unitCost =
              currency === 'ARS'
                ? String(ingProduct.defaultCost)
                : String(await this.exchangeRates.toArs(ingProduct.defaultCost, currency, order.startedAt));
          }
        }
        ingredients.push({
          name: ing.productName,
          quantity: String(ing.quantity),
          unitCost,
          basis: ing.basis,
        });
      }

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

      // Estándar: solo si hay rendimiento esperado. Se carga a mano AL CERRAR (pedido #12);
      // si la receta vieja todavía traía uno, se usa como fallback. Sin esperado → solo real.
      const expectedYield =
        input.expectedYieldKgPerLiter ??
        (version.baseYieldKgPerLiter != null ? Number(version.baseYieldKgPerLiter) : null);
      let estandarCost: ReturnType<typeof computeElaborationCost> | null = null;
      let variance: ReturnType<typeof computeElaborationVariance> | null = null;
      if (expectedYield != null) {
        const expectedYieldKg = computeYield({
          liters: totalLiters,
          baseYieldKgPerLiter: expectedYield,
          yieldSensitivityFat: Number(version.yieldSensitivityFat),
          yieldSensitivityProtein: Number(version.yieldSensitivityProtein),
          baselineFatPercent: Number(version.baselineFatPercent),
          baselineProteinPercent: Number(version.baselineProteinPercent),
          standardWastePercent: Number(version.standardWastePercent),
        }).expectedYieldKg;
        const expectedByproducts = computeByproducts(totalLiters, expectedYieldKg, version.byproducts);
        estandarCost = computeElaborationCost({
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
        variance = computeElaborationVariance(estandarCost, realCost);
      }

      // --- 4. Crear el lote de producto, sellando su costo/kg (encadena los dos pasos) ---
      const productionBatch = await manager.getRepository(BatchEntity).save(
        manager.getRepository(BatchEntity).create({
          code: `LM-PP-${order.code.replace('OP-', '')}`,
          productId: principalProductId,
          // La fecha del lote es la fecha de elaboración de la orden (puede ser un día
          // anterior si se cargó atrasada), no el momento en que se cierra en el sistema.
          productionDate: order.startedAt,
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
            productionDate: order.startedAt,
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
            : ing.basis === 'per_1000_liters_milk'
              ? (Number(ing.quantity) * totalLiters) / 1000
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
      await manager.getRepository(ProductionOrderEntity).save(order);
  }

  // Borra una orden deshaciendo su efecto en stock. NO recalcula ningún costo: solo
  // revierte movimientos, así la calculadora queda intacta (CLAUDE.md §5).
  // - Abierta: la leche ya se descontó al reservar → se devuelve al silo y se borra.
  // - Cerrada: se devuelve lo consumido (leche/masa e insumos) y se eliminan los lotes
  //   producidos, PERO solo si están intactos: si ya se vendieron o se usaron en otra
  //   elaboración, se rechaza con un aviso claro (borrar rompería trazabilidad y costos).
  async remove(id: string): Promise<{ deleted: true; code: string }> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrderEntity);

      const order = await orderRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException(`Orden de producción ${id} no encontrada`);

      if (order.status === 'open' || order.status === 'in_progress') {
        // La leche reservada (descontada) vuelve al silo.
        await this.releaseReservedMilk(manager, order);
        await orderRepo.remove(order);
        return { deleted: true as const, code: order.code };
      }

      if (order.status === 'closed') {
        await this.reverseClosedOrderEffects(manager, order);
        await orderRepo.remove(order);
        return { deleted: true as const, code: order.code };
      }

      // Cancelada: no dejó efecto en stock.
      await orderRepo.remove(order);
      return { deleted: true as const, code: order.code };
    });
  }

  // Revierte el efecto en stock de una orden CERRADA: devuelve la leche/masa e insumos que
  // consumió y elimina los lotes que produjo. NO toca la orden en sí — eso lo decide quien
  // llama (borrar la elimina; editar la vuelve a cerrar con datos nuevos). Rechaza si lo
  // producido ya se usó (venta u otra elaboración): revertir ahí rompería la trazabilidad y
  // el costo encadenado de lo que vino después.
  private async reverseClosedOrderEffects(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
  ): Promise<void> {
    const batchRepo = manager.getRepository(BatchEntity);
    const movementRepo = manager.getRepository(InventoryMovementEntity);
    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    const movements = await movementRepo.find({
      where: { referenceType: 'production_order', referenceId: order.id },
    });
    const producedBatchIds = [...new Set(movements.filter((m) => m.type === 'in').map((m) => m.batchId))];

    // Guardia: lo producido tiene que estar intacto (ni vendido ni consumido después).
    for (const batchId of producedBatchIds) {
      const batch = await batchRepo.findOne({ where: { id: batchId } });
      if (!batch) continue;
      const usedElsewhere = await movementRepo
        .createQueryBuilder('m')
        .where('m.batch_id = :batchId', { batchId })
        .andWhere('m.reference_id IS DISTINCT FROM :orderId', { orderId: order.id })
        .getCount();
      if (usedElsewhere > 0 || Number(batch.remainingQuantity) !== Number(batch.initialQuantity)) {
        throw new BadRequestException(
          `No se puede modificar la orden ${order.code}: el lote ${batch.code} ya se usó (venta u otra elaboración). Anulá primero ese movimiento.`,
        );
      }
    }

    // Devolver al stock lo que la orden consumió (leche/masa e insumos por FEFO).
    for (const m of movements) {
      if (m.type !== 'out') continue;
      const batch = await batchRepo.findOne({ where: { id: m.batchId } });
      if (!batch) continue;
      batch.remainingQuantity = String(round3(Number(batch.remainingQuantity) + Number(m.quantity)));
      if (batch.status === 'agotado' && Number(batch.remainingQuantity) > 0) batch.status = 'activo';
      await batchRepo.save(batch);
    }

    if (movements.length > 0) await movementRepo.remove(movements);
    if (producedBatchIds.length > 0) await batchRepo.delete(producedBatchIds);
  }

  // Secuencia atómica por día con pg_advisory_xact_lock (mismo patrón que recepciones).
  // Lock key prefijada con 1 para no colisionar con la de leche.
  // Secuencia = MAX(código del día)+1, no count(): si se borró una orden intermedia,
  // count() repetiría un código ya usado (índice único).
  private async nextOrderCode(manager: import('typeorm').EntityManager, date: Date) {
    const lockKey = 1_00000000 + date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    await manager.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const prefix = `OP-${yyyy}${mm}${dd}-`;
    const row = await manager
      .getRepository(ProductionOrderEntity)
      .createQueryBuilder('o')
      .select('MAX(o.code)', 'max')
      .where('o.code LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const last = row?.max ? Number(row.max.slice(prefix.length)) : 0;
    return `${prefix}${String(last + 1).padStart(4, '0')}`;
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
