// Registro centralizado de entidades.

import { UserEntity } from '../users/user.entity';
import { ClientEntity } from '../clients/client.entity';
import { ProductEntity } from '../products/product.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { DeliveryExceptionEntity, DeliveryZoneEntity } from '../delivery/delivery-zone.entity';
import { PriceListEntity, PriceListItemEntity } from '../sales/price-list.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { SupplierEntity } from '../suppliers/supplier.entity';
import { PurchaseOrderEntity } from '../suppliers/purchase-order.entity';
import { ProducerSettlementEntity } from '../suppliers/producer-settlement.entity';
import { EmployeeEntity } from '../hr/employee.entity';
import { AttendanceEventEntity } from '../hr/attendance-event.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { AuditLogEntity } from '../notifications/audit-log.entity';
import { ProductPresentationEntity } from '../products/product-presentation.entity';
import { ReturnableContainerEntity } from '../returnable-containers/returnable-container.entity';
import { ReturnableContainerMovementEntity } from '../returnable-containers/returnable-container-movement.entity';
import { MaturationRecordEntity } from '../maturation/maturation-record.entity';

export const entities = [
  UserEntity,
  ClientEntity,
  ProductEntity,
  BatchEntity,
  ProducerEntity,
  MilkReceptionEntity,
  RecipeEntity,
  RecipeVersionEntity,
  ProductionOrderEntity,
  WarehouseEntity,
  InventoryMovementEntity,
  DeliveryZoneEntity,
  DeliveryExceptionEntity,
  PriceListEntity,
  PriceListItemEntity,
  SalesOrderEntity,
  InvoiceEntity,
  SupplierEntity,
  PurchaseOrderEntity,
  ProducerSettlementEntity,
  EmployeeEntity,
  AttendanceEventEntity,
  NotificationEntity,
  AuditLogEntity,
  ProductPresentationEntity,
  ReturnableContainerEntity,
  ReturnableContainerMovementEntity,
  MaturationRecordEntity,
];
