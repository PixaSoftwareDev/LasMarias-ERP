import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createSupplierInputSchema,
  updateSupplierInputSchema,
  createPayableInputSchema,
  registerSupplierPaymentInputSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type CreatePayableInput,
  type RegisterSupplierPaymentInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { SuppliersService } from './suppliers.service';
import { PayablesService } from './payables.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly payables: PayablesService,
  ) {}

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.suppliers.list(includeInactive === 'true');
  }

  // --- Cuentas por pagar ---
  @Get('accounts')
  @Roles('admin', 'gerente')
  listAccounts() {
    return this.payables.listBalances();
  }

  @Get('payables')
  @Roles('admin', 'gerente')
  listPayables(@Query('supplierId') supplierId?: string) {
    return this.payables.listPayables(supplierId || undefined);
  }

  @Post('payables')
  @Roles('admin', 'gerente')
  createPayable(
    @Body(new ZodValidationPipe(createPayableInputSchema)) body: CreatePayableInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.payables.createPayable(body, user.sub);
  }

  @Post('payments')
  @Roles('admin', 'gerente')
  registerPayment(
    @Body(new ZodValidationPipe(registerSupplierPaymentInputSchema)) body: RegisterSupplierPaymentInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.payables.registerPayment(body, user.sub);
  }

  @Post()
  @Roles('admin', 'gerente')
  create(@Body(new ZodValidationPipe(createSupplierInputSchema)) body: CreateSupplierInput) {
    return this.suppliers.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'gerente')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateSupplierInputSchema)) body: UpdateSupplierInput,
  ) {
    return this.suppliers.update(id, body);
  }
}
