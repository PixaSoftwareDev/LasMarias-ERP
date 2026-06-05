import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierEntity } from './supplier.entity';
import { PayableEntity } from './payable.entity';
import { SupplierPaymentEntity } from './supplier-payment.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { SuppliersService } from './suppliers.service';
import { PayablesService } from './payables.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierEntity,
      PayableEntity,
      SupplierPaymentEntity,
      CashMovementEntity,
    ]),
  ],
  providers: [SuppliersService, PayablesService],
  controllers: [SuppliersController],
  exports: [SuppliersService, PayablesService, TypeOrmModule],
})
export class SuppliersModule {}
