import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionOrderEntity } from './production-order.entity';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { RecipesModule } from '../recipes/recipes.module';
import { BatchesModule } from '../batches/batches.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductionOrderEntity]),
    RecipesModule,
    BatchesModule,
    InventoryModule,
    UsersModule,
  ],
  providers: [ProductionService],
  controllers: [ProductionController],
  exports: [ProductionService],
})
export class ProductionModule {}
