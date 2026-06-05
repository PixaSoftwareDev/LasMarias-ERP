import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrderEntity } from './sales-order.entity';
import { PriceListItemEntity } from './price-list-item.entity';
import { AccountMovementEntity } from './account-movement.entity';
import { CreditNoteEntity } from './credit-note.entity';
import { SalesService } from './sales.service';
import { PricingService } from './pricing.service';
import { AccountsService } from './accounts.service';
import { SalesController } from './sales.controller';
import { ClientsModule } from '../clients/clients.module';
import { ProductsModule } from '../products/products.module';
import { ClientEntity } from '../clients/client.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrderEntity,
      PriceListItemEntity,
      AccountMovementEntity,
      CreditNoteEntity,
      ClientEntity,
      CashMovementEntity,
    ]),
    ClientsModule,
    ProductsModule,
    ExchangeRatesModule,
  ],
  providers: [SalesService, PricingService, AccountsService],
  controllers: [SalesController],
  exports: [SalesService, PricingService, AccountsService, TypeOrmModule],
})
export class SalesModule {}
