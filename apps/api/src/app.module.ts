import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
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
import { SalesModule } from './sales/sales.module';
import { FinanceModule } from './finance/finance.module';
import { HomeModule } from './home/home.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { HealthModule } from './health/health.module';

// Fase 1 — Recepción de leche, Elaboración (calculadora de costo), Inventario,
// Despacho y maestros. Lo demás quedó fuera de alcance.
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
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
    SalesModule,
    FinanceModule,
    HomeModule,
    ReportsModule,
    SettingsModule,
    ExchangeRatesModule,
    HealthModule,
  ],
})
export class AppModule {}
