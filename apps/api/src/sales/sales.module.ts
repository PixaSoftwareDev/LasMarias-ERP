import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceListEntity, PriceListItemEntity } from './price-list.entity';
import { SalesOrderEntity } from './sales-order.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { ClientsModule } from '../clients/clients.module';
import { ProductsModule } from '../products/products.module';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceListEntity, PriceListItemEntity, SalesOrderEntity]),
    ClientsModule,
    ProductsModule,
    DeliveryModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService, TypeOrmModule],
})
export class SalesModule {}
