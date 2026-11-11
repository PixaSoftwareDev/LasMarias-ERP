import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  fixedCostTypeInputSchema,
  type FixedCostTypeInput,
  monthKeySchema,
  saveFixedCostMonthInputSchema,
  setFixedCostMonthListoInputSchema,
  type SetFixedCostMonthListoInput,
  setLitrosNormalesInputSchema,
  setInflacionInputSchema,
  type SetInflacionInput,
  type SetLitrosNormalesInput,
  type SaveFixedCostMonthInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FixedCostsService } from './fixed-costs.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'gerente')
@Controller('fixed-costs')
export class FixedCostsController {
  constructor(private readonly fixedCosts: FixedCostsService) {}

  @Get()
  overview() {
    return this.fixedCosts.overview();
  }

  // Antes que ':month' para que no lo tome como un mes.
  @Put('litros-normales')
  setLitrosNormales(@Body(new ZodValidationPipe(setLitrosNormalesInputSchema)) body: SetLitrosNormalesInput) {
    return this.fixedCosts.setLitrosNormales(body.litros);
  }

  @Put('inflacion')
  setInflacion(@Body(new ZodValidationPipe(setInflacionInputSchema)) body: SetInflacionInput) {
    return this.fixedCosts.setInflacion(body.porcentaje);
  }

  @Put(':month')
  save(
    @Param('month', new ZodValidationPipe(monthKeySchema)) month: string,
    @Body(new ZodValidationPipe(saveFixedCostMonthInputSchema)) body: SaveFixedCostMonthInput,
  ) {
    return this.fixedCosts.save(month, body.lines);
  }

  @Put(':month/listo')
  setListo(
    @Param('month', new ZodValidationPipe(monthKeySchema)) month: string,
    @Body(new ZodValidationPipe(setFixedCostMonthListoInputSchema)) body: SetFixedCostMonthListoInput,
  ) {
    return this.fixedCosts.setListo(month, body.listo);
  }

  @Post('types')
  createType(@Body(new ZodValidationPipe(fixedCostTypeInputSchema)) body: FixedCostTypeInput) {
    return this.fixedCosts.createType(body);
  }

  @Put('types/:id')
  updateType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(fixedCostTypeInputSchema)) body: FixedCostTypeInput,
  ) {
    return this.fixedCosts.updateType(id, body);
  }

  @Delete('types/:id')
  removeType(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.fixedCosts.removeType(id);
  }
}
