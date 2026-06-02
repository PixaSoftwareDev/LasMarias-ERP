import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createWarehouseInputSchema,
  updateWarehouseInputSchema,
  stockCountInputSchema,
  stockEntryInputSchema,
  discardStockInputSchema,
  countAdjustInputSchema,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
  type StockCountInput,
  type StockEntryInput,
  type DiscardStockInput,
  type CountAdjustInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('warehouses')
  @Roles('admin', 'gerente', 'operario')
  listWarehouses(@Query('all') all?: string) {
    return this.inventory.listWarehouses(all === 'true');
  }

  @Post('warehouses')
  @Roles('admin', 'gerente')
  createWarehouse(@Body(new ZodValidationPipe(createWarehouseInputSchema)) body: CreateWarehouseInput) {
    return this.inventory.createWarehouse(body);
  }

  @Patch('warehouses/:id')
  @Roles('admin', 'gerente')
  updateWarehouse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateWarehouseInputSchema)) body: UpdateWarehouseInput,
  ) {
    return this.inventory.updateWarehouse(id, body);
  }

  @Get('stock')
  @Roles('admin', 'gerente', 'operario', 'vendedor')
  stockSummary() {
    return this.inventory.stockSummary();
  }

  @Get('batches')
  @Roles('admin', 'gerente', 'operario')
  consumableBatches(@Query('category') category?: string) {
    return this.inventory.consumableBatches(category);
  }

  @Get('movements')
  @Roles('admin', 'gerente', 'operario')
  movements() {
    return this.inventory.listMovements();
  }

  @Get('traceback/:batchId')
  @Roles('admin', 'gerente', 'operario')
  traceback(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.inventory.traceback(batchId);
  }

  // Trazabilidad descendente: de un lote hacia el cliente (qué se hizo con él).
  @Get('trace-forward/:batchId')
  @Roles('admin', 'gerente', 'operario', 'vendedor')
  traceForward(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.inventory.traceForward(batchId);
  }

  // Trazabilidad ascendente (multi-padre): de un lote hacia la leche y el productor de origen.
  @Get('trace-backward/:batchId')
  @Roles('admin', 'gerente', 'operario', 'vendedor')
  traceBackward(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.inventory.traceBackward(batchId);
  }

  // Sugerencia FEFO (solo lectura): qué lotes tomar para cubrir una cantidad.
  @Get('fefo-suggestion')
  @Roles('admin', 'gerente', 'operario', 'vendedor')
  fefoSuggestion(
    @Query('productId', new ParseUUIDPipe()) productId: string,
    @Query('quantity') quantity: string,
  ) {
    return this.inventory.fefoSuggestion(productId, Number(quantity));
  }

  @Post('stock-entry')
  @Roles('admin', 'gerente', 'operario')
  addStockEntry(
    @Body(new ZodValidationPipe(stockEntryInputSchema)) body: StockEntryInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.inventory.addStockEntry(body, user.sub);
  }

  @Post('discard')
  @Roles('admin', 'gerente', 'operario')
  discardStock(
    @Body(new ZodValidationPipe(discardStockInputSchema)) body: DiscardStockInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.inventory.discardStock(body, user.sub);
  }

  @Post('count-adjust')
  @Roles('admin', 'gerente', 'operario')
  countAdjust(
    @Body(new ZodValidationPipe(countAdjustInputSchema)) body: CountAdjustInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.inventory.countAdjust(body, user.sub);
  }

  @Post('count')
  @Roles('admin', 'gerente', 'operario')
  count(
    @Body(new ZodValidationPipe(stockCountInputSchema)) body: StockCountInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.inventory.stockCount(body, user.sub);
  }
}
