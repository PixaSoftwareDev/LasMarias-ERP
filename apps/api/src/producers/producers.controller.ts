import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProducersService, type CreateProducerInput } from './producers.service';

const createProducerSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre del productor').max(200),
  taxId: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  agreedPricePerLiter: z.coerce.number().positive().optional(),
  renspa: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
});

const updateProducerSchema = createProducerSchema.partial();

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('producers')
export class ProducersController {
  constructor(private readonly producers: ProducersService) {}

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list() {
    return this.producers.list();
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
    @Body(new ZodValidationPipe(updateProducerSchema)) body: Partial<CreateProducerInput>,
  ) {
    return this.producers.update(id, body);
  }
}
