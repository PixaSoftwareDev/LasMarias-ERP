import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipeEntity, RecipeVersionEntity } from './recipe.entity';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [TypeOrmModule.forFeature([RecipeEntity, RecipeVersionEntity]), ProductsModule],
  providers: [RecipesService],
  controllers: [RecipesController],
  exports: [RecipesService, TypeOrmModule],
})
export class RecipesModule {}
