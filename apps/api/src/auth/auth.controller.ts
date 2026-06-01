import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import {
  loginInputSchema,
  refreshInputSchema,
  updateMeInputSchema,
  changePasswordInputSchema,
  type LoginInput,
  type UpdateMeInput,
  type ChangePasswordInput,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtRefreshGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginInputSchema))
  async login(@Body() body: LoginInput) {
    return this.auth.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @UsePipes(new ZodValidationPipe(refreshInputSchema))
  async refresh(@CurrentUser() user: { sub: string }) {
    return this.auth.refresh(user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: JwtUserPayload) {
    await this.auth.logout(user.sub);
  }

  // "Mi cuenta": editar mis datos. El id sale del token, nunca del body.
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: JwtUserPayload,
    @Body(new ZodValidationPipe(updateMeInputSchema)) body: UpdateMeInput,
  ) {
    return this.auth.updateProfile(user.sub, body);
  }

  // "Mi cuenta": cambiar mi contraseña (exige la actual).
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: JwtUserPayload,
    @Body(new ZodValidationPipe(changePasswordInputSchema)) body: ChangePasswordInput,
  ) {
    await this.auth.changePassword(user.sub, body);
  }
}
