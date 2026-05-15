import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { EnvService } from '../config/env.service';
import { UsersService } from '../users/users.service';

interface RefreshPayload {
  sub: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(env: EnvService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: env.jwt.refreshSecret,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: RefreshPayload) {
    const refreshToken = (req.body as { refreshToken?: string })?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Falta el refresh token');
    const valid = await this.users.verifyRefreshToken(payload.sub, refreshToken);
    if (!valid) throw new UnauthorizedException('Refresh token inválido');
    return { sub: payload.sub, refreshToken };
  }
}
