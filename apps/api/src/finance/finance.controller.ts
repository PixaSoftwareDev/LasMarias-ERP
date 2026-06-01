import { Body, Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  createCashMovementInputSchema,
  type CreateCashMovementInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { FinanceService } from './finance.service';

const cashFlowQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  granularity: z.enum(['day', 'month']).default('day'),
});

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post('cash-movements')
  @Roles('admin', 'gerente')
  createCashMovement(
    @Body(new ZodValidationPipe(createCashMovementInputSchema)) body: CreateCashMovementInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.finance.createCashMovement(body, user.sub);
  }

  @Get('cash-movements')
  @Roles('admin', 'gerente')
  listCashMovements(
    @Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date },
  ) {
    return this.finance.listCashMovements(q.from, q.to);
  }

  @Get('cash-flow')
  @Roles('admin', 'gerente')
  cashFlow(
    @Query(new ZodValidationPipe(cashFlowQuerySchema))
    q: { from: Date; to: Date; granularity: 'day' | 'month' },
  ) {
    return this.finance.cashFlow(q.from, q.to, q.granularity);
  }

  @Get('export/cash-flow.csv')
  @Roles('admin', 'gerente')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="flujo-de-caja.csv"')
  async exportCashFlow(
    @Query(new ZodValidationPipe(cashFlowQuerySchema))
    q: { from: Date; to: Date; granularity: 'day' | 'month' },
    @Res() res: Response,
  ) {
    const csv = await this.finance.exportCashFlowCsv(q.from, q.to, q.granularity);
    res.send(csv);
  }
}
