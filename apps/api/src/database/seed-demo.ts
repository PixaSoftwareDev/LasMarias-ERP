/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Seed de demostración — 3 meses de uso simulado (Feb–May 2026).
 * Crea toda la cadena: productores → recepciones → producción → inventario → ventas → comprobantes.
 *
 * Uso: pnpm --filter @lasmarias/api seed:demo
 * ATENCIÓN: limpia toda la data existente antes de insertar. Solo para desarrollo.
 */
// @ts-nocheck

import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import AppDataSource from './data-source';
import { UserEntity } from '../users/user.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { ProductEntity } from '../products/product.entity';
import { RecipeEntity, RecipeVersionEntity } from '../recipes/recipe.entity';
import { ClientEntity } from '../clients/client.entity';
import { DeliveryZoneEntity } from '../delivery/delivery-zone.entity';
import { BatchEntity } from '../batches/batch.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';
import { ProductionOrderEntity } from '../production/production-order.entity';
import { InventoryMovementEntity } from '../inventory/inventory-movement.entity';
import { WarehouseEntity } from '../inventory/warehouse.entity';
import { PriceListEntity, PriceListItemEntity } from '../sales/price-list.entity';
import { SalesOrderEntity } from '../sales/sales-order.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { SupplierEntity } from '../suppliers/supplier.entity';
import { EmployeeEntity } from '../hr/employee.entity';
import { MaturationRecordEntity } from '../maturation/maturation-record.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function subDays(d: Date, n: number) { return addDays(d, -n); }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] as T; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

const TODAY = new Date('2026-05-21T12:00:00Z');
const START = new Date('2026-02-17T00:00:00Z'); // ~3 meses atrás

// ---------------------------------------------------------------------------
// Truncate all tables (dev only)
// ---------------------------------------------------------------------------
async function truncateAll() {
  const tables = [
    'maturation_records', 'returnable_container_movements', 'returnable_containers',
    'invoices', 'sales_orders', 'price_list_items', 'price_lists',
    'inventory_movements', 'production_orders', 'milk_receptions',
    'batches', 'recipe_versions', 'recipes',
    'clients', 'products', 'producers', 'delivery_zones', 'delivery_exceptions',
    'warehouses', 'employees', 'suppliers',
    'attendance_events', 'audit_logs', 'notifications',
  ];
  for (const t of tables) {
    try {
      await AppDataSource.query(`TRUNCATE TABLE ${t} CASCADE`);
    } catch {
      // tabla podría no existir todavía
    }
  }
  // Mantener el admin
  await AppDataSource.query(`DELETE FROM users WHERE role != 'admin'`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seedDemo() {
  await AppDataSource.initialize();
  console.log('[seed-demo] Conectado a la base de datos');

  // -----------------------------------------------------------------------
  // 0. Limpiar y preparar usuario admin
  // -----------------------------------------------------------------------
  await truncateAll();
  console.log('[seed-demo] Tablas vaciadas');

  const userRepo = AppDataSource.getRepository(UserEntity);
  let admin = await userRepo.findOne({ where: { role: 'admin' } });
  if (!admin) {
    admin = userRepo.create({
      email: 'admin@lasmarias.local',
      passwordHash: await bcrypt.hash('Admin123!Cambiar', 12),
      fullName: 'Administrador',
      role: 'admin',
      isActive: true,
    });
    admin = await userRepo.save(admin);
  }

  // Operario
  const operario = await userRepo.save(userRepo.create({
    email: 'operario@lasmarias.local',
    passwordHash: await bcrypt.hash('Operario123!', 12),
    fullName: 'Carlos Rodríguez',
    role: 'operario',
    isActive: true,
  }));

  // Vendedor
  const vendedor = await userRepo.save(userRepo.create({
    email: 'ventas@lasmarias.local',
    passwordHash: await bcrypt.hash('Ventas123!', 12),
    fullName: 'María González',
    role: 'vendedor',
    isActive: true,
  }));

  console.log('[seed-demo] Usuarios creados');

  // -----------------------------------------------------------------------
  // 1. Empleados
  // -----------------------------------------------------------------------
  const empRepo = AppDataSource.getRepository(EmployeeEntity);
  const empleados = await empRepo.save([
    empRepo.create({ firstName: 'Carlos', lastName: 'Rodríguez', documentNumber: '28.456.789', sector: 'Producción', shift: 'morning', hourlyCost: '850', hiredAt: '2019-03-10', isActive: true }),
    empRepo.create({ firstName: 'Ana', lastName: 'Martínez', documentNumber: '32.111.234', sector: 'Producción', shift: 'morning', hourlyCost: '850', hiredAt: '2021-06-15', isActive: true }),
    empRepo.create({ firstName: 'Luis', lastName: 'Pérez', documentNumber: '35.678.901', sector: 'Deposito', shift: 'morning', hourlyCost: '780', hiredAt: '2022-01-05', isActive: true }),
    empRepo.create({ firstName: 'Jorge', lastName: 'Fernández', documentNumber: '27.890.123', sector: 'Reparto', shift: 'morning', hourlyCost: '820', hiredAt: '2018-07-20', isActive: true }),
    empRepo.create({ firstName: 'Sandra', lastName: 'López', documentNumber: '40.234.567', sector: 'Administración', shift: 'morning', hourlyCost: '900', hiredAt: '2023-04-01', isActive: true }),
  ]);
  console.log('[seed-demo] Empleados creados:', empleados.length);

  // -----------------------------------------------------------------------
  // 2. Productores de leche
  // -----------------------------------------------------------------------
  const prodRepo = AppDataSource.getRepository(ProducerEntity);
  const producers = await prodRepo.save([
    prodRepo.create({ name: 'Tambo El Amanecer', taxId: '20-12345678-9', phone: '02477-15-412233', address: 'Ruta 32 km 45', city: 'Pergamino', agreedPricePerLiter: '280.00', renspa: '06.080.0.01234/00', isActive: true }),
    prodRepo.create({ name: 'La Blanqueada - Suc. Hnos. Funes', taxId: '20-87654321-1', phone: '02477-15-523344', address: 'Camino Carrasco s/n', city: 'Fontezuela', agreedPricePerLiter: '275.00', renspa: '06.080.0.05678/00', isActive: true }),
    prodRepo.create({ name: 'Tambo Don Ramón SA', taxId: '30-11223344-5', phone: '02477-15-634455', address: 'Estancia Los Álamos', city: 'Pergamino', agreedPricePerLiter: '285.00', renspa: '06.080.0.09012/00', isActive: true }),
    prodRepo.create({ name: 'Cabaña Las Flores', taxId: '20-55443322-7', phone: '02477-15-745566', address: 'Colonia El Trébole', city: 'Acevedo', agreedPricePerLiter: '272.00', renspa: '06.080.0.03456/00', isActive: true }),
  ]);
  console.log('[seed-demo] Productores creados:', producers.length);

  // -----------------------------------------------------------------------
  // 3. Proveedores (insumos)
  // -----------------------------------------------------------------------
  const suppRepo = AppDataSource.getRepository(SupplierEntity);
  await suppRepo.save([
    suppRepo.create({ businessName: 'Chr. Hansen Argentina SA', taxId: '30-56789012-3', contactName: 'Diego Vela', email: 'dvela@chrhansen.com', phone: '011-4444-5678', notes: 'Fermentos y cuajo', isActive: true }),
    suppRepo.create({ businessName: 'Salinas del Norte', taxId: '30-23456789-1', contactName: 'Patricia Ruiz', phone: '0343-15-777888', notes: 'Sal gruesa industrial', isActive: true }),
    suppRepo.create({ businessName: 'Envases Flexibles SA', taxId: '30-34567890-2', contactName: 'Roberto Castro', email: 'rcastro@envases.com.ar', phone: '011-5555-6789', notes: 'Film y envases al vacío', isActive: true }),
    suppRepo.create({ businessName: 'Lubricentro Industrial', taxId: '20-67890123-4', notes: 'Limpieza y lubricantes planta', isActive: true }),
  ]);

  // -----------------------------------------------------------------------
  // 4. Productos
  // -----------------------------------------------------------------------
  const prodtRepo = AppDataSource.getRepository(ProductEntity);
  const products = await prodtRepo.save([
    // Quesos
    prodtRepo.create({ sku: 'QCS-001', name: 'Queso Cremoso Horma', description: 'Queso cremoso artesanal, horma 4 kg aprox.', category: 'queso', unit: 'kg', trackBatches: true, ivaRatePercent: '10.5', isActive: true }),
    prodtRepo.create({ sku: 'QCA-001', name: 'Queso Cuartirolo', description: 'Queso blando tipo cuartirolo, hormas de 2 kg', category: 'queso', unit: 'kg', trackBatches: true, ivaRatePercent: '10.5', isActive: true }),
    prodtRepo.create({ sku: 'QPT-001', name: 'Queso Pategrás', description: 'Queso semiblando con ojos, hormas 5 kg', category: 'queso', unit: 'kg', trackBatches: true, ivaRatePercent: '10.5', isActive: true }),
    prodtRepo.create({ sku: 'QPR-001', name: 'Queso Provoleta', description: 'Provoleta lista para asar, kg', category: 'queso', unit: 'kg', trackBatches: true, ivaRatePercent: '10.5', isActive: true }),
    // Subproductos
    prodtRepo.create({ sku: 'RCT-001', name: 'Ricota', description: 'Ricota fresca de primer suero', category: 'subproducto', unit: 'kg', trackBatches: true, ivaRatePercent: '0', isActive: true }),
    prodtRepo.create({ sku: 'SUR-001', name: 'Suero líquido', description: 'Suero de quesería para chanchería', category: 'subproducto', unit: 'litro', trackBatches: false, ivaRatePercent: '0', isActive: true }),
    // Materia prima
    prodtRepo.create({ sku: 'LCR-001', name: 'Leche cruda', description: 'Leche cruda recepcionada', category: 'materia_prima', unit: 'litro', trackBatches: true, ivaRatePercent: '0', isActive: true }),
    // Insumos
    prodtRepo.create({ sku: 'INS-FER', name: 'Fermento láctico', category: 'insumo', unit: 'kg', trackBatches: false, ivaRatePercent: '21', isActive: true }),
    prodtRepo.create({ sku: 'INS-CUJ', name: 'Cuajo líquido', category: 'insumo', unit: 'litro', trackBatches: false, ivaRatePercent: '21', isActive: true }),
    prodtRepo.create({ sku: 'INS-SAL', name: 'Sal fina', category: 'insumo', unit: 'kg', trackBatches: false, ivaRatePercent: '0', isActive: true }),
  ]);

  const pQCS = products.find(p => p.sku === 'QCS-001')!;
  const pQCA = products.find(p => p.sku === 'QCA-001')!;
  const pQPT = products.find(p => p.sku === 'QPT-001')!;
  const pQPR = products.find(p => p.sku === 'QPR-001')!;
  const pRCT = products.find(p => p.sku === 'RCT-001')!;
  console.log('[seed-demo] Productos creados:', products.length);

  // -----------------------------------------------------------------------
  // 5. Recetas
  // -----------------------------------------------------------------------
  const recipeRepo = AppDataSource.getRepository(RecipeEntity);
  const versionRepo = AppDataSource.getRepository(RecipeVersionEntity);

  // El fermentoProductId se usa como placeholder — en producción real habría productos de insumo con ID real
  const fermentoId = products.find(p => p.sku === 'INS-FER')!.id;
  const cuajoId = products.find(p => p.sku === 'INS-CUJ')!.id;
  const salId = products.find(p => p.sku === 'INS-SAL')!.id;
  const ricotaId = pRCT.id;

  type VRaw = Omit<RecipeVersionEntity, 'id' | 'createdAt' | 'updatedAt' | 'recipe'>;

  async function createRecipe(productId: string, name: string, baseYield: number, wastePercent: number, fatSensitivity: number): Promise<{ recipe: RecipeEntity; version: RecipeVersionEntity }> {
    const recipe = await recipeRepo.save(recipeRepo.create({ productId, name, description: `Receta estándar ${name}`, isActive: true }));
    const vRaw: VRaw = {
      recipeId: recipe.id,
      versionNumber: 1,
      baseYieldKgPerLiter: String(baseYield),
      yieldSensitivityFat: String(fatSensitivity),
      yieldSensitivityProtein: '0.0030',
      baselineFatPercent: '3.40',
      baselineProteinPercent: '3.20',
      standardWastePercent: String(wastePercent),
      ingredients: [
        { productId: fermentoId, productName: 'Fermento láctico', quantity: 0.0002, unit: 'kg', basis: 'per_liter_milk' },
        { productId: cuajoId, productName: 'Cuajo líquido', quantity: 0.0003, unit: 'litro', basis: 'per_liter_milk' },
        { productId: salId, productName: 'Sal fina', quantity: 0.005, unit: 'kg', basis: 'per_liter_milk' },
      ],
      byproducts: [
        { name: 'Ricota', expectedYield: 0.032, unit: 'kg', basis: 'per_liter_milk', destination: 'sale', destinationProductId: ricotaId },
        { name: 'Suero', expectedYield: 0.85, unit: 'litro', basis: 'per_liter_milk', destination: 'sale' },
      ],
      isActive: true,
      notes: null,
    } as VRaw;
    const version = await versionRepo.save(versionRepo.create(vRaw as Partial<RecipeVersionEntity>));
    return { recipe, version: version as RecipeVersionEntity };
  }

  const { recipe: recipeQCS, version: versionQCS } = await createRecipe(pQCS.id, 'Queso Cremoso Estándar', 0.115, 1.5, 0.0045);
  const { recipe: recipeQCA, version: versionQCA } = await createRecipe(pQCA.id, 'Queso Cuartirolo Estándar', 0.108, 2.0, 0.0040);
  const { recipe: recipeQPT, version: versionQPT } = await createRecipe(pQPT.id, 'Queso Pategrás Estándar', 0.100, 1.8, 0.0038);
  const { recipe: recipeQPR, version: versionQPR } = await createRecipe(pQPR.id, 'Provoleta Estándar', 0.098, 2.2, 0.0035);
  console.log('[seed-demo] Recetas creadas');

  // -----------------------------------------------------------------------
  // 6. Zonas de reparto
  // -----------------------------------------------------------------------
  const zoneRepo = AppDataSource.getRepository(DeliveryZoneEntity);
  const zones = await zoneRepo.save([
    zoneRepo.create({ name: 'Pergamino Centro', deliveryDays: ['mon', 'wed', 'fri'], cutoffTime: '16:00', isActive: true }),
    zoneRepo.create({ name: 'Pergamino Norte', deliveryDays: ['tue', 'thu'], cutoffTime: '15:00', isActive: true }),
    zoneRepo.create({ name: 'San Nicolás', deliveryDays: ['mon', 'fri'], cutoffTime: '14:00', isActive: true }),
    zoneRepo.create({ name: 'Rosario / Gran Rosario', deliveryDays: ['wed'], cutoffTime: '12:00', isActive: true }),
    zoneRepo.create({ name: 'Fontezuela y alrededores', deliveryDays: ['tue', 'fri'], cutoffTime: '16:00', isActive: true }),
  ]);
  console.log('[seed-demo] Zonas creadas:', zones.length);

  // -----------------------------------------------------------------------
  // 7. Clientes
  // -----------------------------------------------------------------------
  const clientRepo = AppDataSource.getRepository(ClientEntity);
  const clients = await clientRepo.save([
    // Mayoristas
    clientRepo.create({ businessName: 'Distribuidora El Lechero SRL', taxId: '30-44556677-8', type: 'mayorista', email: 'compras@ellechero.com.ar', phone: '02477-428800', address: 'Av. Constitución 1240', city: 'Pergamino', zoneId: zones[0].id, isActive: true }),
    clientRepo.create({ businessName: 'Súper Ahorro SA', taxId: '30-11223355-6', type: 'mayorista', email: 'proveedores@superahorro.com.ar', phone: '0336-4478800', address: 'Ruta 8 km 159', city: 'San Nicolás', zoneId: zones[2].id, isActive: true }),
    clientRepo.create({ businessName: 'Lácteos del Norte SA', taxId: '30-55667788-9', type: 'mayorista', phone: '0336-4412345', city: 'San Nicolás', zoneId: zones[2].id, isActive: true }),
    // Distribuidores
    clientRepo.create({ businessName: 'Distribuciones Fontezuela', taxId: '20-23334445-6', type: 'distribuidor', phone: '02477-15-623456', city: 'Fontezuela', zoneId: zones[4].id, isActive: true }),
    clientRepo.create({ businessName: 'La Delicia - Dist. Rosario', taxId: '30-88990011-2', type: 'distribuidor', email: 'ladelicia@gmail.com', phone: '0341-15-7890123', city: 'Rosario', zoneId: zones[3].id, isActive: true }),
    // Minoristas (dietéticas, rotiserías, etc.)
    clientRepo.create({ businessName: 'Dietética Natural y Sano', taxId: '20-34445556-7', type: 'minorista', phone: '02477-15-789012', address: 'Av. Belgrano 540', city: 'Pergamino', zoneId: zones[0].id, isActive: true }),
    clientRepo.create({ businessName: 'Almacén Don Pedro', taxId: null, type: 'minorista', phone: '02477-15-890123', city: 'Pergamino', zoneId: zones[0].id, isActive: true }),
    clientRepo.create({ businessName: 'Rotisería La Esquina', taxId: '27-45556667-8', type: 'minorista', phone: '02477-15-901234', city: 'Pergamino', zoneId: zones[1].id, isActive: true }),
    clientRepo.create({ businessName: 'Super Fami Norte', taxId: '30-77889900-1', type: 'minorista', phone: '02477-427700', address: 'Av. del Trabajo 850', city: 'Pergamino', zoneId: zones[1].id, isActive: true }),
    clientRepo.create({ businessName: 'El Rincón del Queso', taxId: '27-56667778-9', type: 'minorista', phone: '02477-15-012345', address: 'Rivadavia 420', city: 'Pergamino', zoneId: zones[0].id, isActive: true }),
  ]);
  console.log('[seed-demo] Clientes creados:', clients.length);

  // -----------------------------------------------------------------------
  // 8. Listas de precios
  // -----------------------------------------------------------------------
  const plRepo = AppDataSource.getRepository(PriceListEntity);
  const pliRepo = AppDataSource.getRepository(PriceListItemEntity);

  async function createPriceList(name: string, type: 'minorista' | 'mayorista' | 'distribuidor', prices: Record<string, number>) {
    const list = await plRepo.save(plRepo.create({ name, clientType: type, isActive: true, validFrom: null, validTo: null }));
    const items = Object.entries(prices).map(([productId, price]) =>
      pliRepo.create({ priceListId: list.id, productId, unitPrice: String(price) })
    );
    await pliRepo.save(items);
    return list;
  }

  await createPriceList('Lista Minorista Mayo 2026', 'minorista', {
    [pQCS.id]: 4200, [pQCA.id]: 3800, [pQPT.id]: 4800, [pQPR.id]: 5200, [pRCT.id]: 1800,
  });
  await createPriceList('Lista Mayorista Mayo 2026', 'mayorista', {
    [pQCS.id]: 3600, [pQCA.id]: 3200, [pQPT.id]: 4100, [pQPR.id]: 4500, [pRCT.id]: 1400,
  });
  await createPriceList('Lista Distribuidores Mayo 2026', 'distribuidor', {
    [pQCS.id]: 3300, [pQCA.id]: 2900, [pQPT.id]: 3800, [pQPR.id]: 4200, [pRCT.id]: 1200,
  });
  console.log('[seed-demo] Listas de precios creadas');

  // -----------------------------------------------------------------------
  // 9. Depósito / almacén
  // -----------------------------------------------------------------------
  const warehouseRepo = AppDataSource.getRepository(WarehouseEntity);
  const cameraFria = await warehouseRepo.save(warehouseRepo.create({ code: 'CAM-01', name: 'Cámara Fría 1', kind: 'cold_chamber', targetTemperatureCelsius: '3', isActive: true }));
  const depositoMaduración = await warehouseRepo.save(warehouseRepo.create({ code: 'MAD-01', name: 'Cava de Maduración', kind: 'maturation', targetTemperatureCelsius: '13', isActive: true }));

  // -----------------------------------------------------------------------
  // 10. Recepciones de leche + batches de leche + producción (3 meses)
  // -----------------------------------------------------------------------
  const receptionRepo = AppDataSource.getRepository(MilkReceptionEntity);
  const batchRepo = AppDataSource.getRepository(BatchEntity);
  const productionRepo = AppDataSource.getRepository(ProductionOrderEntity);
  const movementRepo = AppDataSource.getRepository(InventoryMovementEntity);
  const maturationRepo = AppDataSource.getRepository(MaturationRecordEntity);

  // Variables de estado
  let milkBatchSeq: Record<string, number> = {};
  let orderSeq: Record<string, number> = {};
  let invoiceSeq = 0;

  function nextMilkCode(date: Date) {
    const key = fmtDate(date);
    milkBatchSeq[key] = (milkBatchSeq[key] ?? 0) + 1;
    const d = fmtDate(date).replace(/-/g, '');
    return `LM-${d}-${String(milkBatchSeq[key]).padStart(4, '0')}`;
  }
  function nextOrderCode(date: Date) {
    const key = fmtDate(date);
    orderSeq[key] = (orderSeq[key] ?? 0) + 1;
    const d = fmtDate(date).replace(/-/g, '');
    return `OP-${d}-${String(orderSeq[key]).padStart(4, '0')}`;
  }
  let salesSeq = 0;
  function nextSalesCode() {
    salesSeq++;
    const d = fmtDate(TODAY).replace(/-/g, '');
    return `PV-${d}-${String(salesSeq).padStart(4, '0')}`;
  }
  function nextInvoiceNumber() {
    invoiceSeq++;
    return `0001-${String(invoiceSeq).padStart(8, '0')}`;
  }

  // Recetas disponibles para producción con sus pesos relativos
  const recipesForProduction = [
    { recipe: recipeQCS, version: versionQCS, product: pQCS, weight: 40 },
    { recipe: recipeQCA, version: versionQCA, product: pQCA, weight: 25 },
    { recipe: recipeQPT, version: versionQPT, product: pQPT, weight: 20 },
    { recipe: recipeQPR, version: versionQPR, product: pQPR, weight: 15 },
  ];

  function pickRecipeWeighted() {
    const total = recipesForProduction.reduce((s, r) => s + r.weight, 0);
    let rnd = Math.random() * total;
    for (const r of recipesForProduction) { rnd -= r.weight; if (rnd <= 0) return r; }
    return recipesForProduction[0];
  }

  // Control de batches de leche disponibles
  const availableMilkBatches: { id: string; code: string; remaining: number }[] = [];

  // Recepción de leche: lu-sa (no domingo)
  // Producción: lu-mi-vi
  const productBatches: { id: string; code: string; productId: string; remaining: number; expirationDate: Date }[] = [];

  let currentDate = new Date(START);
  let totalDays = 0;

  console.log('[seed-demo] Generando datos día a día...');

  while (currentDate <= TODAY) {
    const dow = currentDate.getDay(); // 0=dom, 6=sab
    const isWeekend = dow === 0;
    const isProductionDay = dow === 1 || dow === 3 || dow === 5; // lu, mi, vi
    const isPast = currentDate < TODAY;

    // --- RECEPCIONES DE LECHE (lun-sab) ---
    if (dow !== 0 && isPast) {
      const numReceptions = randInt(2, 4);
      const dayProducers = [...producers].sort(() => Math.random() - 0.5).slice(0, numReceptions);

      for (const producer of dayProducers) {
        const liters = round2(rand(1200, 3500));
        // Análisis de calidad típico
        const fat = round2(rand(3.2, 4.1));
        const protein = round2(rand(3.0, 3.6));
        // Ocasionalmente la muestra va a lab externo (5% de los casos)
        const pendingLab = Math.random() < 0.05 && currentDate > subDays(TODAY, 14);
        const quality = {
          fatPercent: fat,
          proteinPercent: protein,
          totalBacterialCountCfu: randInt(50000, 180000),
          somaticCellCount: randInt(150000, 350000),
          alcoholTest: Math.random() > 0.03 ? 'negativa' : 'positiva',
          ph: round2(rand(6.5, 6.8)),
          temperature: round2(rand(3, 8)),
        };
        const acceptable = (quality.alcoholTest as string) === 'negativa' && quality.totalBacterialCountCfu < 400000;
        const status = acceptable ? 'aceptada' : 'bloqueada';

        const receivedAt = new Date(currentDate);
        receivedAt.setHours(randInt(6, 10), randInt(0, 59), 0, 0);

        const code = nextMilkCode(currentDate);

        let batchId: string | null = null;
        if (status === 'aceptada') {
          const milkBatch = await batchRepo.save(batchRepo.create({
            code,
            productId: null,
            productionDate: receivedAt,
            initialQuantity: String(liters),
            remainingQuantity: String(liters),
            unit: 'litro',
            status: 'activo',
            notes: `Leche cruda — ${producer.name}`,
          }));
          batchId = milkBatch.id;
          availableMilkBatches.push({ id: milkBatch.id, code: milkBatch.code, remaining: liters });
        }

        await receptionRepo.save(receptionRepo.create({
          code,
          receivedAt,
          producerId: producer.id,
          producerName: producer.name,
          vehiclePlate: `AB${randInt(100, 999)}CD`,
          driverName: pick(['Eduardo Sosa', 'Marcelo Díaz', 'Roberto Juárez', 'Pablo Herrera']),
          tankNumber: `T${randInt(1, 3)}`,
          liters: String(liters),
          quality,
          analysisStatus: pendingLab ? 'pending' : 'complete',
          labResultsExpectedDate: pendingLab ? fmtDate(addDays(currentDate, 5)) : null,
          status,
          blockedReason: status === 'bloqueada' ? 'Test de alcohol positivo — muestra retenida para control' : null,
          notes: null,
          batchId,
          createdById: operario.id,
        }));
      }
    }

    // --- PRODUCCIÓN (lun, mié, vie) ---
    if (isProductionDay && isPast && availableMilkBatches.length >= 2) {
      const numOrders = randInt(1, 2);

      for (let ord = 0; ord < numOrders; ord++) {
        const picked = pickRecipeWeighted();
        if (!picked) break;
        const { recipe, version, product } = picked;
        // Tomar 2-3 batches de leche disponibles
        const batchesToUse = Math.min(randInt(2, 3), availableMilkBatches.length);
        if (availableMilkBatches.length < batchesToUse) break;

        const milkInputs = [];
        let totalMilk = 0;

        for (let bi = 0; bi < batchesToUse; bi++) {
          const mb = availableMilkBatches[bi]!;
          const useAmount = round2(Math.min(mb.remaining, rand(800, 2000)));
          milkInputs.push({ batchId: mb.id, batchCode: mb.code, liters: useAmount });
          totalMilk += useAmount;
          mb.remaining -= useAmount;
          if (mb.remaining < 50) {
            await batchRepo.update(mb.id, { remainingQuantity: String(mb.remaining), status: 'agotado' });
          } else {
            await batchRepo.update(mb.id, { remainingQuantity: String(mb.remaining), status: 'en_proceso' });
          }
        }
        // Limpiar batches agotados
        for (let bi = batchesToUse - 1; bi >= 0; bi--) {
          if (availableMilkBatches[bi].remaining < 50) availableMilkBatches.splice(bi, 1);
        }

        const baseYield = parseFloat(version.baseYieldKgPerLiter);
        const expectedKg = round2(totalMilk * baseYield * (1 - parseFloat(version.standardWastePercent) / 100));

        const startedAt = new Date(currentDate);
        startedAt.setHours(randInt(7, 9), 0, 0, 0);
        const closedAt = new Date(startedAt);
        closedAt.setHours(closedAt.getHours() + randInt(4, 7));

        const orderCode = nextOrderCode(currentDate);
        const actualKg = round2(expectedKg * rand(0.94, 1.06));

        // Fecha de vencimiento según producto
        const expirationDays = product.sku === 'QPT-001' ? 120 : product.sku === 'QPR-001' ? 90 : 30;
        const expirationDate = addDays(currentDate, expirationDays);

        const productBatchCode = `LM-PP-${orderCode.replace('OP-', '')}`;

        const order = await productionRepo.save(productionRepo.create({
          code: orderCode,
          recipeId: recipe.id,
          recipeVersionId: version.id,
          status: 'closed',
          startedAt,
          closedAt,
          operatorId: operario.id,
          milkInputs,
          expectedOutputs: [{ productId: product.id, productName: product.name, quantity: expectedKg, unit: 'kg', isPrincipal: true }],
          actualOutputs: [{ productId: product.id, productName: product.name, quantity: actualKg, unit: 'kg', isPrincipal: true, batchCode: productBatchCode }],
          totalMilkLiters: String(totalMilk),
          totalPrincipalKg: String(actualKg),
          totalCost: String(round2(totalMilk * parseFloat(producers[0].agreedPricePerLiter!))),
          unitCost: String(round2((totalMilk * parseFloat(producers[0].agreedPricePerLiter!)) / actualKg)),
          notes: null,
        }));

        const productBatch = await batchRepo.save(batchRepo.create({
          code: productBatchCode,
          productId: product.id,
          productionDate: closedAt,
          expirationDate,
          initialQuantity: String(actualKg),
          remainingQuantity: String(actualKg),
          unit: 'kg',
          status: 'activo',
          parentBatchId: milkInputs[0]?.batchId ?? null,
          productionOrderId: order.id,
          notes: `Producido en ${orderCode}`,
        }));

        await movementRepo.save(movementRepo.create({
          batchId: productBatch.id,
          productId: product.id,
          type: 'in',
          reason: 'production',
          quantity: String(actualKg),
          unit: 'kg',
          referenceType: 'production_order',
          referenceId: order.id,
          createdById: operario.id,
        }));

        productBatches.push({ id: productBatch.id, code: productBatchCode, productId: product.id, remaining: actualKg, expirationDate });

        // Registros de maduración para pategrás (cada 7 días)
        if (product.sku === 'QPT-001') {
          let matDate = addDays(currentDate, 7);
          while (matDate <= TODAY) {
            const weightLoss = round2(actualKg * rand(0.005, 0.015));
            const weeksPassed = Math.floor((matDate.getTime() - currentDate.getTime()) / (7 * 86400000));
            const weightAtCheck = round2(actualKg * (1 - weeksPassed * 0.008));
            await maturationRepo.save(maturationRepo.create({
              batchId: productBatch.id,
              warehouseId: depositoMaduración.id,
              checkedAt: matDate,
              weightKg: String(weightAtCheck),
              notes: `Volteo y salado. Merma: ${weightLoss.toFixed(2)} kg`,
              createdById: operario.id,
            }));
            matDate = addDays(matDate, 7);
          }
        }
      }
    }

    currentDate = addDays(currentDate, 1);
    totalDays++;
  }
  console.log(`[seed-demo] Recepciones y producción generadas (${totalDays} días)`);

  // -----------------------------------------------------------------------
  // 11. Pedidos de venta y facturas
  // -----------------------------------------------------------------------
  const orderRepo = AppDataSource.getRepository(SalesOrderEntity);
  const invoiceRepo = AppDataSource.getRepository(InvoiceEntity);

  // Precios por tipo de cliente
  const pricesByType: Record<string, Record<string, number>> = {
    minorista: { [pQCS.id]: 4200, [pQCA.id]: 3800, [pQPT.id]: 4800, [pQPR.id]: 5200, [pRCT.id]: 1800 },
    mayorista: { [pQCS.id]: 3600, [pQCA.id]: 3200, [pQPT.id]: 4100, [pQPR.id]: 4500, [pRCT.id]: 1400 },
    distribuidor: { [pQCS.id]: 3300, [pQCA.id]: 2900, [pQPT.id]: 3800, [pQPR.id]: 4200, [pRCT.id]: 1200 },
  };

  const sellableProducts = [pQCS, pQCA, pQPT, pQPR, pRCT];

  // Generar pedidos desde inicio hasta hoy
  const orderDate = new Date(START);
  salesSeq = 0;

  while (orderDate <= TODAY) {
    const dow = orderDate.getDay();
    // Pedidos lun-sab, saltando algunos días aleatoriamente
    if (dow !== 0 && Math.random() > 0.2) {
      const numOrders = randInt(2, 5);
      const dayClients = [...clients].sort(() => Math.random() - 0.5).slice(0, numOrders);

      for (const client of dayClients) {
        const prices = pricesByType[client.type as keyof typeof pricesByType] ?? pricesByType.minorista;

        // Generar líneas
        const numLines = randInt(1, 4);
        const selectedProducts = [...sellableProducts].sort(() => Math.random() - 0.5).slice(0, numLines);
        const lines = selectedProducts.map(p => {
          const qty = round2(rand(5, 80));
          const unitPrice = prices[p.id] ?? 3000;
          const subtotal = round2(qty * unitPrice);
          return { productId: p.id, productName: p.name, sku: p.sku, quantity: qty, unitPrice, unit: p.unit, subtotal };
        });

        const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
        const discountPercent = client.type === 'mayorista' && Math.random() < 0.3 ? 5 : 0;
        const total = round2(subtotal * (1 - discountPercent / 100));

        // Fecha de reparto: próximo día de reparto de la zona del cliente
        const zone = zones.find(z => z.id === client.zoneId);
        const deliveryDate = fmtDate(addDays(orderDate, randInt(1, 5)));

        const isOldOrder = orderDate < subDays(TODAY, 7);
        const isVeryOldOrder = orderDate < subDays(TODAY, 30);

        // Estado según antigüedad del pedido
        let status: string;
        if (isVeryOldOrder) {
          status = Math.random() < 0.85 ? 'delivered' : 'cancelled';
        } else if (isOldOrder) {
          status = pick(['delivered', 'delivered', 'in_delivery', 'confirmed']);
        } else {
          status = pick(['taken', 'confirmed', 'prepared', 'taken']);
        }

        const takenAt = new Date(orderDate);
        takenAt.setHours(randInt(8, 17), randInt(0, 59), 0, 0);

        const code = `PV-${fmtDate(orderDate).replace(/-/g, '')}-${String(++salesSeq).padStart(4, '0')}`;

        const savedOrder = await orderRepo.save(orderRepo.create({
          code,
          clientId: client.id,
          zoneId: client.zoneId,
          status,
          takenAt,
          deliveryDate,
          lines,
          total: String(total),
          discountPercent: String(discountPercent),
          notes: Math.random() < 0.15 ? 'Entregar antes del mediodía' : null,
          createdById: vendedor.id,
        }));

        // Emitir factura para pedidos entregados
        if (status === 'delivered' && Math.random() < 0.85) {
          const taxPct = 10.5;
          const tax = round2(total * (taxPct / 100));
          const totalWithTax = round2(total + tax);
          const dueDate = fmtDate(addDays(orderDate, 30));
          const isPaid = orderDate < subDays(TODAY, 15) && Math.random() < 0.80;

          await invoiceRepo.save(invoiceRepo.create({
            number: nextInvoiceNumber(),
            clientId: client.id,
            salesOrderId: savedOrder.id,
            issuedAt: addDays(takenAt, 1),
            dueDate,
            status: isPaid ? 'paid' : 'issued',
            subtotal: String(total),
            taxAmount: String(tax),
            total: String(totalWithTax),
            paidAmount: isPaid ? String(totalWithTax) : String(round2(totalWithTax * (Math.random() < 0.2 ? rand(0.3, 0.8) : 0))),
          }));

          // Descontar del stock (los batches de producto)
          for (const line of lines) {
            const batch = productBatches.find(b => b.productId === line.productId && b.remaining >= line.quantity * 0.5);
            if (batch) {
              const consumed = Math.min(batch.remaining, line.quantity);
              batch.remaining -= consumed;
              if (batch.id) {
                await batchRepo.update(batch.id, {
                  remainingQuantity: String(round2(batch.remaining)),
                  status: batch.remaining < 1 ? 'agotado' : 'activo',
                });
                await movementRepo.save(movementRepo.create({
                  batchId: batch.id,
                  productId: line.productId,
                  type: 'out',
                  reason: 'sale',
                  quantity: String(consumed),
                  unit: 'kg',
                  referenceType: 'sales_order',
                  referenceId: savedOrder.id,
                  createdById: vendedor.id,
                }));
              }
            }
          }
        }
      }
    }
    orderDate.setDate(orderDate.getDate() + 1);
  }

  console.log('[seed-demo] Pedidos y facturas generados');

  // -----------------------------------------------------------------------
  // 12. Reporte final
  // -----------------------------------------------------------------------
  const countRec = await receptionRepo.count();
  const countProd = await productionRepo.count();
  const countOrders = await orderRepo.count();
  const countInv = await invoiceRepo.count();
  const countBatches = await batchRepo.count();
  const countMat = await maturationRepo.count();

  console.log('\n[seed-demo] ✅ Datos cargados exitosamente:');
  console.log(`  Recepciones de leche : ${countRec}`);
  console.log(`  Órdenes de producción: ${countProd}`);
  console.log(`  Lotes (batches)      : ${countBatches}`);
  console.log(`  Pedidos de venta     : ${countOrders}`);
  console.log(`  Facturas             : ${countInv}`);
  console.log(`  Registros maduración : ${countMat}`);
  console.log(`  Período: ${fmtDate(START)} → ${fmtDate(TODAY)}`);

  await AppDataSource.destroy();
}

seedDemo().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-demo] Error:', err);
  process.exit(1);
});
