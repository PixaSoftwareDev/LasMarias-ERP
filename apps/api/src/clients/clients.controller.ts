import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  createClientInputSchema,
  updateClientInputSchema,
  upsertClientPricesInputSchema,
  type CreateClientInput,
  type UpdateClientInput,
  type UpsertClientPricesInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ClientsService } from './clients.service';
import { ClientPricesService } from './client-prices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly clientPrices: ClientPricesService,
  ) {}

  @Get()
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  list() {
    return this.clients.list();
  }

  @Get(':id')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clients.get(id);
  }

  @Post()
  @Roles('admin', 'gerente', 'vendedor')
  create(@Body(new ZodValidationPipe(createClientInputSchema)) body: CreateClientInput) {
    return this.clients.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'gerente', 'vendedor')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateClientInputSchema)) body: UpdateClientInput,
  ) {
    return this.clients.update(id, body);
  }

  // --- Precios particulares por cliente (override de la lista por tipo) ---
  @Get(':id/prices')
  @Roles('admin', 'gerente', 'vendedor')
  prices(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientPrices.listByClient(id);
  }

  @Put(':id/prices')
  @Roles('admin', 'gerente')
  upsertPrices(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(upsertClientPricesInputSchema)) body: UpsertClientPricesInput,
  ) {
    return this.clientPrices.upsert(id, body);
  }
}
