import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { AccountMovementEntity } from '../sales/account-movement.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { BatchEntity } from '../batches/batch.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrderEntity,
      AccountMovementEntity,
      CashMovementEntity,
      BatchEntity,
      MilkReceptionEntity,
      ProductionOrderEntity,
    ]),
  ],
  providers: [HomeService],
  controllers: [HomeController],
})
export class HomeModule {}
