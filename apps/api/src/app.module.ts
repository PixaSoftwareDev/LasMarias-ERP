import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queues/queue.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ProductsModule } from './products/products.module';
import { BatchesModule } from './batches/batches.module';
import { ProducersModule } from './producers/producers.module';
import { MilkReceptionsModule } from './milk-receptions/milk-receptions.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueueModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ProductsModule,
    BatchesModule,
    ProducersModule,
    MilkReceptionsModule,
    HealthModule,
  ],
})
export class AppModule {}
