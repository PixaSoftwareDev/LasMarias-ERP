import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRateEntity } from './exchange-rate.entity';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRateEntity])],
  providers: [ExchangeRatesService],
  controllers: [ExchangeRatesController],
  exports: [ExchangeRatesService], // lo usan recepción, recetas, ingreso de stock y ventas para convertir
})
export class ExchangeRatesModule {}
