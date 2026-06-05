import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  registerProducerPaymentInputSchema,
  type RegisterProducerPaymentInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import {
  ProducersService,
  type CreateProducerInput,
  type UpdateProducerInput,
} from './producers.service';
import { ProducerAccountsService } from './producer-accounts.service';

const createProducerSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre del productor').max(200),
  taxId: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  agreedPricePerLiter: z.coerce.number().positive().optional(),
  priceCurrency: z.enum(['ARS', 'USD', 'EUR']).optional(),
  notes: z.string().max(1000).optional(),
});

const updateProducerSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre del productor').max(200).optional(),
  taxId: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  agreedPricePerLiter: z.coerce.number().positive().optional(),
  priceCurrency: z.enum(['ARS', 'USD', 'EUR']).optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('producers')
export class ProducersController {
  constructor(
    private readonly producers: ProducersService,
    private readonly accounts: ProducerAccountsService,
  ) {}

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list() {
    return this.producers.list();
  }

  // --- Cuentas por pagar a tambos ---
  @Get('accounts')
  @Roles('admin', 'gerente')
  listAccounts() {
    return this.accounts.listBalances();
  }

  @Get(':id/account')
  @Roles('admin', 'gerente')
  account(@Param('id', new ParseUUIDPipe()) id: string, @Query('month') month?: string) {
    return this.accounts.getDetail(id, month);
  }

  @Post('payments')
  @Roles('admin', 'gerente')
  registerPayment(
    @Body(new ZodValidationPipe(registerProducerPaymentInputSchema)) body: RegisterProducerPaymentInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.accounts.registerPayment(body, user.sub);
  }

  @Post()
  @Roles('admin', 'gerente')
  create(@Body(new ZodValidationPipe(createProducerSchema)) body: CreateProducerInput) {
    return this.producers.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'gerente')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateProducerSchema)) body: UpdateProducerInput,
  ) {
    return this.producers.update(id, body);
  }
}
