import { Injectable } from '@nestjs/common';
import { type Env, loadEnv } from './env.schema';

@Injectable()
export class EnvService {
  private readonly env: Env;

  constructor() {
    this.env = loadEnv();
  }

  get nodeEnv() {
    return this.env.NODE_ENV;
  }

  get isProduction() {
    return this.env.NODE_ENV === 'production';
  }

  get apiPort() {
    return this.env.API_PORT;
  }

  get apiHost() {
    return this.env.API_HOST;
  }

  get postgres() {
    return {
      host: this.env.POSTGRES_HOST,
      port: this.env.POSTGRES_PORT,
      database: this.env.POSTGRES_DB,
      username: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
    };
  }

  get redis() {
    return {
      host: this.env.REDIS_HOST,
      port: this.env.REDIS_PORT,
    };
  }

  get jwt() {
    return {
      accessSecret: this.env.JWT_ACCESS_SECRET,
      refreshSecret: this.env.JWT_REFRESH_SECRET,
      accessTtl: this.env.JWT_ACCESS_TTL,
      refreshTtl: this.env.JWT_REFRESH_TTL,
    };
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGIN.split(',').map((o) => o.trim());
  }
}
