import { Body, Controller, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  createDeliveryExceptionInputSchema,
  createDeliveryZoneInputSchema,
  type CreateDeliveryExceptionInput,
  type CreateDeliveryZoneInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DeliveryService } from './delivery.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('zones')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  listZones() {
    return this.delivery.listZones();
  }

  @Post('zones')
  @Roles('admin', 'gerente')
  createZone(@Body(new ZodValidationPipe(createDeliveryZoneInputSchema)) body: CreateDeliveryZoneInput) {
    return this.delivery.createZone(body);
  }

  @Get('exceptions')
  @Roles('admin', 'gerente', 'vendedor')
  listExceptions(@Query('zoneId', new ParseUUIDPipe({ optional: true })) zoneId?: string) {
    return this.delivery.listExceptions(zoneId);
  }

  @Post('exceptions')
  @Roles('admin', 'gerente')
  createException(
    @Body(new ZodValidationPipe(createDeliveryExceptionInputSchema)) body: CreateDeliveryExceptionInput,
  ) {
    return this.delivery.createException(body);
  }

  @Get('next-date')
  @Roles('admin', 'gerente', 'vendedor', 'repartidor')
  nextDate(@Query('zoneId', new ParseUUIDPipe()) zoneId: string) {
    return this.delivery.nextDateForZone(zoneId);
  }
}
