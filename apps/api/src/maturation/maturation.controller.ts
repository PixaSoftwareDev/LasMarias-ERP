import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MaturationService, CreateMaturationRecordInput } from './maturation.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('maturation')
export class MaturationController {
  constructor(private readonly svc: MaturationService) {}

  @Get('records')
  @Roles('admin', 'gerente', 'operario')
  list(@Query('batchId') batchId?: string) {
    return this.svc.list(batchId);
  }

  @Post('records')
  create(@Body() body: CreateMaturationRecordInput, @Request() req: { user: { id: string } }) {
    return this.svc.create(body, req.user.id);
  }
}
