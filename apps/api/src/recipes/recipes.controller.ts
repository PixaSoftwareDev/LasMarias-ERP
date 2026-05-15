import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  createRecipeInputSchema,
  createRecipeVersionInputSchema,
  simulateRecipeInputSchema,
  type CreateRecipeInput,
  type CreateRecipeVersionInput,
  type SimulateRecipeInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RecipesService } from './recipes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list() {
    return this.recipes.list();
  }

  @Get(':id')
  @Roles('admin', 'gerente', 'operario')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recipes.get(id);
  }

  @Post()
  @Roles('admin', 'gerente')
  create(@Body(new ZodValidationPipe(createRecipeInputSchema)) body: CreateRecipeInput) {
    return this.recipes.create(body);
  }

  @Post(':id/versions')
  @Roles('admin', 'gerente')
  createVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createRecipeVersionInputSchema)) body: CreateRecipeVersionInput,
  ) {
    return this.recipes.createVersion(id, body);
  }

  @Post('simulate')
  @Roles('admin', 'gerente', 'operario')
  simulate(@Body(new ZodValidationPipe(simulateRecipeInputSchema)) body: SimulateRecipeInput) {
    return this.recipes.simulate(body);
  }
}
