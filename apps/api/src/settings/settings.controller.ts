import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  updateCompanySettingsSchema,
  updateQualityLimitsSchema,
  type UpdateCompanySettingsInput,
  type UpdateQualityLimitsInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Lectura: cualquier usuario autenticado (el remito necesita los datos de la empresa).
  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Patch('company')
  @Roles('admin')
  updateCompany(
    @Body(new ZodValidationPipe(updateCompanySettingsSchema)) body: UpdateCompanySettingsInput,
  ) {
    return this.settings.updateCompany(body);
  }

  @Patch('quality-limits')
  @Roles('admin')
  updateQualityLimits(
    @Body(new ZodValidationPipe(updateQualityLimitsSchema)) body: UpdateQualityLimitsInput,
  ) {
    return this.settings.updateQualityLimits(body);
  }
}
