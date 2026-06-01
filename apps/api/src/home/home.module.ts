import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { AccountMovementEntity } from '../sales/account-movement.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { BatchEntity } from '../batches/batch.entity';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrderEntity,
      AccountMovementEntity,
      CashMovementEntity,
      BatchEntity,
    ]),
  ],
  providers: [HomeService],
  controllers: [HomeController],
})
export class HomeModule {}
