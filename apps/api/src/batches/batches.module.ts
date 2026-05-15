import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchEntity } from './batch.entity';

// Los lotes se crean y consumen siempre desde otros módulos (recepción, producción).
// Por eso este módulo solo expone el repositorio TypeORM y no tiene controller propio.
@Module({
  imports: [TypeOrmModule.forFeature([BatchEntity])],
  exports: [TypeOrmModule],
})
export class BatchesModule {}
