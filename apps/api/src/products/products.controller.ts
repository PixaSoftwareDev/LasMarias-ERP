import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createProductInputSchema,
  createProductPresentationInputSchema,
  updateProductInputSchema,
  type CreateProductInput,
  type CreateProductPresentationInput,
  type UpdateProductInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list() {
    return this.products.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.get(id);
  }

  @Post()
  @Roles('admin', 'gerente')
  create(@Body(new ZodValidationPipe(createProductInputSchema)) body: CreateProductInput) {
    return this.products.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'gerente')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateProductInputSchema)) body: UpdateProductInput,
  ) {
    return this.products.update(id, body);
  }

  @Get(':id/presentations')
  listPresentations(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.listPresentations(id);
  }

  @Post(':id/presentations')
  @Roles('admin', 'gerente')
  createPresentation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createProductPresentationInputSchema)) body: CreateProductPresentationInput,
  ) {
    return this.products.createPresentation(id, body);
  }
}
