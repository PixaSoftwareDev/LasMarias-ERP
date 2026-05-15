import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnvService } from '../config/env.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        connection: {
          host: env.redis.host,
          port: env.redis.port,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
