import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashMovementEntity } from './cash-movement.entity';
import { AccountEntity } from './account.entity';
import { ExpenseCategoryEntity } from './expense-category.entity';
import { ChequeEntity } from './cheque.entity';
import { FinanceService } from './finance.service';
import { AccountsService } from './accounts.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ChequesService } from './cheques.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashMovementEntity,
      AccountEntity,
      ExpenseCategoryEntity,
      ChequeEntity,
    ]),
  ],
  providers: [FinanceService, AccountsService, ExpenseCategoriesService, ChequesService],
  controllers: [FinanceController],
  exports: [FinanceService, AccountsService, TypeOrmModule],
})
export class FinanceModule {}
