import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  createMilkReceptionInputSchema,
  type CreateMilkReceptionInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { MilkReceptionsService } from './milk-receptions.service';

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('milk-receptions')
export class MilkReceptionsController {
  constructor(private readonly receptions: MilkReceptionsService) {}

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
}
