import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from './client.entity';
import { ClientPriceItemEntity } from './client-price-item.entity';
import { ClientsService } from './clients.service';
import { ClientPricesService } from './client-prices.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientEntity, ClientPriceItemEntity])],
  providers: [ClientsService, ClientPricesService],
  controllers: [ClientsController],
  exports: [ClientsService, ClientPricesService],
})
export class ClientsModule {}
