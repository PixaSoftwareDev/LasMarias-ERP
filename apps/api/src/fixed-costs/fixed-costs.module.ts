import { Module } from '@nestjs/common';
import { FixedCostsService } from './fixed-costs.service';
import { FixedCostsController } from './fixed-costs.controller';

@Module({
  providers: [FixedCostsService],
  controllers: [FixedCostsController],
  exports: [FixedCostsService], // lo usa el cierre de producción
})
export class FixedCostsModule {}
