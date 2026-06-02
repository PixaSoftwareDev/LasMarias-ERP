import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

const productionQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  granularity: z.enum(['day', 'month']).default('day'),
});

const salesQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  by: z.enum(['client', 'product']).default('client'),
});

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
@Roles('admin', 'gerente')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('production')
  production(
    @Query(new ZodValidationPipe(productionQuerySchema))
    q: { from: Date; to: Date; granularity: 'day' | 'month' },
  ) {
    return this.reports.production(q.from, q.to, q.granularity);
  }

  @Get('sales')
  sales(
    @Query(new ZodValidationPipe(salesQuerySchema))
    q: { from: Date; to: Date; by: 'client' | 'product' },
  ) {
    return q.by === 'product'
      ? this.reports.salesByProduct(q.from, q.to)
      : this.reports.salesByClient(q.from, q.to);
  }

  @Get('yield')
  yield(@Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date }) {
    return this.reports.yield(q.from, q.to);
  }

  @Get('profitability')
  profitability(@Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date }) {
    return this.reports.profitability(q.from, q.to);
  }

  @Get('export/sales.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="ventas-por-cliente.xlsx"')
  async exportSales(
    @Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date },
    @Res() res: Response,
  ) {
    const buffer = await this.reports.exportSalesXlsx(q.from, q.to);
    res.send(buffer);
  }
}
