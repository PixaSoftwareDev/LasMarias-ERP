import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  closeProductionInputSchema,
  openProductionInputSchema,
  type CloseProductionInput,
  type OpenProductionInput,
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

  @Post(':id/close')
  @Roles('admin', 'gerente', 'operario')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(closeProductionInputSchema)) body: CloseProductionInput,
  ) {
    return this.production.close(id, body);
  }
}
