import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  createPriceListInputSchema,
  createSalesOrderInputSchema,
  salesOrderStatusSchema,
  type CreatePriceListInput,
  type CreateSalesOrderInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { SalesService } from './sales.service';

const updateStatusSchema = z.object({ status: salesOrderStatusSchema });

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('price-lists')
  @Roles('admin', 'gerente', 'vendedor')
  listPriceLists() {
    return this.sales.listPriceLists();
  }

  @Post('price-lists')
  @Roles('admin', 'gerente')
  createPriceList(@Body(new ZodValidationPipe(createPriceListInputSchema)) body: CreatePriceListInput) {
    return this.sales.createPriceList(body);
  }

  @Get('orders')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  listOrders(@Query('deliveryDate') deliveryDate?: string) {
    if (deliveryDate) return this.sales.listOrdersByDeliveryDate(deliveryDate);
    return this.sales.listOrders();
  }

  @Get('orders/:id')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  getOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sales.getOrder(id);
  }

  @Post('orders')
  @Roles('admin', 'gerente', 'vendedor')
  createOrder(
    @Body(new ZodValidationPipe(createSalesOrderInputSchema)) body: CreateSalesOrderInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.sales.createOrder(body, user.sub);
  }

  @Patch('orders/:id/status')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: { status: 'taken' | 'confirmed' | 'prepared' | 'loaded' | 'in_delivery' | 'delivered' | 'cancelled' },
  ) {
    return this.sales.updateStatus(id, body.status);
  }
}
