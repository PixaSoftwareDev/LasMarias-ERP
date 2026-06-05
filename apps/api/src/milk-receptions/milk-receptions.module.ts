import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MilkReceptionEntity } from './milk-reception.entity';
import { MilkReceptionsService } from './milk-receptions.service';
import { MilkReceptionsController } from './milk-receptions.controller';
import { ProducersModule } from '../producers/producers.module';
import { BatchesModule } from '../batches/batches.module';
import { SettingsModule } from '../settings/settings.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [TypeOrmModule.forFeature([MilkReceptionEntity]), ProducersModule, BatchesModule, SettingsModule, ExchangeRatesModule],
  providers: [MilkReceptionsService],
  controllers: [MilkReceptionsController],
  exports: [MilkReceptionsService],
})
export class MilkReceptionsModule {}
