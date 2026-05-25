import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ReturnableContainersService, CreateContainerInput, CreateMovementInput } from './returnable-containers.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returnable-containers')
export class ReturnableContainersController {
  constructor(private readonly svc: ReturnableContainersService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  @Roles('admin', 'gerente')
  create(@Body() body: CreateContainerInput) {
    return this.svc.create(body);
  }

  @Get('movements')
  listMovements(@Query('clientId') clientId: string) {
    return this.svc.listMovements(clientId);
  }

  @Get('balance')
  balance(@Query('clientId', new ParseUUIDPipe()) clientId: string) {
    return this.svc.balanceByClient(clientId);
  }

  @Post('movements')
  createMovement(@Body() body: CreateMovementInput, @Request() req: { user: { id: string } }) {
    return this.svc.createMovement(body, req.user.id);
  }
}
