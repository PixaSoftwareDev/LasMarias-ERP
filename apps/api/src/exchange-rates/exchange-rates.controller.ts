import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  upsertExchangeRateInputSchema,
  type UpsertExchangeRateInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ExchangeRatesService } from './exchange-rates.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  // Lectura: cualquier usuario autenticado (las pantallas de carga muestran el equivalente en $).
  @Get()
  list() {
    return this.rates.list();
  }

  @Get('latest')
  latest() {
    return this.rates.latest();
  }

  @Patch()
  @Roles('admin', 'gerente')
  upsert(@Body(new ZodValidationPipe(upsertExchangeRateInputSchema)) body: UpsertExchangeRateInput) {
    return this.rates.upsert(body);
  }
}
