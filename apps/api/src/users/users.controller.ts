import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import {
  createUserInputSchema,
  updateUserInputSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('admin', 'gerente')
  list() {
    return this.users.list();
  }

  @Post()
  @Roles('admin')
  @UsePipes(new ZodValidationPipe(createUserInputSchema))
  create(@Body() body: CreateUserInput) {
    return this.users.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateUserInputSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(id, body);
  }
}
