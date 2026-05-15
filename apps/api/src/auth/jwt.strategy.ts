import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvService } from '../config/env.service';
import { UsersService } from '../users/users.service';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(env: EnvService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.jwt.accessSecret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtUserPayload): Promise<JwtUserPayload> {
    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida o usuario deshabilitado');
    }
    return { sub: user.id, email: user.email, role: user.role };
  }
}
