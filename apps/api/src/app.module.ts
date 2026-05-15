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
import { RecipesModule } from './recipes/recipes.module';
import { ProductionModule } from './production/production.module';
import { InventoryModule } from './inventory/inventory.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SalesModule } from './sales/sales.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { HrModule } from './hr/hr.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueueModule,
    NotificationsModule, // global, debe ir temprano
    AuthModule,
    UsersModule,
    ClientsModule,
    ProductsModule,
    BatchesModule,
    ProducersModule,
    MilkReceptionsModule,
    RecipesModule,
    ProductionModule,
    InventoryModule,
    DeliveryModule,
    SalesModule,
    InvoicesModule,
    SuppliersModule,
    HrModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
