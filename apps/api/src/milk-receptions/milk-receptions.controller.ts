import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  createMilkReceptionInputSchema,
  updateMilkReceptionInputSchema,
  type CreateMilkReceptionInput,
  type UpdateMilkReceptionInput,
  monthKeySchema,
  saveMilkMonthPricesInputSchema,
  type SaveMilkMonthPricesInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { MilkReceptionsService } from './milk-receptions.service';
import { MilkPricesService } from './milk-prices.service';

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('milk-receptions')
export class MilkReceptionsController {
  constructor(
    private readonly receptions: MilkReceptionsService,
    private readonly milkPrices: MilkPricesService,
  ) {}

  // Precio de la leche por mes de cada tambo (antes que las rutas con ':id').
  @Get('prices/:month')
  @Roles('admin', 'gerente')
  monthPrices(@Param('month', new ZodValidationPipe(monthKeySchema)) month: string) {
    return this.milkPrices.overview(month);
  }

  @Put('prices/:month')
  @Roles('admin', 'gerente')
  saveMonthPrices(
    @Param('month', new ZodValidationPipe(monthKeySchema)) month: string,
    @Body(new ZodValidationPipe(saveMilkMonthPricesInputSchema)) body: SaveMilkMonthPricesInput,
  ) {
    return this.milkPrices.save(month, body);
  }

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list() {
    return this.receptions.list();
  }

  @Get('volume-by-producer')
  @Roles('admin', 'gerente')
  async volumeByProducer(@Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date }) {
    return this.receptions.volumeByProducer(q.from, q.to);
  }

  @Post()
  @Roles('admin', 'gerente', 'operario')
  create(
    @Body(new ZodValidationPipe(createMilkReceptionInputSchema)) body: CreateMilkReceptionInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.receptions.create(body, user.sub);
  }

  // Borrado con reversa de stock (mismo criterio que las órdenes de producción).
  @Delete(':id')
  @Roles('admin', 'gerente', 'operario')
  remove(@Param('id') id: string) {
    return this.receptions.remove(id);
  }

  @Get(':id')
  @Roles('admin', 'gerente', 'operario')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.receptions.get(id);
  }

  // Editar una recepción cargada mal. Si la leche ya se usó en elaboración, los litros
  // solo pueden bajar hasta lo no consumido y los silos no se tocan.
  @Patch(':id')
  @Roles('admin', 'gerente', 'operario')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateMilkReceptionInputSchema)) body: UpdateMilkReceptionInput,
  ) {
    return this.receptions.update(id, body);
  }
}
