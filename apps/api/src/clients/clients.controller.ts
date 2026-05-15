import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createClientInputSchema,
  updateClientInputSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ClientsService } from './clients.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

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
}
