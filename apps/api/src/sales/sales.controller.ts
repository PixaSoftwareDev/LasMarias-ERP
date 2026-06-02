import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  clientTypeSchema,
  createReturnInputSchema,
  createSalesOrderInputSchema,
  registerPaymentInputSchema,
  upsertPriceListInputSchema,
  type CreateReturnInput,
  type CreateSalesOrderInput,
  type RegisterPaymentInput,
  type UpsertPriceListInput,
} from '@lasmarias/shared-schemas';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { SalesService } from './sales.service';
import { PricingService } from './pricing.service';
import { AccountsService } from './accounts.service';

const clientTypeQuerySchema = z.object({ clientType: clientTypeSchema });

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly pricing: PricingService,
    private readonly accounts: AccountsService,
  ) {}

  @Get('orders')
  @Roles('admin', 'gerente', 'vendedor')
  listOrders() {
    return this.sales.listOrders();
  }

  @Get('orders/:id')
  @Roles('admin', 'gerente', 'vendedor')
  getOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sales.getOrder(id);
  }

  // Crear un despacho: precio a mano por línea, baja stock + cargo en cuenta corriente.
  @Post('orders')
  @Roles('admin', 'gerente', 'vendedor')
  createOrder(
    @Body(new ZodValidationPipe(createSalesOrderInputSchema)) body: CreateSalesOrderInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.sales.createOrder(body, user.sub);
  }

  // Devolución de un despacho → nota de crédito + reposición de stock.
  @Post('orders/:id/returns')
  @Roles('admin', 'gerente')
  createReturn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createReturnInputSchema)) body: CreateReturnInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.sales.createReturn(id, body, user.sub);
  }

  // --- Listas de precio por tipo de cliente ---
  @Get('price-list')
  @Roles('admin', 'gerente', 'vendedor')
  priceList(
    @Query(new ZodValidationPipe(clientTypeQuerySchema))
    q: { clientType: 'minorista' | 'mayorista' | 'distribuidor' },
  ) {
    return this.pricing.listByClientType(q.clientType);
  }

  @Put('price-list')
  @Roles('admin', 'gerente')
  upsertPriceList(
    @Body(new ZodValidationPipe(upsertPriceListInputSchema)) body: UpsertPriceListInput,
  ) {
    return this.pricing.upsert(body);
  }

  // --- Cuenta corriente ---
  @Get('accounts')
  @Roles('admin', 'gerente', 'vendedor')
  accountsList() {
    return this.accounts.listBalances();
  }

  @Get('accounts/:clientId')
  @Roles('admin', 'gerente', 'vendedor')
  accountDetail(@Param('clientId', new ParseUUIDPipe()) clientId: string) {
    return this.accounts.getDetail(clientId);
  }

  @Post('payments')
  @Roles('admin', 'gerente', 'vendedor')
  registerPayment(
    @Body(new ZodValidationPipe(registerPaymentInputSchema)) body: RegisterPaymentInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.accounts.registerPayment(body, user.sub);
  }

  // --- Export Excel ---
  @Get('export/accounts.xlsx')
  @Roles('admin', 'gerente')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="cuentas-corrientes.xlsx"')
  async exportAccounts(@Res() res: Response) {
    const buffer = await this.accounts.exportBalancesXlsx();
    res.send(buffer);
  }

  @Get('export/price-list.xlsx')
  @Roles('admin', 'gerente')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="listas-de-precios.xlsx"')
  async exportPriceList(@Res() res: Response) {
    const buffer = await this.pricing.exportXlsx();
    res.send(buffer);
  }
}
