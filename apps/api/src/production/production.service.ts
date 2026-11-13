import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Big from 'big.js';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import type {
  CloseProductionInput,
  Currency,
  OpenProductionInput,
  ProductionMilkInput,
  ProductionOrder,
  ProductionOutput,
  ProductionRecalcPreview,
  SaveProductionProgressInput,
  UpdateProductionInput,
} from '@lasmarias/shared-schemas';
import { COSTO_FIJO_NOMBRE } from '@lasmarias/shared-schemas';
import { ProductionOrderEntity } from './production-order.entity';
import { RecipesService } from '../recipes/recipes.service';
import { BatchEntity } from '../batches/batch.entity';
import { ProductEntity } from '../products/product.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { computeByproducts, computeYield } from '../recipes/yield-calculator';
import type { CostDetailLine, IngredientCost, PrimaryInput } from './elaboration-cost';
import { FixedCostsService } from '../fixed-costs/fixed-costs.service';
import {
  computeOrderCost,
  expectedYieldFromBreakdown,
  fixedCostIngredient,
  primaryInputsFromBreakdown,
} from './order-cost';
import { UsersService } from '../users/users.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { bultosForQuantity } from '../inventory/bultos-allocation';
import { resolveInputCost } from './input-cost';
import { lockBatches, lockBatchesOfProduct, lockDuplicateSignature, lockRow } from '../common/locks';

// Leche (o masa) descontada al reservar una orden. Con estos datos el que abre/edita la orden
// registra el movimiento de salida una vez que ya tiene el id de la orden.
// `bultos` solo aplica cuando el input es masa embolsada; en leche a granel es null.
type MilkConsumption = {
  batchId: string;
  productId: string | null;
  unit: 'kg' | 'litro' | 'unidad';
  liters: number;
  bultos: number | null;
};

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionOrderEntity)
    private readonly orders: Repository<ProductionOrderEntity>,
    private readonly recipes: RecipesService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
    private readonly exchangeRates: ExchangeRatesService,
    // Costos fijos de planta: opcional para que los tests de servicio no lo necesiten.
    @Optional() private readonly fixedCosts?: FixedCostsService,
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
    // ¿Esta orden tiene realmente descontada su leche? Lo dicen sus movimientos de salida.
    // Sin esto, la pantalla de edición no puede distinguir un lote que ESTA orden reservó
    // de uno que quedó en cero porque se lo llevó otra (y mostraba un cartel equivocado).
    const salidas = await this.dataSource.getRepository(InventoryMovementEntity).count({
      where: { referenceType: 'production_order', referenceId: r.id, type: 'out' },
    });
    // Categoría de cada lote de origen (masa, queso para reproceso, crema…), para la edición.
    const dto = this.toDto(r);
    const lotes = dto.milkInputs.length
      ? await this.dataSource.getRepository(BatchEntity).find({
          where: { id: In(dto.milkInputs.map((m) => m.batchId)) },
          relations: { product: true },
        })
      : [];
    const categoria = new Map(lotes.map((b) => [b.id, b.product?.category ?? '']));
    // Cámara del lote principal producido (solo órdenes cerradas): la pantalla de edición
    // la precarga; si no, al guardar el lote se recreaba sin cámara (bug corregido oct 2026).
    const principal = dto.actualOutputs.find((o) => o.isPrincipal && o.batchId);
    const principalBatch = principal?.batchId
      ? await this.dataSource.getRepository(BatchEntity).findOne({ where: { id: principal.batchId } })
      : null;
    return {
      ...dto,
      milkInputs: dto.milkInputs.map((m) => ({ ...m, category: categoria.get(m.batchId) ?? '' })),
      milkReserved: salidas > 0,
      warehouseId: principalBatch?.warehouseId ?? undefined,
    };
  }

  // Reserva los lotes de materia prima (leche o masa) y calcula las salidas esperadas con la
  // versión activa de la receta. Es la parte común de ABRIR y EDITAR una orden. Desde el pedido
  // del dueño (jul 2026) la reserva SÍ DESCUENTA el stock del silo en el acto: baja el saldo del
  // lote y lo marca en_proceso. El movimiento de salida lo registra quien llama (recordMilkOut),
  // ya con el id de la orden. No corre la calculadora de costo: eso sigue siendo al cerrar.
  private async reserveMilkAndPlan(
    manager: import('typeorm').EntityManager,
    input: OpenProductionInput,
    versionId?: string,
  ) {
    const recipe = await this.recipes.get(input.recipeId);
    // Al EDITAR una orden se conserva SU versión de receta congelada (CLAUDE.md §5.1: los
    // lotes viejos conservan su versión). Sin esto, editar una orden vieja la recalculaba
    // en silencio con la receta de hoy. Solo al abrir una orden nueva (o si la edición
    // cambió de receta) se usa la versión activa.
    const version = versionId
      ? (recipe.versions ?? []).find((v) => v.id === versionId)
      : recipe.activeVersion;
    if (!version)
      throw new BadRequestException(
        versionId ? 'No se encontró la versión de receta de esta orden' : 'La receta no tiene versión activa',
      );

    // Una orden puede consumir leche de VARIOS silos para llegar a los litros que necesita:
    // cada lote entra con su propio costo/litro y la calculadora los suma (elaboration-cost.ts).
    // Como ahora la reserva descuenta el saldo real, el disponible es directamente
    // batch.remainingQuantity: lo que otras órdenes ya reservaron ya está descontado, así que no
    // hace falta la vieja cuenta de "comprometido por otras órdenes abiertas".
    // CANDADO: se toman todos los lotes de la orden ANTES de leer un solo saldo. Sin esto,
    // dos aperturas simultáneas leen el mismo saldo y la segunda pisa a la primera (probado:
    // 8 órdenes se llevaron 8.000 L de un lote de 5.000). Con el candado, la segunda espera
    // y lee el saldo ya descontado, así el "no tiene suficiente" de abajo funciona de verdad.
    await lockBatches(manager, input.milkInputs.map((m) => m.batchId));

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
      // Si el input viene embolsado (masa), se consumen también sus bultos, a prorrata de
      // lo que se toma. La leche a granel no tiene bultos → null y esto no hace nada.
      const bultosTomados = bultosForQuantity(mi.liters, available, batch.remainingBultos);
      consumed.push({
        batchId: batch.id,
        productId: batch.productId,
        unit: batch.unit,
        liters: mi.liters,
        bultos: bultosTomados,
      });
      totalLiters += mi.liters;
      // Descontar el stock del silo YA (reserva = consumo): baja el saldo y marca en_proceso
      // mientras la orden esté abierta; agotado si el lote quedó en cero.
      const remaining = Math.round((available - mi.liters) * 1000) / 1000;
      batch.remainingQuantity = String(remaining);
      if (batch.remainingBultos != null && bultosTomados != null)
        batch.remainingBultos = batch.remainingBultos - bultosTomados;
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
          bultos: c.bultos,
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
    // CANDADO antes de devolver saldo: si otra operación está tocando estos lotes, esperamos.
    await lockBatches(manager, movements.map((m) => m.batchId));
    for (const m of movements) {
      const batch = await batchRepo.findOne({ where: { id: m.batchId } });
      if (!batch) continue;
      batch.remainingQuantity = String(round3(Number(batch.remainingQuantity) + Number(m.quantity)));
      // Los bultos vuelven exactamente como salieron (los guarda el movimiento).
      if (m.bultos != null) batch.remainingBultos = (batch.remainingBultos ?? 0) + m.bultos;
      if (Number(batch.remainingQuantity) > 0 && (batch.status === 'agotado' || batch.status === 'en_proceso'))
        batch.status = 'activo';
      await batchRepo.save(batch);
    }
    if (movements.length > 0) await movementRepo.remove(movements);
  }

  // Revierte los lotes de subproducto que "guardar lo de hoy" creó en una orden NO cerrada
  // (sus entradas). Se usa al borrar la orden o al cambiarle la receta. Si el lote ya se usó
  // (la crema ya se pasteurizó o se vendió), se rechaza: borrarlo rompería la trazabilidad.
  private async revertProgressLots(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
  ): Promise<void> {
    const movementRepo = manager.getRepository(InventoryMovementEntity);
    const batchRepo = manager.getRepository(BatchEntity);
    const movements = await movementRepo.find({
      where: { referenceType: 'production_order', referenceId: order.id, type: 'in' },
    });
    if (movements.length === 0) return;
    await lockBatches(manager, movements.map((m) => m.batchId));
    for (const m of movements) {
      const batch = await batchRepo.findOne({ where: { id: m.batchId } });
      if (batch) {
        const consumido = Math.round((Number(batch.initialQuantity) - Number(batch.remainingQuantity)) * 1000) / 1000;
        if (consumido > 0)
          throw new BadRequestException(
            `No se puede: el lote ${batch.code} (guardado sin cerrar en la orden ${order.code}) ya se usó en una venta u otra elaboración. Anulá primero ese movimiento.`,
          );
        await batchRepo.remove(batch);
      }
      await movementRepo.remove(m);
    }
  }

  // Firma de una orden para detectar la doble carga: misma receta + mismos lotes con los
  // mismos litros. La fecha no entra: cargar dos veces la elaboración del mismo día es
  // justamente el error que queremos frenar.
  private static firmaOrden(input: OpenProductionInput): string {
    const lotes = input.milkInputs
      .map((m) => `${m.batchId}:${m.liters}`)
      .sort()
      .join('|');
    return `produccion:${input.recipeId}:${lotes}`;
  }

  async open(input: OpenProductionInput): Promise<ProductionOrder> {
    const operator = await this.users.findById(input.operatorId);

    return this.dataSource.transaction(async (manager) => {
      // Serializa las aperturas IDÉNTICAS: si entran dos juntas, la segunda espera y recién
      // ahí busca el duplicado (si no, ninguna ve a la otra y se cargan las dos).
      await lockDuplicateSignature(manager, ProductionService.firmaOrden(input));

      // Aviso de doble carga: la misma elaboración (receta + lotes + litros) cargada hace
      // pocos minutos. No bloquea de una —puede ser una segunda tina real—: frena y pide
      // confirmar, igual que ventas y recepciones.
      if (!input.confirmDuplicate) {
        const desde = new Date(Date.now() - 15 * 60 * 1000);
        const recientes = await manager.getRepository(ProductionOrderEntity).find({
          where: { recipeId: input.recipeId, createdAt: MoreThanOrEqual(desde) },
        });
        const mia = ProductionService.firmaOrden(input);
        const dup = recientes.find(
          (o) =>
            ProductionService.firmaOrden({
              recipeId: o.recipeId,
              milkInputs: o.milkInputs.map((m) => ({ batchId: m.batchId, liters: m.liters })),
            } as OpenProductionInput) === mia,
        );
        if (dup)
          throw new ConflictException(
            `Recién cargaste esta misma elaboración (${dup.code}): misma receta y los mismos lotes de leche. ` +
              `Si es otra elaboración real, confirmá para cargarla igual.`,
          );
      }

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

      // CANDADO: editar y cerrar/borrar la misma orden a la vez se serializa.
      await lockRow(manager, 'production_orders', id);
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
        // Si cambia la RECETA, lo guardado sin cerrar (la crema) era de la receta anterior:
        // se revierte su lote (con guard si ya se usó) y la orden vuelve a estar abierta.
        if (input.recipeId !== order.recipeId) {
          await this.revertProgressLots(manager, order);
          order.actualOutputs = [];
          if (order.status === 'in_progress') order.status = 'open';
        }
      }

      // Reservar los nuevos lotes (descuenta el stock) y recalcular las salidas esperadas.
      // Si no se cambió de receta, se mantiene la versión congelada de la orden.
      const plan = await this.reserveMilkAndPlan(
        manager,
        input,
        input.recipeId === order.recipeId ? order.recipeVersionId : undefined,
      );

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
            envases: input.envases,
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

  // Guarda lo que YA salió de una orden abierta, SIN cerrarla (pedido del dueño, 29/10/2026).
  // En la planta la crema se desnata el mismo día de la elaboración, pero la masa se pesa recién
  // al día siguiente: antes había que esperar a tener los kg de masa para poder anotar la crema.
  // Acá se guardan solo las cantidades de los SUBPRODUCTOS y la orden pasa a "en curso".
  //
  // Desde el pedido del dueño del 04/11/2026, el subproducto guardado SÍ entra al stock en el
  // acto: genera su lote LM-SP (con costo = valor de recupero, igual que al cerrar), porque la
  // crema se pasteuriza EL MISMO DÍA que se desnata y necesita elegirse como origen de la orden
  // de crema antes de que la masa se cierre. El CIERRE después REUSA ese lote (no crea otro).
  // La calculadora no se toca: el costo de la orden se sigue calculando solo al cerrar.
  async saveProgress(orderId: string, input: SaveProductionProgressInput): Promise<ProductionOrder> {
    return this.dataSource.transaction(async (manager) => {
      // Mismo candado que cerrar/editar: si llega un cierre a la vez, se serializan.
      await lockRow(manager, 'production_orders', orderId);
      const repo = manager.getRepository(ProductionOrderEntity);
      const order = await repo.findOne({
        where: { id: orderId },
        relations: { recipe: true, operator: true, recipeVersion: true },
      });
      if (!order) throw new NotFoundException(`Orden ${orderId} no encontrada`);
      if (order.status === 'closed')
        throw new ForbiddenException(
          `La orden ${order.code} ya está cerrada. Si hay que corregir lo producido, editala.`,
        );
      if (order.status === 'cancelled') throw new ForbiddenException(`La orden ${order.code} fue cancelada`);

      // Solo subproductos: los kg del producto (y de sus otros formatos) se cargan al cerrar,
      // que es cuando se calcula el costo y se generan los lotes de producto.
      const esperados = new Map(order.expectedOutputs.map((o) => [o.productId, o]));
      const principalProductId = order.expectedOutputs.find((o) => o.isPrincipal)?.productId;
      const deseados: { productId: string; quantity: number; bultos?: number }[] = [];
      for (const o of input.outputs) {
        const esperado = esperados.get(o.productId);
        if (!esperado || esperado.isPrincipal)
          throw new BadRequestException(
            'Acá se guardan solo los subproductos (por ejemplo, la crema). Los kg del producto se cargan al cerrar la orden.',
          );
        if (o.quantity <= 0) continue;
        deseados.push(o);
      }

      // Lotes que un "guardar lo de hoy" anterior ya creó para esta orden (sus entradas).
      const movementRepo = manager.getRepository(InventoryMovementEntity);
      const batchRepo = manager.getRepository(BatchEntity);
      const previos = await movementRepo.find({
        where: { referenceType: 'production_order', referenceId: order.id, type: 'in' },
      });
      // CANDADO sobre esos lotes: una venta puede estar consumiéndolos en este momento.
      await lockBatches(manager, previos.map((m) => m.batchId));
      const lotePorProducto = new Map<string, { mov: InventoryMovementEntity; batch: BatchEntity }>();
      for (const m of previos) {
        const b = await batchRepo.findOne({ where: { id: m.batchId } });
        if (b && m.productId) lotePorProducto.set(m.productId, { mov: m, batch: b });
      }

      // Numeración de los lotes LM-SP de esta orden: sigue después del mayor ya creado.
      const base = order.code.replace('OP-', '');
      let nextIdx = 1;
      for (const { batch } of lotePorProducto.values()) {
        const m = batch.code.match(/-(\d+)$/);
        if (m) nextIdx = Math.max(nextIdx, Number(m[1]) + 1);
      }

      const round3 = (n: number) => Math.round(n * 1000) / 1000;
      const outputs: ProductionOutput[] = [];
      for (const o of deseados) {
        const esperado = esperados.get(o.productId)!;
        // Subproducto "sin producto propio" (receta vieja con el productId del principal):
        // solo descuenta costo al cerrar, no tiene lote. Se anota la cantidad y listo.
        if (o.productId === principalProductId) {
          outputs.push({
            productId: o.productId,
            productName: esperado.productName,
            quantity: o.quantity,
            unit: esperado.unit,
            bultos: o.bultos,
            isPrincipal: false,
          });
          continue;
        }

        const previo = lotePorProducto.get(o.productId);
        if (previo) {
          // Re-guardado del mismo día: se AJUSTA el lote existente (no se duplica). Si ya se
          // usó parte (ej: la crema ya se pasteurizó), no se puede bajar de lo consumido.
          lotePorProducto.delete(o.productId);
          const { mov, batch } = previo;
          const consumido = round3(Number(batch.initialQuantity) - Number(batch.remainingQuantity));
          if (o.quantity < consumido)
            throw new BadRequestException(
              `Del lote ${batch.code} ya se usaron ${consumido} ${batch.unit} (venta u otra elaboración): no podés dejarlo en ${o.quantity}.`,
            );
          const bultosConsumidos = (batch.initialBultos ?? 0) - (batch.remainingBultos ?? 0);
          batch.initialQuantity = String(o.quantity);
          batch.remainingQuantity = String(round3(o.quantity - consumido));
          batch.initialBultos = o.bultos ?? null;
          batch.remainingBultos = o.bultos != null ? Math.max(o.bultos - bultosConsumidos, 0) : null;
          batch.status = Number(batch.remainingQuantity) > 0 ? 'activo' : 'agotado';
          await batchRepo.save(batch);
          mov.quantity = String(o.quantity);
          mov.bultos = o.bultos ?? null;
          await movementRepo.save(mov);
          outputs.push({
            productId: o.productId,
            productName: esperado.productName,
            quantity: o.quantity,
            unit: esperado.unit,
            bultos: o.bultos,
            isPrincipal: false,
            batchId: batch.id,
            batchCode: batch.code,
          });
          continue;
        }

        // Lote nuevo: mismo código, costo y regla que el que generaría el cierre (sección 4b
        // de applyClose). Costo del lote = valor de recupero de la receta: lo que se le va a
        // descontar al principal, así la crema entra a la orden siguiente con el MISMO $/kg.
        const recupero = order.recipeVersion?.byproducts?.find(
          (b) => b.destinationProductId === o.productId,
        )?.referenceValuePerUnit;
        const batch = await batchRepo.save(
          batchRepo.create({
            code: `LM-SP-${base}-${nextIdx}`,
            productId: o.productId,
            productionDate: order.startedAt,
            initialQuantity: String(o.quantity),
            remainingQuantity: String(o.quantity),
            initialBultos: o.bultos ?? null,
            remainingBultos: o.bultos ?? null,
            unit: esperado.unit,
            status: 'activo',
            // Todavía no existe el lote de producto principal: cuelga del lote de origen.
            // Al cerrar, applyClose lo recuelga del lote de producto (trazabilidad completa).
            parentBatchId: order.milkInputs[0]?.batchId ?? null,
            unitCost: recupero != null ? String(recupero) : null,
            notes: `Subproducto de ${order.code} (guardado sin cerrar la orden)`,
          }),
        );
        nextIdx += 1;
        await movementRepo.save(
          movementRepo.create({
            batchId: batch.id,
            productId: o.productId,
            type: 'in',
            reason: 'production',
            quantity: String(o.quantity),
            unit: esperado.unit,
            bultos: o.bultos ?? null,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
        outputs.push({
          productId: o.productId,
          productName: esperado.productName,
          quantity: o.quantity,
          unit: esperado.unit,
          bultos: o.bultos,
          isPrincipal: false,
          batchId: batch.id,
          batchCode: batch.code,
        });
      }

      // Lo que estaba guardado y ahora quedó en 0 (o afuera): se revierte, salvo que ya se
      // haya usado — ahí se pide corregir la cantidad en vez de borrarla.
      for (const { mov, batch } of lotePorProducto.values()) {
        const consumido = round3(Number(batch.initialQuantity) - Number(batch.remainingQuantity));
        if (consumido > 0)
          throw new BadRequestException(
            `Del lote ${batch.code} ya se usaron ${consumido} ${batch.unit} (venta u otra elaboración): no podés borrarlo. Corregí la cantidad en vez de dejarla en 0.`,
          );
        await movementRepo.remove(mov);
        await batchRepo.remove(batch);
      }

      order.actualOutputs = outputs;
      // "En curso" = esta orden ya tiene algo anotado. Si se borra todo, vuelve a estar abierta.
      order.status = outputs.length > 0 ? 'in_progress' : 'open';
      if (input.notes !== undefined) order.notes = input.notes || null;
      await repo.save(order);
      return this.toDto(order);
    });
  }

  async close(orderId: string, input: CloseProductionInput): Promise<ProductionOrder> {
    return this.dataSource.transaction(async (manager) => {
      // CANDADO sobre la orden: si llegan dos cierres juntos, el segundo espera y recién
      // entonces lee el estado ya cerrado, así avisa "ya está cerrada" en vez de duplicar
      // el lote de producto o morir con un error genérico.
      await lockRow(manager, 'production_orders', orderId);
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
      let milkLiters = new Big(0); // solo leche cruda (lote sin producto): base de los costos fijos
      // CANDADO sobre los lotes consumidos: el cierre de una orden vieja todavía puede
      // descontar leche (retrocompat), y nadie más puede tocarlos mientras tanto.
      await lockBatches(manager, order.milkInputs.map((m) => m.batchId));
      for (const mi of order.milkInputs) {
        const batch = await manager.getRepository(BatchEntity).findOneByOrFail({ id: mi.batchId });
        // Costo del lote de origen: regla única en input-cost.ts (lote propio; masa con precio
        // manual; lote cargado a mano → ficha → último lote producido → $0).
        const inputProduct = batch.productId
          ? await manager.getRepository(ProductEntity).findOne({ where: { id: batch.productId } })
          : null;
        const { unitCost } = await resolveInputCost(
          {
            batches: manager.getRepository(BatchEntity),
            toArs: (amount, currency, date) => this.exchangeRates.toArs(amount, currency, date),
          },
          batch,
          inputProduct,
          order.startedAt,
        );
        primaryInputs.push({
          name: batch.code,
          quantity: String(mi.liters),
          unitCost,
        });
        if (!batch.productId) milkLiters = milkLiters.plus(String(mi.liters));
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
              `El lote ${batch.code} no alcanza para cerrar la orden ${order.code}: pide ${mi.liters} y quedan ${batch.remainingQuantity}. ` +
                `Puede que otra orden ya lo haya consumido. Editá la orden y elegí un lote con saldo.`,
            );
          const bultosTomados = bultosForQuantity(
            mi.liters,
            Number(batch.remainingQuantity),
            batch.remainingBultos,
          );
          const remaining = Math.round((Number(batch.remainingQuantity) - mi.liters) * 1000) / 1000;
          batch.remainingQuantity = String(remaining);
          if (batch.remainingBultos != null && bultosTomados != null)
            batch.remainingBultos = batch.remainingBultos - bultosTomados;
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
              bultos: bultosTomados,
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

      // --- 2b. Otros formatos de la misma tachada (plancha + cilindro). Son producto, no
      // subproducto: sus kg se suman al principal para el costo/kg y el rendimiento, y cada
      // uno genera su propio lote con el MISMO costo/kg. Tienen que ser de la misma categoría
      // que el principal (queso con queso, masa con masa) y distintos entre sí.
      const principalProduct = await manager.getRepository(ProductEntity).findOne({ where: { id: principalProductId } });
      const formatos: { productId: string; quantity: number; bultos: number | null; product: ProductEntity }[] = [];
      for (const o of input.actualOutputs) {
        if (!o.isFormat || o.isPrincipal) continue;
        if (!(o.quantity > 0)) continue;
        if (o.productId === principalProductId)
          throw new BadRequestException(`${recipe.name} ya es el producto principal: cargá sus kg arriba, no como otro formato.`);
        if (formatos.some((f) => f.productId === o.productId))
          throw new BadRequestException('Cargaste el mismo formato dos veces. Sumá los kg en una sola línea.');
        const fp = await manager.getRepository(ProductEntity).findOne({ where: { id: o.productId } });
        if (!fp) throw new BadRequestException('Uno de los formatos elegidos no existe en Productos.');
        if (principalProduct && fp.category !== principalProduct.category)
          throw new BadRequestException(`${fp.name} no es otro formato de ${recipe.name}: tienen que ser de la misma categoría.`);
        formatos.push({ productId: o.productId, quantity: o.quantity, bultos: o.bultos ?? null, product: fp });
      }
      // Kg totales de producto de la tachada: principal + formatos. Es lo que divide el costo.
      const kgProductoTotal = formatos
        .reduce((acc, f) => acc.plus(f.quantity), new Big(principalOutput.quantity))
        .toString();

      // --- 3. Calcular el costo real y estándar con la calculadora de elaboración ---
      const totalLiters = Number(order.totalMilkLiters);
      // El precio de cada insumo vive en la FICHA del producto (Datos maestros → Productos):
      // al cerrar se usa el precio vigente de la ficha (convertido a $ del día de elaboración
      // si está en USD/EUR). El congelado en la versión de receta queda solo de respaldo,
      // para insumos sin precio en la ficha o sin producto asociado. Así el administrativo
      // actualiza un precio en UN solo lugar y las próximas elaboraciones lo toman solas.
      // Envases corregidos a mano (los manda la pantalla). Si no vienen (re-cierre desde un
      // cliente viejo), se mantienen los del cierre anterior.
      const envases = input.envases
        ? Object.fromEntries(input.envases.map((e) => [e.productId, e.quantity]))
        : (order.costBreakdown?.envases ?? {});
      const ingredients = await this.priceIngredients(manager, version, order.startedAt, [], envases);
      // Bultos de la tachada (principal + formatos): cuántos envases "por bulto" se usan.
      const bultosTachada = formatos.reduce((acc, f) => acc + (f.bultos ?? 0), principalOutput.bultos ?? 0);
      const envasePorBulto = version.ingredients.find((i) => i.basis === 'per_bulto');
      if (envasePorBulto && bultosTachada === 0 && envases[envasePorBulto.productId] == null)
        throw new BadRequestException(
          `Cargá los bultos: la receta usa ${envasePorBulto.productName} por bulto y sin bultos no se sabe cuántos se usaron.`,
        );

      // Costos fijos de planta (luz, gas, sueldos…): se suman solos por litro de leche cruda,
      // sin estar en la receta. Primera vez que cierra → $/litro del último mes cargado. Si se
      // está re-cerrando (editar una orden cerrada) se mantiene el $/litro con que cerró, y si
      // cerró sin costos fijos sigue sin ellos: las órdenes ya cerradas no cambian.
      const fijoPrevio = order.costBreakdown?.real.detalleInsumos?.find((l) => l.name === COSTO_FIJO_NOMBRE);
      const costoPorLitroFijo = order.costBreakdown
        ? (fijoPrevio?.unitCost ?? null)
        : ((await this.fixedCosts?.vigente(manager))?.costoPorLitro ?? null);
      const fijo = fixedCostIngredient(COSTO_FIJO_NOMBRE, milkLiters.toString(), costoPorLitroFijo);
      if (fijo) ingredients.push(fijo);

      // Cantidades reales de subproductos (por nombre, desde lo que carga el operario).
      const byproductActuals = this.byproductActuals(order, input.actualOutputs);

      // Estándar: solo si hay rendimiento esperado. Se carga a mano AL CERRAR (pedido #12);
      // si la receta vieja todavía traía uno, se usa como fallback. Sin esperado → solo real.
      const expectedYield =
        input.expectedYieldKgPerLiter ??
        (version.baseYieldKgPerLiter != null ? Number(version.baseYieldKgPerLiter) : null);
      const {
        real: realCost,
        estandar: estandarCost,
        variance,
      } = computeOrderCost({
        totalLiters,
        kgProductoTotal,
        bultos: bultosTachada,
        primaryInputs,
        ingredients,
        version,
        byproductActuals,
        expectedYield,
      });

      // --- 3b. Lotes de subproducto que "guardar lo de hoy" YA creó para esta orden: el
      // cierre los REUSA (ajusta cantidades) en vez de crear otros. Hay que buscarlos ANTES
      // de crear los lotes de producto: hasta acá, las únicas ENTRADAS de la orden son esas.
      const movementRepo = manager.getRepository(InventoryMovementEntity);
      const batchRepo = manager.getRepository(BatchEntity);
      const entradasPrevias = await movementRepo.find({
        where: { referenceType: 'production_order', referenceId: order.id, type: 'in' },
      });
      await lockBatches(manager, entradasPrevias.map((m) => m.batchId));
      const lotePrevioPorProducto = new Map<string, { mov: InventoryMovementEntity; batch: BatchEntity }>();
      for (const m of entradasPrevias) {
        const b = await batchRepo.findOne({ where: { id: m.batchId } });
        if (b && m.productId) lotePrevioPorProducto.set(m.productId, { mov: m, batch: b });
      }

      // --- 4. Crear el lote de producto, sellando su costo/kg (encadena los dos pasos) ---
      // Bultos del producto principal (bolsas de masa / cajas de queso). Opcional: si el
      // operario no los cargó, el lote queda sin bultos y todo funciona igual que antes.
      const principalBultos = principalOutput.bultos ?? null;
      const productionBatch = await manager.getRepository(BatchEntity).save(
        manager.getRepository(BatchEntity).create({
          code: `LM-PP-${order.code.replace('OP-', '')}`,
          productId: principalProductId,
          // La fecha del lote es la fecha de elaboración de la orden (puede ser un día
          // anterior si se cargó atrasada), no el momento en que se cierra en el sistema.
          productionDate: order.startedAt,
          initialQuantity: String(principalOutput.quantity),
          remainingQuantity: String(principalOutput.quantity),
          initialBultos: principalBultos,
          remainingBultos: principalBultos,
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
          bultos: principalBultos,
          referenceType: 'production_order',
          referenceId: order.id,
          createdById: order.operatorId,
        }),
      );

      // --- 4a. Otros formatos: un lote por formato con el MISMO costo/kg que el principal. ---
      const formatBatch = new Map<string, { id: string; code: string }>();
      let fIdx = 0;
      for (const f of formatos) {
        fIdx += 1;
        const fBatch = await manager.getRepository(BatchEntity).save(
          manager.getRepository(BatchEntity).create({
            code: `LM-PP-${order.code.replace('OP-', '')}-F${fIdx}`,
            productId: f.productId,
            productionDate: order.startedAt,
            initialQuantity: String(f.quantity),
            remainingQuantity: String(f.quantity),
            initialBultos: f.bultos,
            remainingBultos: f.bultos,
            unit: 'kg',
            status: 'activo',
            parentBatchId: order.milkInputs[0]?.batchId ?? null,
            warehouseId: input.warehouseId ?? null,
            unitCost: realCost.costoPorKg,
            notes: `Producido en ${order.code} (otro formato de la misma elaboración)`,
          }),
        );
        await manager.getRepository(InventoryMovementEntity).save(
          manager.getRepository(InventoryMovementEntity).create({
            batchId: fBatch.id,
            productId: f.productId,
            type: 'in',
            reason: 'production',
            quantity: String(f.quantity),
            unit: 'kg',
            bultos: f.bultos,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
        formatBatch.set(f.productId, { id: fBatch.id, code: fBatch.code });
      }

      // --- 4b. Subproductos con producto del catálogo (ej. suero) → generan su lote de stock ---
      const byproductBatch = new Map<string, { id: string; code: string }>();
      const round3bp = (n: number) => Math.round(n * 1000) / 1000;
      // La numeración sigue después del mayor lote LM-SP ya creado por "guardar lo de hoy".
      let bpIdx = 0;
      for (const { batch } of lotePrevioPorProducto.values()) {
        const m = batch.code.match(/-(\d+)$/);
        if (m) bpIdx = Math.max(bpIdx, Number(m[1]));
      }
      for (const o of input.actualOutputs) {
        if (o.isPrincipal || o.isFormat || o.quantity <= 0) continue;
        if (o.productId === principalProductId) continue; // sin producto propio: solo descuenta costo

        // Lote ya creado por "guardar lo de hoy": se ajusta a la cantidad final y se recuelga
        // del lote de producto. Pudo haberse consumido en el medio (la crema ya pasteurizada):
        // no se puede cerrar con menos de lo que ya salió de él.
        const previo = lotePrevioPorProducto.get(o.productId);
        if (previo) {
          lotePrevioPorProducto.delete(o.productId);
          const { mov, batch } = previo;
          const consumido = round3bp(Number(batch.initialQuantity) - Number(batch.remainingQuantity));
          if (o.quantity < consumido)
            throw new BadRequestException(
              `Del lote ${batch.code} ya se usaron ${consumido} ${batch.unit} (venta u otra elaboración): no podés cerrar la orden con ${o.quantity}.`,
            );
          const bultosConsumidos = (batch.initialBultos ?? 0) - (batch.remainingBultos ?? 0);
          batch.initialQuantity = String(o.quantity);
          batch.remainingQuantity = String(round3bp(o.quantity - consumido));
          batch.initialBultos = o.bultos ?? null;
          batch.remainingBultos = o.bultos != null ? Math.max(o.bultos - bultosConsumidos, 0) : null;
          batch.status = Number(batch.remainingQuantity) > 0 ? 'activo' : 'agotado';
          batch.parentBatchId = productionBatch.id;
          if (input.warehouseId) batch.warehouseId = input.warehouseId;
          await batchRepo.save(batch);
          mov.quantity = String(o.quantity);
          mov.bultos = o.bultos ?? null;
          await movementRepo.save(mov);
          byproductBatch.set(o.productId, { id: batch.id, code: batch.code });
          continue;
        }

        const bpProduct = await manager.getRepository(ProductEntity).findOne({ where: { id: o.productId } });
        if (!bpProduct) continue;
        bpIdx += 1;
        // Costo del lote de subproducto = su valor de recupero en la receta (lo que se le
        // descontó al principal). Así, si la crema desnatada se pasteuriza después, entra con
        // el MISMO $/kg que abarató la masa (costeo encadenado, CLAUDE.md §5.5), aunque el
        // precio de referencia de la ficha cambie más adelante. Sin recupero cargado queda
        // null y el cierre siguiente usa la regla de input-cost.ts (ficha → último lote → $0).
        const recupero = version.byproducts.find((b) => b.destinationProductId === o.productId)?.referenceValuePerUnit;
        const bpBatch = await manager.getRepository(BatchEntity).save(
          manager.getRepository(BatchEntity).create({
            code: `LM-SP-${order.code.replace('OP-', '')}-${bpIdx}`,
            productId: o.productId,
            productionDate: order.startedAt,
            initialQuantity: String(o.quantity),
            remainingQuantity: String(o.quantity),
            initialBultos: o.bultos ?? null,
            remainingBultos: o.bultos ?? null,
            unit: bpProduct.unit,
            status: 'activo',
            parentBatchId: productionBatch.id,
            warehouseId: input.warehouseId ?? null,
            unitCost: recupero != null ? String(recupero) : null,
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
            bultos: o.bultos ?? null,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
        byproductBatch.set(o.productId, { id: bpBatch.id, code: bpBatch.code });
      }

      // Lo guardado sin cerrar que al final quedó en 0: se revierte, salvo que ya se haya
      // usado — ahí el cierre se frena y pide corregir la cantidad en vez de borrarla.
      for (const { mov, batch } of lotePrevioPorProducto.values()) {
        const consumido = round3bp(Number(batch.initialQuantity) - Number(batch.remainingQuantity));
        if (consumido > 0)
          throw new BadRequestException(
            `Cargaste 0 de ${batch.code}, pero de ese lote ya se usaron ${consumido} ${batch.unit} (venta u otra elaboración). Corregí la cantidad en vez de dejarla en 0.`,
          );
        await movementRepo.remove(mov);
        await batchRepo.remove(batch);
      }

      // --- 4c. Descontar insumos del stock: lo MISMO que se costeó (detalle real). ---
      const insumosFaltantes = await this.consumirInsumos(manager, order, version, realCost.detalleInsumos);

      const actualOutputs: ProductionOutput[] = input.actualOutputs
        // Un formato en 0 kg no produjo nada: no se guarda.
        .filter((o) => !(o.isFormat && !(o.quantity > 0)))
        .map((o) => {
          const exp = order.expectedOutputs.find((e) => e.productId === o.productId);
          const formato = o.isFormat ? formatos.find((f) => f.productId === o.productId) : undefined;
          const batch = o.isPrincipal
            ? { id: productionBatch.id, code: productionBatch.code }
            : o.isFormat
              ? formatBatch.get(o.productId)
              : byproductBatch.get(o.productId);
          return {
            productId: o.productId,
            productName: formato?.product.name ?? exp?.productName ?? '',
            quantity: o.quantity,
            bultos: o.bultos,
            unit: exp?.unit ?? 'kg',
            isPrincipal: o.isPrincipal,
            ...(o.isFormat && { isFormat: true }),
            batchId: batch?.id,
            batchCode: batch?.code,
          };
        });

      // --- 5. Cerrar la orden y persistir el costo ---
      order.status = 'closed';
      order.closedAt = new Date();
      order.actualOutputs = actualOutputs;
      order.totalPrincipalKg = kgProductoTotal;
      order.totalCost = realCost.costoNeto;
      order.unitCost = realCost.costoPorKg;
      // El rendimiento esperado se guarda para poder recalcular más adelante con la receta corregida.
      order.costBreakdown = {
        real: realCost,
        estandar: estandarCost,
        variance,
        expectedYieldKgPerLiter: expectedYield,
        ...(Object.keys(envases).length > 0 && { envases }),
        ...(insumosFaltantes.length > 0 && { insumosFaltantes }),
      };
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

      // CANDADO: dos borrados simultáneos no pueden devolver el stock dos veces.
      await lockRow(manager, 'production_orders', id);
      const order = await orderRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException(`Orden de producción ${id} no encontrada`);

      if (order.status === 'open' || order.status === 'in_progress') {
        // Si "guardar lo de hoy" ya creó lotes de subproducto (la crema), se revierten
        // primero (con guard: si ya se usaron, no se puede borrar la orden).
        await this.revertProgressLots(manager, order);
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
    // CANDADO sobre todo lo que esta orden tocó (consumido y producido) antes de revertir.
    await lockBatches(manager, movements.map((m) => m.batchId));
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
      if (m.bultos != null) batch.remainingBultos = (batch.remainingBultos ?? 0) + m.bultos;
      if (batch.status === 'agotado' && Number(batch.remainingQuantity) > 0) batch.status = 'activo';
      await batchRepo.save(batch);
    }

    if (movements.length > 0) await movementRepo.remove(movements);
    if (producedBatchIds.length > 0) await batchRepo.delete(producedBatchIds);
  }

  // Precio de cada insumo de la receta. Vive en la FICHA del producto (Datos maestros →
  // Productos): se usa el precio vigente de la ficha (convertido a $ del día de elaboración si
  // está en USD/EUR). El congelado en la versión de receta queda solo de respaldo, para insumos
  // sin precio en la ficha o sin producto asociado. Así el administrativo actualiza un precio en
  // UN solo lugar y las próximas elaboraciones lo toman solas.
  // `previos` (al recalcular): el insumo que ya estaba en el cierre conserva el precio con que se
  // cerró, así lo único que cambia es la receta y no los precios de hoy.
  private async priceIngredients(
    manager: import('typeorm').EntityManager,
    version: RecipeVersionEntity,
    startedAt: Date,
    previos: CostDetailLine[] = [],
    envases: Record<string, number> = {},
  ): Promise<IngredientCost[]> {
    const ingredients: IngredientCost[] = [];
    for (const ing of version.ingredients) {
      let unitCost = String(ing.unitCost ?? 0);
      const previo = previos.find((p) => p.name === ing.productName);
      if (previo) {
        unitCost = previo.unitCost;
      } else if (ing.productId) {
        const ingProduct = await manager.getRepository(ProductEntity).findOne({ where: { id: ing.productId } });
        if (ingProduct && ingProduct.defaultCost != null && String(ingProduct.defaultCost) !== '') {
          const currency = (ingProduct.defaultCostCurrency ?? 'ARS') as Currency;
          unitCost =
            currency === 'ARS'
              ? String(ingProduct.defaultCost)
              : String(await this.exchangeRates.toArs(ingProduct.defaultCost, currency, startedAt));
        }
      }
      const corregido = envases[ing.productId];
      ingredients.push({
        name: ing.productName,
        quantity: String(ing.quantity),
        unitCost,
        basis: ing.basis,
        unit: ing.unit,
        ...(corregido != null && { cantidadReal: String(corregido) }),
      });
    }
    return ingredients;
  }

  // Descuenta del stock los insumos de la receta, por FEFO, en la cantidad que se COSTEÓ
  // (`detalle` = detalle real de la calculadora, en el mismo orden que la receta): así el stock
  // y el costo nunca difieren (16,8 baldes en uno y 17 en el otro). Si no alcanza, descuenta lo
  // que hay y devuelve lo que faltó para avisar. Insumos sin lotes (mano de obra, energía) se saltean.
  private async consumirInsumos(
    manager: import('typeorm').EntityManager,
    order: ProductionOrderEntity,
    version: RecipeVersionEntity,
    detalle: CostDetailLine[],
  ): Promise<{ name: string; faltan: string }[]> {
    // Los insumos se bloquean TODOS JUNTOS y siempre en el mismo orden (por id). Si cada
    // cierre los tomara en el orden de su receta, dos cierres con los mismos insumos en
    // distinto orden se trabarían mutuamente (deadlock) y Postgres abortaría uno.
    const ids = [...new Set(version.ingredients.map((i) => i.productId).filter(Boolean))].sort();
    for (const productId of ids) await lockBatchesOfProduct(manager, productId);

    const batchRepo = manager.getRepository(BatchEntity);
    const movementRepo = manager.getRepository(InventoryMovementEntity);
    const faltantes: { name: string; faltan: string }[] = [];
    for (const [i, ing] of version.ingredients.entries()) {
      let falta = new Big(detalle[i]?.cantidad ?? 0);
      if (!ing.productId || falta.lte(0)) continue;
      const lots = await batchRepo.find({
        where: { productId: ing.productId, status: 'activo' },
        order: { expirationDate: 'ASC' },
      });
      // Sin lotes nunca (mano de obra, energía): no se lleva stock, no hay nada que avisar.
      if (lots.length === 0 && (await batchRepo.count({ where: { productId: ing.productId } })) === 0) continue;
      for (const lot of lots) {
        if (falta.lte(0)) break;
        const take = falta.lt(lot.remainingQuantity) ? falta : new Big(lot.remainingQuantity);
        if (take.lte(0)) continue;
        const queda = new Big(lot.remainingQuantity).minus(take);
        lot.remainingQuantity = queda.toString();
        if (queda.lte(0)) lot.status = 'agotado';
        await batchRepo.save(lot);
        await movementRepo.save(
          movementRepo.create({
            batchId: lot.id,
            productId: ing.productId,
            type: 'out',
            reason: 'consumption',
            quantity: take.toString(),
            unit: lot.unit,
            referenceType: 'production_order',
            referenceId: order.id,
            createdById: order.operatorId,
          }),
        );
        falta = falta.minus(take);
      }
      if (falta.gt(0)) faltantes.push({ name: ing.productName, faltan: falta.toString() });
    }
    return faltantes;
  }

  // Devuelve al stock los insumos que la orden consumió (para volver a descontarlos con la
  // cuenta nueva al recalcular). Solo los movimientos de insumos ('consumption'), no la leche/masa.
  private async devolverInsumos(manager: import('typeorm').EntityManager, order: ProductionOrderEntity) {
    const batchRepo = manager.getRepository(BatchEntity);
    const movementRepo = manager.getRepository(InventoryMovementEntity);
    const movs = await movementRepo.find({
      where: { referenceType: 'production_order', referenceId: order.id, type: 'out', reason: 'consumption' },
    });
    await lockBatches(manager, movs.map((m) => m.batchId));
    for (const m of movs) {
      const batch = await batchRepo.findOne({ where: { id: m.batchId } });
      if (!batch) continue;
      batch.remainingQuantity = new Big(batch.remainingQuantity).plus(m.quantity).toString();
      if (batch.status === 'agotado') batch.status = 'activo';
      await batchRepo.save(batch);
    }
    if (movs.length > 0) await movementRepo.remove(movs);
  }

  // Kg reales de cada subproducto, por nombre (lo que carga el operario al cerrar).
  private byproductActuals(order: ProductionOrderEntity, actualOutputs: CloseProductionInput['actualOutputs']) {
    const actuals: Record<string, number> = {};
    for (const o of actualOutputs) {
      if (o.isPrincipal || o.isFormat) continue;
      // Solo entre los subproductos: una receta vieja podía dejar el subproducto con el
      // mismo productId que el principal, y entonces se tomaba el nombre equivocado.
      const exp = order.expectedOutputs.find((e) => !e.isPrincipal && e.productId === o.productId);
      if (exp?.productName) actuals[exp.productName] = o.quantity;
    }
    return actuals;
  }

  // ---------------------------------------------------------------------------------------
  // Recalcular con la receta corregida (pedido del dueño, 09/11/2026).
  // Una orden cerrada queda atada a la versión de receta con que se hizo (así un cambio de
  // receta no altera lotes viejos, CLAUDE.md §5.4). Pero si esa versión tenía un ERROR de
  // carga y el producto ya se vendió, editar/borrar está bloqueado. Esto vuelve a correr la
  // calculadora con la versión ACTIVA de la receta, con los mismos lotes de origen, los mismos
  // kg y los mismos precios del cierre. Cambia SOLO el costo (orden + sus lotes); stock,
  // ventas y kg quedan igual. La rentabilidad se corrige sola (lee el costo del lote).
  // No se permite si lo producido ya entró a otra elaboración (habría que recalcularla también).
  // ---------------------------------------------------------------------------------------
  async recalcPreview(id: string): Promise<ProductionRecalcPreview> {
    return this.dataSource.transaction(async (manager) => (await this.recalcPlan(manager, id)).preview);
  }

  async recalcApply(id: string): Promise<ProductionOrder> {
    return this.dataSource.transaction(async (manager) => {
      await lockRow(manager, 'production_orders', id);
      const { preview, order, version, cost } = await this.recalcPlan(manager, id);
      if (preview.bloqueo) throw new BadRequestException(preview.bloqueo);

      const productBatchIds = order.actualOutputs.filter((o) => o.isPrincipal || o.isFormat).map((o) => o.batchId);
      await lockBatches(manager, order.actualOutputs.map((o) => o.batchId).filter(Boolean) as string[]);
      const batchRepo = manager.getRepository(BatchEntity);
      for (const batchId of productBatchIds) {
        if (batchId) await batchRepo.update({ id: batchId }, { unitCost: cost.real.costoPorKg });
      }
      // Lotes de subproducto: su costo es el valor de recupero de la receta (igual que al cerrar).
      for (const o of order.actualOutputs) {
        if (o.isPrincipal || o.isFormat || !o.batchId) continue;
        const bp = version.byproducts.find((b) => b.destinationProductId === o.productId);
        if (bp?.referenceValuePerUnit != null)
          await batchRepo.update({ id: o.batchId }, { unitCost: String(bp.referenceValuePerUnit) });
      }

      // El stock de insumos se ajusta a la cuenta nueva: se devuelve lo que se descontó al
      // cerrar y se descuenta lo recalculado (ej. receta con 0,259 → 0,0269 devuelve la diferencia).
      await this.devolverInsumos(manager, order);
      const insumosFaltantes = await this.consumirInsumos(manager, order, version, cost.real.detalleInsumos);

      await manager.getRepository(ProductionOrderEntity).update(
        { id },
        {
          recipeVersionId: version.id,
          totalCost: cost.real.costoNeto,
          unitCost: cost.real.costoPorKg,
          costBreakdown: {
            real: cost.real,
            estandar: cost.estandar,
            variance: cost.variance,
            expectedYieldKgPerLiter: cost.expectedYield,
            ...(order.costBreakdown?.envases && { envases: order.costBreakdown.envases }),
            ...(insumosFaltantes.length > 0 && { insumosFaltantes }),
          },
        },
      );

      const reloaded = await manager.getRepository(ProductionOrderEntity).findOne({
        where: { id },
        relations: { recipe: true, operator: true },
      });
      return this.toDto(reloaded!);
    });
  }

  private async recalcPlan(manager: import('typeorm').EntityManager, id: string) {
    const order = await manager.getRepository(ProductionOrderEntity).findOne({
      where: { id },
      relations: { recipe: true, recipeVersion: true },
    });
    if (!order) throw new NotFoundException(`Orden de producción ${id} no encontrada`);
    if (order.status !== 'closed' || !order.costBreakdown)
      throw new BadRequestException(`La orden ${order.code} no está cerrada: el costo se calcula al cerrarla.`);
    const version = await manager
      .getRepository(RecipeVersionEntity)
      .findOne({ where: { recipeId: order.recipeId, isActive: true } });
    if (!version) throw new BadRequestException(`La receta ${order.recipe?.name ?? ''} no tiene una versión activa.`);

    // Guardia: lo producido no tiene que haber entrado a otra elaboración.
    let bloqueo: string | null = null;
    const producidos = order.actualOutputs.map((o) => o.batchId).filter(Boolean) as string[];
    if (producidos.length > 0) {
      const usado = await manager
        .getRepository(InventoryMovementEntity)
        .createQueryBuilder('m')
        .innerJoin(BatchEntity, 'b', 'b.id = m.batch_id')
        .select('b.code', 'code')
        .where('m.batch_id IN (:...ids)', { ids: producidos })
        .andWhere("m.type = 'out'")
        .andWhere("m.reference_type = 'production_order'")
        .andWhere('m.reference_id IS DISTINCT FROM :orderId', { orderId: order.id })
        .getRawOne<{ code: string }>();
      if (usado)
        bloqueo = `No se puede recalcular: el lote ${usado.code} ya se usó en otra elaboración, y esa también habría que recalcularla. Avisá a sistemas.`;
    }

    const old = order.costBreakdown;
    const detalleInputs = old.real.detalleInputs;
    const detalleInsumos = old.real.detalleInsumos;
    if (!detalleInputs || !detalleInsumos)
      throw new BadRequestException(
        `La orden ${order.code} es de antes de que se guardara el detalle del costo: no se puede recalcular sola.`,
      );
    const totalLiters = Number(order.totalMilkLiters);
    const kgProductoTotal = String(order.totalPrincipalKg ?? 0);
    const envases = old.envases ?? {};
    const ingredients = await this.priceIngredients(manager, version, order.startedAt, detalleInsumos, envases);
    // Los costos fijos no están en la receta: se mantienen tal cual cerró la orden.
    const fijoPrevio = detalleInsumos.find((l) => l.name === COSTO_FIJO_NOMBRE);
    if (fijoPrevio)
      ingredients.push({ name: fijoPrevio.name, quantity: fijoPrevio.cantidad, unitCost: fijoPrevio.unitCost, basis: 'fixed_per_order' });
    const expectedYield = expectedYieldFromBreakdown(old, order.recipeVersion?.standardWastePercent ?? 0);
    const cost = {
      ...computeOrderCost({
        totalLiters,
        kgProductoTotal,
        bultos: order.actualOutputs
          .filter((o) => o.isPrincipal || o.isFormat)
          .reduce((acc, o) => acc + (o.bultos ?? 0), 0),
        primaryInputs: primaryInputsFromBreakdown(detalleInputs),
        ingredients,
        version,
        byproductActuals: this.byproductActuals(order, order.actualOutputs),
        expectedYield,
      }),
      expectedYield,
    };

    // Insumos que cambian (comparando el detalle real de antes y de después).
    const linea = (l: CostDetailLine | undefined) => (l ? { cantidad: l.cantidad, subtotal: l.subtotal } : null);
    const nombres = [
      ...new Set([...detalleInsumos.map((l) => l.name), ...cost.real.detalleInsumos.map((l) => l.name)]),
    ];
    const cambios = nombres
      .map((name) => ({
        name,
        antes: linea(detalleInsumos.find((l) => l.name === name)),
        despues: linea(cost.real.detalleInsumos.find((l) => l.name === name)),
      }))
      .filter((c) => c.antes?.cantidad !== c.despues?.cantidad || c.antes?.subtotal !== c.despues?.subtotal);
    // Misma receta y nada cambia: no hay qué recalcular. (Con la MISMA receta sí puede cambiar
    // algo: las órdenes viejas costearon 16,8 baldes y hoy los envases se cuentan enteros.)
    if (version.id === order.recipeVersionId && cambios.length === 0)
      throw new BadRequestException(
        `La orden ${order.code} ya usa la receta vigente. Si la receta tiene un error, corregila primero (Recetas → Nueva versión).`,
      );

    const preview: ProductionRecalcPreview = {
      versionActual: order.recipeVersion?.versionNumber ?? 0,
      versionNueva: version.versionNumber,
      antes: { costoNeto: old.real.costoNeto, costoPorKg: old.real.costoPorKg },
      despues: { costoNeto: cost.real.costoNeto, costoPorKg: cost.real.costoPorKg },
      cambios,
      bloqueo,
    };
    return { preview, order, version, cost };
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
