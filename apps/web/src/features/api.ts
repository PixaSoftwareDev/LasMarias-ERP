// API client centralizado por dominio. Las pantallas importan desde acá.

import type {
  Client,
  CreateClientInput,
  CreateDeliveryExceptionInput,
  CreateDeliveryZoneInput,
  CreateEmployeeInput,
  DeliveryException,
  CreatePriceListInput,
  CreateProductInput,
  CreatePurchaseOrderInput,
  CreateRecipeInput,
  CreateSalesOrderInput,
  CreateSupplierInput,
  DeliveryZone,
  Employee,
  Invoice,
  InventoryMovement,
  Notification,
  PriceList,
  Product,
  ProducerSettlement,
  ProductionOrder,
  PurchaseOrder,
  Recipe,
  RecipeSimulationResult,
  SalesOrder,
  SimulateRecipeInput,
  StockSummary,
  Supplier,
} from '@lasmarias/shared-schemas';
import type { ProducerDto } from './receptions/types';
import { api } from '@/lib/api-client';

export const productsApi = {
  list: () => api<Product[]>('/api/products'),
  create: (input: CreateProductInput) => api<Product>('/api/products', { method: 'POST', body: input }),
  listPresentations: (productId: string) => api<Array<{ id: string; productId: string; name: string; sku: string; netWeightG?: number; isActive: boolean; createdAt: string; updatedAt: string }>>(`/api/products/${productId}/presentations`),
  createPresentation: (productId: string, input: { name: string; sku: string; netWeightG?: number }) =>
    api(`/api/products/${productId}/presentations`, { method: 'POST', body: input }),
};

export const clientsApi = {
  list: () => api<Client[]>('/api/clients'),
  create: (input: CreateClientInput) => api<Client>('/api/clients', { method: 'POST', body: input }),
  update: (id: string, input: Partial<CreateClientInput>) => api<Client>(`/api/clients/${id}`, { method: 'PATCH', body: input }),
};

export const producersApi = {
  list: () => api<ProducerDto[]>('/api/producers'),
  create: (input: { name: string; agreedPricePerLiter?: number; phone?: string; city?: string; renspa?: string; notes?: string }) =>
    api<ProducerDto>('/api/producers', { method: 'POST', body: input }),
  update: (id: string, input: { name?: string; agreedPricePerLiter?: number; phone?: string; city?: string; renspa?: string; notes?: string }) =>
    api<ProducerDto>(`/api/producers/${id}`, { method: 'PATCH', body: input }),
};

export const recipesApi = {
  list: () => api<Recipe[]>('/api/recipes'),
  get: (id: string) => api<Recipe>(`/api/recipes/${id}`),
  create: (input: CreateRecipeInput) => api<Recipe>('/api/recipes', { method: 'POST', body: input }),
  simulate: (input: SimulateRecipeInput) =>
    api<RecipeSimulationResult>('/api/recipes/simulate', { method: 'POST', body: input }),
};

export const productionApi = {
  list: () => api<ProductionOrder[]>('/api/production-orders'),
  get: (id: string) => api<ProductionOrder>(`/api/production-orders/${id}`),
  open: (input: { recipeId: string; operatorId: string; startedAt: string; milkInputs: { batchId: string; liters: number }[]; notes?: string }) =>
    api<ProductionOrder>('/api/production-orders/open', { method: 'POST', body: input }),
  close: (id: string, input: { actualOutputs: { productId: string; quantity: number; isPrincipal: boolean }[]; notes?: string }) =>
    api<ProductionOrder>(`/api/production-orders/${id}/close`, { method: 'POST', body: input }),
};

export const inventoryApi = {
  stock: () => api<StockSummary[]>('/api/inventory/stock'),
  movements: () => api<InventoryMovement[]>('/api/inventory/movements'),
  traceback: (batchId: string) => api(`/api/inventory/traceback/${batchId}`),
};

export const deliveryApi = {
  listZones: () => api<DeliveryZone[]>('/api/delivery/zones'),
  createZone: (input: CreateDeliveryZoneInput) =>
    api<DeliveryZone>('/api/delivery/zones', { method: 'POST', body: input }),
  listExceptions: (zoneId?: string) =>
    api<DeliveryException[]>(`/api/delivery/exceptions${zoneId ? `?zoneId=${zoneId}` : ''}`),
  createException: (input: CreateDeliveryExceptionInput) =>
    api<DeliveryException>('/api/delivery/exceptions', { method: 'POST', body: input }),
  nextDate: (zoneId: string) => api<string>(`/api/delivery/zones/${zoneId}/next-date`),
};

export const salesApi = {
  listPriceLists: () => api<PriceList[]>('/api/sales/price-lists'),
  createPriceList: (input: CreatePriceListInput) =>
    api<PriceList>('/api/sales/price-lists', { method: 'POST', body: input }),
  listOrders: () => api<SalesOrder[]>('/api/sales/orders'),
  createOrder: (input: CreateSalesOrderInput) =>
    api<SalesOrder>('/api/sales/orders', { method: 'POST', body: input }),
  updateStatus: (id: string, status: SalesOrder['status']) =>
    api<SalesOrder>(`/api/sales/orders/${id}/status`, { method: 'PATCH', body: { status } }),
};

export const invoicesApi = {
  list: () => api<Invoice[]>('/api/invoices'),
  accountsReceivable: () => api('/api/invoices/accounts-receivable'),
  createFromOrder: (input: { salesOrderId: string; taxPercent?: number; dueDate?: string }) =>
    api<Invoice>('/api/invoices/from-order', { method: 'POST', body: input }),
  recordPayment: (id: string, input: { amount: number; method?: string; notes?: string }) =>
    api<Invoice>(`/api/invoices/${id}/payments`, { method: 'POST', body: input }),
};

export const suppliersApi = {
  list: () => api<Supplier[]>('/api/suppliers'),
  create: (input: CreateSupplierInput) => api<Supplier>('/api/suppliers', { method: 'POST', body: input }),
  listPurchaseOrders: () => api<PurchaseOrder[]>('/api/purchase-orders'),
  createPurchaseOrder: (input: CreatePurchaseOrderInput) =>
    api<PurchaseOrder>('/api/purchase-orders', { method: 'POST', body: input }),
  listSettlements: () => api<ProducerSettlement[]>('/api/producer-settlements'),
  calculateSettlement: (input: { producerId: string; periodFrom: string; periodTo: string }) =>
    api<ProducerSettlement>('/api/producer-settlements', { method: 'POST', body: input }),
};

export const hrApi = {
  listEmployees: () => api<Employee[]>('/api/employees'),
  createEmployee: (input: CreateEmployeeInput) =>
    api<Employee>('/api/employees', { method: 'POST', body: input }),
  attendanceDay: (date: string) => api(`/api/attendance/day?date=${date}`),
  hoursReport: (from: string, to: string) => api(`/api/attendance/hours-report?from=${from}&to=${to}`),
};

export const notificationsApi = {
  list: (unreadOnly = false) => api<Notification[]>(`/api/notifications?unreadOnly=${unreadOnly}`),
  unreadCount: () => api<{ count: number }>('/api/notifications/unread-count'),
  markRead: (id: string) => api<Notification>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
};

export const returnableContainersApi = {
  list: () => api('/api/returnable-containers'),
  create: (input: { name: string; code: string }) =>
    api('/api/returnable-containers', { method: 'POST', body: input }),
  listMovements: (clientId: string) =>
    api(`/api/returnable-containers/movements?clientId=${clientId}`),
  balance: (clientId: string) =>
    api(`/api/returnable-containers/balance?clientId=${clientId}`),
  createMovement: (input: {
    containerId: string;
    clientId: string;
    salesOrderId?: string;
    quantityOut: number;
    quantityIn: number;
    movementDate: string;
    notes?: string;
  }) => api('/api/returnable-containers/movements', { method: 'POST', body: input }),
};

export const maturationApi = {
  listByBatch: (batchId: string) => api(`/api/maturation/records?batchId=${batchId}`),
  create: (input: {
    batchId: string;
    warehouseId?: string;
    checkedAt: string;
    weightKg: number;
    notes?: string;
  }) => api('/api/maturation/records', { method: 'POST', body: input }),
};
