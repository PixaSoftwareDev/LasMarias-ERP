import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { BatchEntity } from '../batches/batch.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilkReceptionEntity,
      ProductionOrderEntity,
      SalesOrderEntity,
      InvoiceEntity,
      BatchEntity,
    ]),
    InventoryModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
