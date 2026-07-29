import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  closeProductionInputSchema,
  openProductionInputSchema,
  updateProductionInputSchema,
  type CloseProductionInput,
  type OpenProductionInput,
  type UpdateProductionInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductionService } from './production.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('production-orders')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @Roles('admin', 'gerente', 'operario')
  list() {
    return this.production.list();
  }

  @Get(':id')
  @Roles('admin', 'gerente', 'operario')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.production.get(id);
  }

  @Post('open')
  @Roles('admin', 'gerente', 'operario')
  open(@Body(new ZodValidationPipe(openProductionInputSchema)) body: OpenProductionInput) {
    return this.production.open(body);
  }

  // Editar una orden (por si se cargó algo mal). Abierta: leche/receta/fecha/notas. Cerrada:
  // además la producción real, y se recalcula el costo revirtiendo y volviendo a cerrar.
  @Patch(':id')
  @Roles('admin', 'gerente', 'operario')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateProductionInputSchema)) body: UpdateProductionInput,
  ) {
    return this.production.update(id, body);
  }

  // Borrar deshace stock (o libera reservas): acción destructiva, solo admin/gerente.
  @Delete(':id')
  @Roles('admin', 'gerente', 'operario')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.production.remove(id);
  }

  @Post(':id/close')
  @Roles('admin', 'gerente', 'operario')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(closeProductionInputSchema)) body: CloseProductionInput,
  ) {
    return this.production.close(id, body);
  }
}
