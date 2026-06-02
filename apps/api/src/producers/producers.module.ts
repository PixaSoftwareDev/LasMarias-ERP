import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProducerEntity } from './producer.entity';
import { ProducerPaymentEntity } from './producer-payment.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProducersService } from './producers.service';
import { ProducerAccountsService } from './producer-accounts.service';
import { ProducersController } from './producers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProducerEntity, ProducerPaymentEntity, MilkReceptionEntity])],
  providers: [ProducersService, ProducerAccountsService],
  controllers: [ProducersController],
  exports: [ProducersService],
})
export class ProducersModule {}
