import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierEntity } from './supplier.entity';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { ProducerSettlementEntity } from './producer-settlement.entity';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { ProductsModule } from '../products/products.module';
import { ProducersModule } from '../producers/producers.module';
import { MilkReceptionsModule } from '../milk-receptions/milk-receptions.module';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierEntity,
      PurchaseOrderEntity,
      ProducerSettlementEntity,
      MilkReceptionEntity,
    ]),
    ProductsModule,
    ProducersModule,
    MilkReceptionsModule,
  ],
  providers: [SuppliersService],
  controllers: [SuppliersController],
  exports: [SuppliersService],
})
export class SuppliersModule {}
