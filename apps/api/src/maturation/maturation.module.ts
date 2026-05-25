import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaturationRecordEntity } from './maturation-record.entity';
import { BatchEntity } from '../batches/batch.entity';
import { MaturationService } from './maturation.service';
import { MaturationController } from './maturation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MaturationRecordEntity, BatchEntity])],
  providers: [MaturationService],
  controllers: [MaturationController],
  exports: [MaturationService],
})
export class MaturationModule {}
