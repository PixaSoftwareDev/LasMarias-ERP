import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  createEmployeeInputSchema,
  ingestAttendanceInputSchema,
  manualAttendanceInputSchema,
  type CreateEmployeeInput,
  type IngestAttendanceInput,
  type ManualAttendanceInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HrService } from './hr.service';

@Controller()
export class HrController {
  constructor(private readonly hr: HrService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('employees')
  @Roles('admin', 'gerente')
  listEmployees() {
    return this.hr.listEmployees();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('employees')
  @Roles('admin', 'gerente')
  createEmployee(@Body(new ZodValidationPipe(createEmployeeInputSchema)) body: CreateEmployeeInput) {
    return this.hr.createEmployee(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('attendance/day')
  @Roles('admin', 'gerente')
  attendanceDay(@Query('date') date: string) {
    return this.hr.listEventsForDay(date);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('attendance/hours-report')
  @Roles('admin', 'gerente', 'contable')
  hoursReport(@Query('from') from: string, @Query('to') to: string) {
    return this.hr.hoursReport(from, to);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('attendance/manual')
  @Roles('admin', 'gerente', 'operario')
  manual(@Body(new ZodValidationPipe(manualAttendanceInputSchema)) body: ManualAttendanceInput) {
    return this.hr.manualAttendance(body);
  }

  // Endpoint para el microservicio ZKTeco. En prod debería usar mTLS o un token de servicio
  // distinto al JWT de usuarios. Por ahora queda abierto a JWT con rol admin/gerente desde el
  // microservicio que se autentique como usuario de servicio.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('attendance/events')
  @Roles('admin', 'gerente')
  ingest(@Body(new ZodValidationPipe(ingestAttendanceInputSchema)) body: IngestAttendanceInput) {
    return this.hr.ingestAttendance(body);
  }
}
