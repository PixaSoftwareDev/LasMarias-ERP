import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  createWarehouseInputSchema,
  stockCountInputSchema,
  type CreateWarehouseInput,
  type StockCountInput,
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
  listWarehouses() {
    return this.inventory.listWarehouses();
  }

  @Post('warehouses')
  @Roles('admin', 'gerente')
  createWarehouse(@Body(new ZodValidationPipe(createWarehouseInputSchema)) body: CreateWarehouseInput) {
    return this.inventory.createWarehouse(body);
  }

  @Get('stock')
  @Roles('admin', 'gerente', 'operario', 'vendedor')
  stockSummary() {
    return this.inventory.stockSummary();
  }

  @Get('movements')
  @Roles('admin', 'gerente', 'operario')
  movements(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.inventory.listMovements(limit, offset);
  }

  @Get('traceback/:batchId')
  @Roles('admin', 'gerente', 'operario')
  traceback(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.inventory.traceback(batchId);
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
