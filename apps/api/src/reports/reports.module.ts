import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { CreditNoteEntity } from '../sales/credit-note.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

// Reportes básicos (CLAUDE.md §4.9). Solo lecturas agregadas sobre producción,
// ventas, notas de crédito y movimientos; no posee tablas propias.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrderEntity,
      SalesOrderEntity,
      CreditNoteEntity,
      InventoryMovementEntity,
    ]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
