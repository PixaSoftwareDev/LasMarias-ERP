import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @Roles('admin', 'gerente', 'operario', 'vendedor', 'contable')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('production-by-product')
  @Roles('admin', 'gerente')
  productionByProduct(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.productionByProduct(from, to);
  }

  @Get('sales-by-channel')
  @Roles('admin', 'gerente')
  salesByChannel(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.salesByChannel(from, to);
  }

  @Get('expiring-batches')
  @Roles('admin', 'gerente', 'operario')
  expiringBatches() {
    return this.reports.expiringBatches();
  }
}
