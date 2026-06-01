// API client centralizado por dominio. Las pantallas importan desde acá.

import type {
  Client,
  CreateClientInput,
  CreateProductInput,
  CreateRecipeInput,
  CreateRecipeVersionInput,
  CreateSalesOrderInput,
  UpdateClientInput,
  UpdateProductInput,
  InventoryMovement,
  Product,
  ProductionOrder,
  Recipe,
  RecipeSimulationResult,
  RecipeVersion,
  SalesOrder,
  SimulateRecipeInput,
  StockSummary,
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  User,
  UpdateMeInput,
  ChangePasswordInput,
  TraceForward,
  TraceBackward,
  FefoSuggestion,
  ProductionReportRow,
  SalesByClientRow,
  SalesByProductRow,
  YieldReportRow,
  ReportGranularity,
  ClientType,
  PriceListItem,
  UpsertPriceListInput,
  AccountBalance,
  AccountDetail,
  AccountMovement,
  RegisterPaymentInput,
  CreateReturnInput,
  CreditNote,
  CashMovement,
  CreateCashMovementInput,
  CashFlowReport,
  ProfitabilityRow,
  HomeSummary,
  HomeCalendar,
} from '@lasmarias/shared-schemas';
import type { ProducerDto } from './receptions/types';
import { api, downloadFile } from '@/lib/api-client';

export const productsApi = {
  list: () => api<Product[]>('/api/products'),
  create: (input: CreateProductInput) => api<Product>('/api/products', { method: 'POST', body: input }),
  update: (id: string, input: UpdateProductInput) =>
    api<Product>(`/api/products/${id}`, { method: 'PATCH', body: input }),
};

export const clientsApi = {
  list: () => api<Client[]>('/api/clients'),
  create: (input: CreateClientInput) => api<Client>('/api/clients', { method: 'POST', body: input }),
  update: (id: string, input: UpdateClientInput) =>
    api<Client>(`/api/clients/${id}`, { method: 'PATCH', body: input }),
};

export interface UpdateProducerInput {
  name?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  city?: string;
  agreedPricePerLiter?: number;
  notes?: string;
  isActive?: boolean;
}

export const producersApi = {
  list: () => api<ProducerDto[]>('/api/producers'),
  create: (input: { name: string; agreedPricePerLiter?: number; phone?: string; city?: string }) =>
    api<ProducerDto>('/api/producers', { method: 'POST', body: input }),
  update: (id: string, input: UpdateProducerInput) =>
    api<ProducerDto>(`/api/producers/${id}`, { method: 'PATCH', body: input }),
};

export const recipesApi = {
  list: () => api<Recipe[]>('/api/recipes'),
  get: (id: string) => api<Recipe>(`/api/recipes/${id}`),
  create: (input: CreateRecipeInput) => api<Recipe>('/api/recipes', { method: 'POST', body: input }),
  createVersion: (id: string, input: CreateRecipeVersionInput) =>
    api<RecipeVersion>(`/api/recipes/${id}/versions`, { method: 'POST', body: input }),
  simulate: (input: SimulateRecipeInput) =>
    api<RecipeSimulationResult>('/api/recipes/simulate', { method: 'POST', body: input }),
};

export const productionApi = {
  list: () => api<ProductionOrder[]>('/api/production-orders'),
  get: (id: string) => api<ProductionOrder>(`/api/production-orders/${id}`),
  open: (input: { recipeId: string; operatorId: string; startedAt: string; milkInputs: { batchId: string; liters: number }[]; notes?: string }) =>
    api<ProductionOrder>('/api/production-orders/open', { method: 'POST', body: input }),
  close: (id: string, input: { actualOutputs: { productId: string; quantity: number; isPrincipal: boolean }[]; warehouseId?: string; notes?: string }) =>
    api<ProductionOrder>(`/api/production-orders/${id}/close`, { method: 'POST', body: input }),
};

export interface ConsumableBatch {
  id: string;
  code: string;
  productId: string;
  productName: string;
  category: string;
  remainingQuantity: number;
  unit: string;
  unitCost: number | null;
  expirationDate?: string;
}

export const inventoryApi = {
  stock: () => api<StockSummary[]>('/api/inventory/stock'),
  movements: () => api<InventoryMovement[]>('/api/inventory/movements'),
  traceback: (batchId: string) => api(`/api/inventory/traceback/${batchId}`),
  // Trazabilidad bidireccional navegable (CLAUDE.md §4.4).
  traceForward: (batchId: string) => api<TraceForward>(`/api/inventory/trace-forward/${batchId}`),
  traceBackward: (batchId: string) => api<TraceBackward>(`/api/inventory/trace-backward/${batchId}`),
  // Sugerencia FEFO (solo lectura) para preview en despacho.
  fefoSuggestion: (productId: string, quantity: number) =>
    api<FefoSuggestion>(
      `/api/inventory/fefo-suggestion?productId=${encodeURIComponent(productId)}&quantity=${encodeURIComponent(quantity)}`,
    ),
  consumableBatches: (category?: string) =>
    api<ConsumableBatch[]>(`/api/inventory/batches${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  // Cámaras / sectores físicos de almacenamiento (CLAUDE.md §4.4).
  // includeInactive=true para la pantalla de gestión (poder reactivar las desactivadas).
  listWarehouses: (includeInactive = false) =>
    api<Warehouse[]>(`/api/inventory/warehouses${includeInactive ? '?all=true' : ''}`),
  createWarehouse: (input: CreateWarehouseInput) =>
    api<Warehouse>('/api/inventory/warehouses', { method: 'POST', body: input }),
  updateWarehouse: (id: string, input: UpdateWarehouseInput) =>
    api<Warehouse>(`/api/inventory/warehouses/${id}`, { method: 'PATCH', body: input }),
};

// "Mi cuenta": el usuario edita sus propios datos y cambia su contraseña.
export const authApi = {
  updateMe: (input: UpdateMeInput) => api<User>('/api/auth/me', { method: 'PATCH', body: input }),
  changePassword: (input: ChangePasswordInput) =>
    api<void>('/api/auth/me/password', { method: 'PATCH', body: input }),
};

// Reportes básicos (CLAUDE.md §4.9 / Fase 2). Solo lectura, roles admin/gerente.
// from/to como fecha ISO (YYYY-MM-DD).
function reportQs(params: Record<string, string>) {
  const usp = new URLSearchParams(params);
  return usp.toString();
}

function reportSales(from: string, to: string, by: 'client'): Promise<SalesByClientRow[]>;
function reportSales(from: string, to: string, by: 'product'): Promise<SalesByProductRow[]>;
function reportSales(from: string, to: string, by: 'client' | 'product') {
  return api<SalesByClientRow[] | SalesByProductRow[]>(`/api/reports/sales?${reportQs({ from, to, by })}`);
}

export const reportsApi = {
  production: (from: string, to: string, granularity: ReportGranularity) =>
    api<ProductionReportRow[]>(`/api/reports/production?${reportQs({ from, to, granularity })}`),
  sales: reportSales,
  yield: (from: string, to: string) => api<YieldReportRow[]>(`/api/reports/yield?${reportQs({ from, to })}`),
  // Rentabilidad por cliente (ingresos − costo de lo despachado).
  profitability: (from: string, to: string) =>
    api<ProfitabilityRow[]>(`/api/reports/profitability?${reportQs({ from, to })}`),
  // Exportar ventas por cliente del rango.
  exportSalesCsv: (from: string, to: string) =>
    downloadFile(`/api/reports/export/sales.csv?${reportQs({ from, to })}`, 'ventas-por-cliente.csv'),
};

// Fase comercial — Flujo de caja simple (ingresos = cobros, egresos = gastos).
// Roles admin/gerente. from/to como fecha ISO (YYYY-MM-DD).
export const financeApi = {
  cashMovements: (from: string, to: string) =>
    api<CashMovement[]>(`/api/finance/cash-movements?${reportQs({ from, to })}`),
  createCashMovement: (input: CreateCashMovementInput) =>
    api<CashMovement>('/api/finance/cash-movements', { method: 'POST', body: input }),
  cashFlow: (from: string, to: string, granularity: ReportGranularity) =>
    api<CashFlowReport>(`/api/finance/cash-flow?${reportQs({ from, to, granularity })}`),
  exportCashFlowCsv: (from: string, to: string, granularity: ReportGranularity) =>
    downloadFile(`/api/finance/export/cash-flow.csv?${reportQs({ from, to, granularity })}`, 'flujo-de-caja.csv'),
};

// Fase comercial — Home: resumen de KPIs + calendario mensual de eventos.
export const homeApi = {
  summary: () => api<HomeSummary>('/api/home/summary'),
  calendar: (month: string) => api<HomeCalendar>(`/api/home/calendar?month=${encodeURIComponent(month)}`),
};

// Fase comercial — Despacho directo (baja stock + cargo en cuenta), listas de
// precio por tipo de cliente, cuenta corriente, cobros y devoluciones.
export const salesApi = {
  listOrders: () => api<SalesOrder[]>('/api/sales/orders'),
  getOrder: (id: string) => api<SalesOrder>(`/api/sales/orders/${id}`),
  createOrder: (input: CreateSalesOrderInput) =>
    api<SalesOrder>('/api/sales/orders', { method: 'POST', body: input }),
  // Listas de precio por tipo de cliente (editable a mano).
  priceList: (clientType: ClientType) =>
    api<PriceListItem[]>(`/api/sales/price-list?clientType=${encodeURIComponent(clientType)}`),
  upsertPriceList: (input: UpsertPriceListInput) =>
    api<PriceListItem[]>('/api/sales/price-list', { method: 'PUT', body: input }),
  // Cuenta corriente.
  accounts: () => api<AccountBalance[]>('/api/sales/accounts'),
  accountDetail: (clientId: string) => api<AccountDetail>(`/api/sales/accounts/${clientId}`),
  registerPayment: (input: RegisterPaymentInput) =>
    api<AccountMovement>('/api/sales/payments', { method: 'POST', body: input }),
  // Devolución de un despacho → repone stock + nota de crédito en cuenta.
  createReturn: (orderId: string, input: CreateReturnInput) =>
    api<CreditNote>(`/api/sales/orders/${orderId}/returns`, { method: 'POST', body: input }),
  exportAccountsCsv: () => downloadFile('/api/sales/export/accounts.csv', 'cuentas-corrientes.csv'),
};
