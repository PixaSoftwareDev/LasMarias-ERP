import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashMovementEntity } from './cash-movement.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CashMovementEntity])],
  providers: [FinanceService],
  controllers: [FinanceController],
  exports: [FinanceService, TypeOrmModule],
})
export class FinanceModule {}
