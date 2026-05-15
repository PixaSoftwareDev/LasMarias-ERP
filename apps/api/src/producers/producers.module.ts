import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProducerEntity } from './producer.entity';
import { ProducersService } from './producers.service';
import { ProducersController } from './producers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProducerEntity])],
  providers: [ProducersService],
  controllers: [ProducersController],
  exports: [ProducersService],
})
export class ProducersModule {}
