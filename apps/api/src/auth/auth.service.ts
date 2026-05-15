import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens, LoginInput, User } from '@lasmarias/shared-schemas';
import { EnvService } from '../config/env.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
  ) {}

  async login(input: LoginInput): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    const valid = await this.users.verifyPassword(user, input.password);
    if (!valid) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.users.setRefreshToken(user.id, tokens.refreshToken);
    return { user: this.users.toDto(user), tokens };
  }

  async refresh(userId: string): Promise<AuthTokens> {
    const user = await this.users.findById(userId);
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.users.setRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.users.setRefreshToken(userId, null);
  }

  private async issueTokens(sub: string, email: string, role: string): Promise<AuthTokens> {
    const accessPayload = { sub, email, role };
    const refreshPayload = { sub };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.env.jwt.accessSecret,
      expiresIn: this.env.jwt.accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.env.jwt.refreshSecret,
      expiresIn: this.env.jwt.refreshTtl,
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: parseTtlToSeconds(this.env.jwt.accessTtl),
    };
  }
}

// "15m", "7d", "3600", "1h" → segundos
function parseTtlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd]?)$/.exec(ttl);
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default:  return n;
  }
}
