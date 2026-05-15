import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  createInvoiceFromOrderInputSchema,
  recordPaymentInputSchema,
  type CreateInvoiceFromOrderInput,
  type RecordPaymentInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InvoicesService } from './invoices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Roles('admin', 'gerente', 'contable', 'vendedor')
  list() {
    return this.invoices.list();
  }

  @Get('accounts-receivable')
  @Roles('admin', 'gerente', 'contable')
  accountsReceivable() {
    return this.invoices.accountsReceivable();
  }

  @Get(':id')
  @Roles('admin', 'gerente', 'contable', 'vendedor')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoices.get(id);
  }

  @Post('from-order')
  @Roles('admin', 'gerente', 'contable')
  createFromOrder(
    @Body(new ZodValidationPipe(createInvoiceFromOrderInputSchema)) body: CreateInvoiceFromOrderInput,
  ) {
    return this.invoices.createFromOrder(body);
  }

  @Post(':id/payments')
  @Roles('admin', 'gerente', 'contable')
  recordPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(recordPaymentInputSchema)) body: RecordPaymentInput,
  ) {
    return this.invoices.recordPayment(id, body);
  }
}
