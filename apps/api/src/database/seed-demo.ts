/**
 * Carga de DATOS DE DEMOSTRACIÓN vía la API REST (respeta validaciones y lógica
 * de negocio: genera lotes, calcula costos, baja stock por FEFO, arma cuentas).
 *
 * Uso:  pnpm --filter api seed:demo      (con la API corriendo en :4000)
 *
 * Es tolerante a duplicados en los MAESTROS (productos, clientes, tambos, cámaras,
 * recetas, precios): si ya existen, los saltea. La parte transaccional (recepciones,
 * producción, despachos, cobros, gastos) se genera SOLO si todavía no hay producción,
 * para que reejecutar el script no duplique movimientos. NO borra nada.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:4000';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@lasmarias.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Cambiar';

let token = '';
let operatorId = '';

async function login(): Promise<void> {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login falló (${r.status}). ¿La API corre en ${API}? ¿Credenciales correctas?`);
  const data = (await r.json()) as { user?: { id: string }; tokens?: { accessToken: string }; accessToken?: string };
  token = data.tokens?.accessToken ?? data.accessToken ?? '';
  operatorId = data.user?.id ?? '';
  if (!token) throw new Error('No se pudo extraer el token del login.');
}

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T | null> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    const short = text.replace(/\s+/g, ' ').slice(0, 160);
    console.warn(`   ↳ ${method} ${path} → ${r.status} ${short}`);
    return null;
  }
  return text ? (JSON.parse(text) as T) : null;
}

const get = <T = any>(p: string) => req<T>('GET', p);
const post = <T = any>(p: string, b: unknown) => req<T>('POST', p, b);
const put = <T = any>(p: string, b: unknown) => req<T>('PUT', p, b);

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pick = <T>(arr: T[], i: number) => arr[i % arr.length]!;

async function main() {
  console.log(`[seed:demo] API: ${API}`);
  await login();
  console.log(`[seed:demo] Sesión iniciada como admin (operatorId=${operatorId || 's/d'}).`);

  // 0) COTIZACIÓN DEL DÍA (para precios en USD/EUR) ----------------------------
  console.log('→ Cotización del día');
  const todayKey = new Date().toISOString().slice(0, 10);
  await req('PATCH', '/api/exchange-rates', { date: todayKey, usd: 1000, eur: 1100 });

  // 1) CÁMARAS ----------------------------------------------------------------
  console.log('→ Cámaras');
  const warehouseSeeds = [
    { code: 'CF-01', name: 'Cámara de frío 1', kind: 'cold_chamber', targetTemperatureCelsius: 4 },
    { code: 'CF-02', name: 'Cámara de frío 2', kind: 'cold_chamber', targetTemperatureCelsius: 3 },
    { code: 'MAD-01', name: 'Sala de maduración', kind: 'maturation', targetTemperatureCelsius: 12 },
    // Silos de leche con capacidad (CLAUDE.md §9): la leche recibida se reparte acá.
    { code: 'SILO-A', name: 'Silo A', kind: 'silo', capacityLiters: 15000 },
    { code: 'SILO-B', name: 'Silo B', kind: 'silo', capacityLiters: 15000 },
    { code: 'SILO-C', name: 'Silo C', kind: 'silo', capacityLiters: 10000 },
  ];
  const existingWh = (await get<any[]>('/api/inventory/warehouses?all=true')) ?? [];
  for (const w of warehouseSeeds) {
    if (!existingWh.some((x) => x.code === w.code)) await post('/api/inventory/warehouses', w);
  }
  const warehouses = (await get<any[]>('/api/inventory/warehouses?all=true')) ?? [];
  const camaraFrio = warehouses.find((w) => w.code === 'CF-01')?.id;
  const camaraMad = warehouses.find((w) => w.code === 'MAD-01')?.id;
  // Ids de los silos sembrados, para repartir las recepciones entre ellos.
  const siloIds = ['SILO-A', 'SILO-B', 'SILO-C']
    .map((c) => warehouses.find((w) => w.code === c)?.id)
    .filter((x): x is string => !!x);

  // 2) PRODUCTOS --------------------------------------------------------------
  console.log('→ Productos');
  const productSeeds = [
    { sku: 'QC-001', name: 'Queso cremoso', category: 'queso', unit: 'kg', trackBatches: true },
    { sku: 'MUZ-001', name: 'Muzzarella', category: 'queso', unit: 'kg', trackBatches: true },
    { sku: 'MASA-001', name: 'Masa base', category: 'intermedio', unit: 'kg', trackBatches: true },
    { sku: 'RIC-001', name: 'Ricota', category: 'subproducto', unit: 'kg', trackBatches: true },
    { sku: 'SUE-001', name: 'Suero', category: 'subproducto', unit: 'litro', trackBatches: true },
    { sku: 'FER-001', name: 'Fermento láctico', category: 'insumo', unit: 'unidad', trackBatches: false, minStockLevel: 20 },
    { sku: 'CUA-001', name: 'Cuajo líquido', category: 'insumo', unit: 'litro', trackBatches: false, minStockLevel: 5 },
    { sku: 'SAL-001', name: 'Sal entrefina', category: 'insumo', unit: 'kg', trackBatches: false, minStockLevel: 40 },
    { sku: 'ENV-001', name: 'Bolsas 1kg', category: 'envase', unit: 'unidad', trackBatches: false, minStockLevel: 200 },
    { sku: 'MO-001', name: 'Mano de obra', category: 'insumo', unit: 'unidad', trackBatches: false },
    { sku: 'ENE-001', name: 'Energía', category: 'insumo', unit: 'unidad', trackBatches: false },
  ];
  const existingProds = (await get<any[]>('/api/products')) ?? [];
  for (const p of productSeeds) {
    if (!existingProds.some((x) => x.sku === p.sku)) await post('/api/products', p);
  }
  const products = (await get<any[]>('/api/products')) ?? [];
  const idBySku = (sku: string): string | undefined => products.find((p) => p.sku === sku)?.id;

  // 3) LISTAS DE PRECIOS (por tipo de cliente) --------------------------------
  console.log('→ Listas de precios');
  const PRICES: Record<string, Record<string, number>> = {
    minorista: { 'QC-001': 3500, 'MUZ-001': 4200, 'RIC-001': 1800 },
    mayorista: { 'QC-001': 3000, 'MUZ-001': 3700, 'RIC-001': 1500 },
    distribuidor: { 'QC-001': 2800, 'MUZ-001': 3500, 'RIC-001': 1400 },
  };
  for (const type of ['minorista', 'mayorista', 'distribuidor'] as const) {
    const items = Object.entries(PRICES[type]!)
      .map(([sku, unitPrice]) => ({ productId: idBySku(sku), unitPrice }))
      .filter((i) => i.productId) as { productId: string; unitPrice: number }[];
    if (items.length) await put('/api/sales/price-list', { clientType: type, items });
  }

  // 4) PRODUCTORES (tambos) ---------------------------------------------------
  console.log('→ Tambos');
  const producerSeeds = [
    { name: 'Tambo La Esperanza', agreedPricePerLiter: 320, city: 'Pergamino' },
    { name: 'Tambo Don Pedro', agreedPricePerLiter: 315, city: 'Colón' },
    { name: 'Tambo Santa Rita', agreedPricePerLiter: 310, city: 'Pergamino' },
    { name: 'Tambo El Trébol', agreedPricePerLiter: 325, city: 'Junín' },
  ];
  const existingProducers = (await get<any[]>('/api/producers')) ?? [];
  for (const p of producerSeeds) {
    if (!existingProducers.some((x) => x.name === p.name)) await post('/api/producers', p);
  }
  const producers = (await get<any[]>('/api/producers')) ?? [];

  // 5) CLIENTES ---------------------------------------------------------------
  console.log('→ Clientes');
  const clientSeeds = [
    { businessName: 'Almacén Doña Rosa', type: 'minorista', city: 'Pergamino', paymentTermDays: null },
    { businessName: 'Rotisería La Esquina', type: 'minorista', city: 'Pergamino', paymentTermDays: null },
    { businessName: 'Fiambrería El Cerdito', type: 'minorista', city: 'Colón', paymentTermDays: null },
    { businessName: 'Supermercado El Ahorro', type: 'mayorista', city: 'Pergamino', paymentTermDays: 30 },
    { businessName: 'Mayorista Sur SA', type: 'mayorista', city: 'Junín', paymentTermDays: 45 },
    { businessName: 'Distribuidora Norte SRL', type: 'distribuidor', city: 'Colón', paymentTermDays: 30 },
  ];
  const existingClients = (await get<any[]>('/api/clients')) ?? [];
  for (const c of clientSeeds) {
    if (!existingClients.some((x) => x.businessName === c.businessName)) await post('/api/clients', c);
  }
  const clients = (await get<any[]>('/api/clients')) ?? [];

  // 6) RECETAS ----------------------------------------------------------------
  console.log('→ Recetas');
  const ing = (sku: string, quantity: number, unit: string, basis: string, unitCost: number) => ({
    productId: idBySku(sku)!,
    quantity,
    unit,
    basis,
    unitCost,
  });
  const sueroByproduct = {
    name: 'Suero',
    expectedYield: 0.8,
    unit: 'litro',
    basis: 'per_liter_milk',
    destination: 'sale',
    destinationProductId: idBySku('SUE-001'), // genera lote de stock de suero al producir
    referenceValuePerUnit: 30,
  };
  const recipeSeeds = [
    {
      productSku: 'QC-001',
      name: 'Cremoso clásico',
      description: 'Receta estándar de queso cremoso.',
      initialVersion: {
        baseYieldKgPerLiter: 0.1,
        standardWastePercent: 2,
        baselineFatPercent: 3.5,
        baselineProteinPercent: 3.2,
        ingredients: [
          ing('FER-001', 0.02, 'unidad', 'per_liter_milk', 50),
          ing('CUA-001', 0.0015, 'litro', 'per_liter_milk', 4000),
          ing('SAL-001', 0.025, 'kg', 'per_kg_product', 300),
          ing('MO-001', 1, 'unidad', 'fixed_per_order', 8000),
          ing('ENE-001', 1, 'unidad', 'fixed_per_order', 3000),
        ],
        byproducts: [sueroByproduct],
      },
    },
    {
      productSku: 'MUZ-001',
      name: 'Muzzarella tradicional',
      description: 'Receta estándar de muzzarella.',
      initialVersion: {
        baseYieldKgPerLiter: 0.095,
        standardWastePercent: 3,
        baselineFatPercent: 3.4,
        baselineProteinPercent: 3.3,
        ingredients: [
          ing('FER-001', 0.018, 'unidad', 'per_liter_milk', 50),
          ing('CUA-001', 0.0018, 'litro', 'per_liter_milk', 4000),
          ing('SAL-001', 0.03, 'kg', 'per_kg_product', 300),
          ing('MO-001', 1, 'unidad', 'fixed_per_order', 9000),
          ing('ENE-001', 1, 'unidad', 'fixed_per_order', 3500),
        ],
        byproducts: [sueroByproduct],
      },
    },
  ];
  const existingRecipes = (await get<any[]>('/api/recipes')) ?? [];
  for (const r of recipeSeeds) {
    const productId = idBySku(r.productSku);
    if (!productId) continue;
    if (existingRecipes.some((x) => x.productId === productId)) continue;
    await post('/api/recipes', {
      productId,
      name: r.name,
      description: r.description,
      initialVersion: r.initialVersion,
    });
  }
  const recipes = (await get<any[]>('/api/recipes')) ?? [];
  const recipeFor = (sku: string) => recipes.find((r) => r.productId === idBySku(sku));

  // --- Guard de idempotencia: la parte transaccional se genera una sola vez ---
  const existingOrders = (await get<any[]>('/api/production-orders')) ?? [];
  if (existingOrders.length > 0) {
    console.log(
      `[seed:demo] Ya hay ${existingOrders.length} órdenes de producción: salteo recepciones/producción/despachos para no duplicar.`,
    );
    console.log('[seed:demo] ✓ Maestros verificados. Listo.');
    return;
  }

  // 6b) STOCK INICIAL DE INSUMOS (para que tengan saldo y la producción descuente) -----
  console.log('→ Stock inicial de insumos');
  const stockSeeds = [
    { sku: 'FER-001', quantity: 450, unitCost: 50 },
    { sku: 'CUA-001', quantity: 60, unitCost: 4000 },
    { sku: 'SAL-001', quantity: 120, unitCost: 300 },
  ];
  for (const s of stockSeeds) {
    const pid = idBySku(s.sku);
    if (pid) {
      await post('/api/inventory/stock-entry', {
        productId: pid,
        quantity: s.quantity,
        unitCost: s.unitCost,
        warehouseId: camaraFrio,
      });
    }
  }

  // 7) RECEPCIONES DE LECHE (calidad buena → aceptadas, generan lote) ----------
  console.log('→ Recepciones de leche');
  const goodQuality = () => ({
    fatPercent: round1(rnd(3.3, 3.8)),
    proteinPercent: round1(rnd(3.1, 3.5)),
    ph: round1(rnd(6.6, 6.8)),
    acidityDornic: Math.round(rnd(14, 17)),
    temperatureCelsius: round1(rnd(2, 5)),
    somaticCellCount: Math.round(rnd(120000, 280000)),
    bacterialCount: Math.round(rnd(20000, 70000)),
    alcoholTestPassed: true,
    antibioticsDetected: false,
  });
  const milkBatches: { batchId: string; liters: number }[] = [];
  const RECEPCIONES = 26;
  for (let i = 0; i < RECEPCIONES; i++) {
    const prod = pick(producers, i);
    const liters = Math.round(rnd(900, 1600));
    const declared = liters + Math.round(rnd(-15, 10));
    const rec = await post<any>('/api/milk-receptions', {
      receivedAt: daysAgo(RECEPCIONES * 2 - i * 2), // repartidas en el último ~mes
      producerId: prod.id,
      remito: `R-${10000 + i}`,
      declaredLiters: declared,
      liters,
      quality: goodQuality(),
      // La leche entra a un silo (rota entre los silos sembrados); si no hubiera, a la cámara.
      warehouseId: siloIds.length ? pick(siloIds, i) : camaraFrio,
    });
    if (rec?.batchId) milkBatches.push({ batchId: rec.batchId, liters: rec.liters ?? liters });
  }
  console.log(`   ${milkBatches.length} recepciones aceptadas con lote.`);

  // 8) PRODUCCIÓN (abrir + cerrar → genera producto con costo, baja leche) -----
  console.log('→ Producción');
  const PRODUCCIONES = Math.min(16, milkBatches.length);
  let made = 0;
  for (let i = 0; i < PRODUCCIONES; i++) {
    const milk = milkBatches[i];
    if (!milk) continue;
    const sku = i % 2 === 0 ? 'QC-001' : 'MUZ-001';
    const recipe = recipeFor(sku);
    if (!recipe) continue;
    const opened = await post<any>('/api/production-orders/open', {
      recipeId: recipe.id,
      operatorId,
      startedAt: daysAgo(PRODUCCIONES * 2 - i * 2),
      milkInputs: [{ batchId: milk.batchId, liters: milk.liters }],
    });
    if (!opened?.id) continue;
    const order = (await get<any>(`/api/production-orders/${opened.id}`)) ?? opened;
    const outputs: any[] = order.expectedOutputs ?? [];
    if (!outputs.length) continue;
    // Rendimiento real ~ esperado con leve variación → genera desvíos visibles.
    const factor = rnd(0.9, 1.06);
    const actualOutputs = outputs.map((o) => ({
      productId: o.productId,
      quantity: Math.max(0.1, round1(Number(o.quantity) * factor)),
      isPrincipal: !!o.isPrincipal,
    }));
    const closed = await post<any>(`/api/production-orders/${opened.id}/close`, {
      actualOutputs,
      warehouseId: i % 3 === 0 ? camaraMad : camaraFrio,
    });
    if (closed) made++;
  }
  console.log(`   ${made} órdenes producidas y cerradas.`);

  // 9) DESPACHOS (baja stock por FEFO + cuenta/contado) ------------------------
  console.log('→ Despachos');
  const stock = (await get<any[]>('/api/inventory/stock')) ?? [];
  const avail: Record<string, number> = {};
  for (const s of stock) avail[s.productId] = Number(s.totalQuantity);
  const sellableSkus = ['QC-001', 'MUZ-001'];
  let dispatched = 0;
  for (let i = 0; i < clients.length * 4; i++) {
    const client = pick(clients, i);
    const type: string = client.type;
    const lines: { productId: string; quantity: number; unitPrice: number }[] = [];
    for (const sku of sellableSkus) {
      const pid = idBySku(sku);
      if (!pid) continue;
      const left = avail[pid] ?? 0;
      if (left < 3) continue;
      const qty = round1(Math.min(left * 0.25, rnd(4, 14)));
      if (qty < 1) continue;
      const unitPrice = PRICES[type]?.[sku] ?? 3000;
      lines.push({ productId: pid, quantity: qty, unitPrice });
      avail[pid] = left - qty;
    }
    if (!lines.length) continue;
    const paymentMode = client.paymentTermDays == null ? 'contado' : 'cuenta_corriente';
    const order = await post<any>('/api/sales/orders', { clientId: client.id, lines, paymentMode });
    if (order) dispatched++;
  }
  console.log(`   ${dispatched} despachos registrados.`);

  // 10) COBROS parciales en cuenta corriente ----------------------------------
  console.log('→ Cobros');
  const accounts = (await get<any[]>('/api/sales/accounts')) ?? [];
  let payments = 0;
  for (const acc of accounts) {
    if (Number(acc.balance) <= 0) continue;
    // Cobramos ~60% del saldo de algunos clientes → quedan saldos parciales.
    const amount = Math.round(Number(acc.balance) * rnd(0.4, 0.7));
    if (amount <= 0) continue;
    const ok = await post('/api/sales/payments', {
      clientId: acc.clientId,
      amount,
      occurredAt: daysAgo(Math.round(rnd(1, 10))),
      method: pick(['Efectivo', 'Transferencia', 'Cheque'], payments),
    });
    if (ok) payments++;
  }
  console.log(`   ${payments} cobros registrados.`);

  // 11) GASTOS (flujo de caja) -------------------------------------------------
  console.log('→ Gastos');
  const gastos = [
    { category: 'Sueldos', amount: 850000, notes: 'Quincena planta' },
    { category: 'Energía', amount: 145000, notes: 'Factura luz' },
    { category: 'Insumos', amount: 230000, notes: 'Fermento y cuajo' },
    { category: 'Fletes', amount: 90000, notes: 'Reparto semanal' },
    { category: 'Mantenimiento', amount: 65000, notes: 'Service cámara de frío' },
    { category: 'Envases', amount: 120000, notes: 'Bolsas y film' },
    { category: 'Combustible', amount: 78000, notes: 'Camioneta reparto' },
    { category: 'Sueldos', amount: 850000, notes: 'Quincena administración' },
  ];
  let expenses = 0;
  for (let i = 0; i < gastos.length; i++) {
    const g = gastos[i]!;
    const ok = await post('/api/finance/cash-movements', {
      kind: 'expense',
      amount: g.amount,
      category: g.category,
      occurredAt: daysAgo(Math.round(rnd(1, 25))),
      notes: g.notes,
    });
    if (ok) expenses++;
  }
  console.log(`   ${expenses} gastos cargados.`);

  // 12) PAGOS A TAMBOS (cuenta por pagar) — pago parcial para ver saldos -------
  console.log('→ Pagos a tambos');
  const tamboAccounts = (await get<Array<{ producerId: string; balance: number }>>('/api/producers/accounts')) ?? [];
  let tamboPayments = 0;
  for (let i = 0; i < Math.min(2, tamboAccounts.length); i++) {
    const acc = tamboAccounts[i];
    if (acc && acc.balance > 0) {
      const ok = await post('/api/producers/payments', {
        producerId: acc.producerId,
        amount: Math.round(acc.balance * rnd(0.4, 0.6)),
        occurredAt: daysAgo(Math.round(rnd(1, 10))),
        method: 'Transferencia',
      });
      if (ok) tamboPayments++;
    }
  }
  console.log(`   ${tamboPayments} pagos a tambos.`);

  // 13) PROVEEDORES DE INSUMOS + CUENTAS POR PAGAR (punto 4) -------------------
  console.log('→ Proveedores y cuentas por pagar');
  const supplierSeeds = [
    { name: 'Insumos del Sur', paymentTermDays: 30, city: 'Pergamino' },
    { name: 'Envases Pampa', paymentTermDays: 15, city: 'Junín' },
  ];
  const existingSuppliers = (await get<any[]>('/api/suppliers')) ?? [];
  for (const s of supplierSeeds) {
    if (!existingSuppliers.some((x) => x.name === s.name)) await post('/api/suppliers', s);
  }
  const suppliers = (await get<any[]>('/api/suppliers')) ?? [];
  const payableSeeds = [
    { name: 'Insumos del Sur', description: 'Factura A-0001 — fermentos y cuajo', amount: 185000, pay: 0.5 },
    { name: 'Insumos del Sur', description: 'Factura A-0002 — sal entrefina', amount: 92000, pay: 0 },
    { name: 'Envases Pampa', description: 'Factura B-0145 — bolsas y film', amount: 240000, pay: 0 },
  ];
  let payablesCreated = 0;
  for (const ps of payableSeeds) {
    const sup = suppliers.find((s) => s.name === ps.name);
    if (!sup) continue;
    const created = await post<any>('/api/suppliers/payables', {
      supplierId: sup.id,
      description: ps.description,
      amount: ps.amount,
    });
    if (!created) continue;
    payablesCreated++;
    if (ps.pay > 0) {
      await post('/api/suppliers/payments', {
        payableId: created.id,
        amount: Math.round(ps.amount * ps.pay),
        method: 'Transferencia',
      });
    }
  }
  console.log(`   ${payablesCreated} comprobantes a pagar.`);

  // 14) CUENTAS (banco) + CHEQUES (punto 5) -----------------------------------
  console.log('→ Cuentas y cheques');
  const existingAccounts = (await get<any[]>('/api/finance/accounts')) ?? [];
  if (!existingAccounts.some((a) => a.name === 'Banco Nación')) {
    await post('/api/finance/accounts', { name: 'Banco Nación', kind: 'banco', openingBalance: 500000 });
  }
  // Saldo inicial realista para la Caja (sino queda en negativo por los gastos/pagos del demo).
  const caja = ((await get<any[]>('/api/finance/accounts')) ?? []).find((a) => a.name === 'Caja');
  if (caja) await req('PATCH', `/api/finance/accounts/${caja.id}`, { openingBalance: 8000000 });
  const chequeSeeds = [
    { kind: 'recibido', number: '00012345', amount: 120000, counterparty: 'Supermercado El Ahorro', cobrar: true },
    { kind: 'recibido', number: '00012346', amount: 85000, counterparty: 'Mayorista Sur SA', cobrar: false },
    { kind: 'propio', number: '00098001', amount: 150000, counterparty: 'Insumos del Sur', cobrar: false },
  ];
  const existingCheques = (await get<any[]>('/api/finance/cheques')) ?? [];
  let chequesCreated = 0;
  for (const ch of chequeSeeds) {
    if (existingCheques.some((x) => x.number === ch.number)) continue;
    const created = await post<any>('/api/finance/cheques', {
      kind: ch.kind,
      number: ch.number,
      amount: ch.amount,
      counterparty: ch.counterparty,
    });
    if (!created) continue;
    chequesCreated++;
    if (ch.cobrar) await req('PATCH', `/api/finance/cheques/${created.id}/status`, { status: 'cobrado' });
  }
  console.log(`   ${chequesCreated} cheques.`);

  console.log('[seed:demo] ✓ Listo. Entrá a la app: silos, producción, costos, stock, cuentas, caja, cheques y reportes poblados.');
}

main().catch((e) => {
  console.error('[seed:demo] Error:', e.message ?? e);
  process.exit(1);
});
