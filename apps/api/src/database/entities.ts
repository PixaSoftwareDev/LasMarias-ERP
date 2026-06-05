// Registro centralizado de entidades (Fase 1).

import { UserEntity } from '../users/user.entity';
import { ClientEntity } from '../clients/client.entity';
import { ProductEntity } from '../products/product.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { ProducerPaymentEntity } from '../producers/producer-payment.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { PriceListItemEntity } from '../sales/price-list-item.entity';
import { AccountMovementEntity } from '../sales/account-movement.entity';
import { CreditNoteEntity } from '../sales/credit-note.entity';
import { CashMovementEntity } from '../finance/cash-movement.entity';
import { AppSettingEntity } from '../settings/app-setting.entity';
import { ExchangeRateEntity } from '../exchange-rates/exchange-rate.entity';
import { SupplierEntity } from '../suppliers/supplier.entity';
import { PayableEntity } from '../suppliers/payable.entity';
import { SupplierPaymentEntity } from '../suppliers/supplier-payment.entity';

export const entities = [
  UserEntity,
  ClientEntity,
  ProductEntity,
  BatchEntity,
  ProducerEntity,
  ProducerPaymentEntity,
  MilkReceptionEntity,
  RecipeEntity,
  RecipeVersionEntity,
  ProductionOrderEntity,
  WarehouseEntity,
  InventoryMovementEntity,
  SalesOrderEntity,
  PriceListItemEntity,
  AccountMovementEntity,
  CreditNoteEntity,
  CashMovementEntity,
  AppSettingEntity,
  ExchangeRateEntity,
  SupplierEntity,
  PayableEntity,
  SupplierPaymentEntity,
];
