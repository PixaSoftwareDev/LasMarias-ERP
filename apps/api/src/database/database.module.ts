import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvService } from '../config/env.service';
import { entities } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        type: 'postgres' as const,
        host: env.postgres.host,
        port: env.postgres.port,
        database: env.postgres.database,
        username: env.postgres.username,
        password: env.postgres.password,
        entities,
        synchronize: false, // siempre migraciones, nunca synchronize en prod
        migrationsRun: false,
        logging: !env.isProduction ? ['error', 'warn', 'migration'] : ['error'],
      }),
    }),
  ],
})
export class DatabaseModule {}
