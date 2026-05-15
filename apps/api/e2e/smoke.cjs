// Smoke test E2E de la API. Ejecuta los flujos críticos contra la API real corriendo.
//
// Uso (PowerShell, con docker-compose up + migration:run + seed previos, API en :4000):
//   node apps/api/e2e/smoke.cjs
//
// Pre-condición: tablas de negocio vacías (los counts y assertions asumen DB limpia).
//   TRUNCATE TABLE ... ya viene en el README de pruebas.
//
// Cubre: auth (login/refresh/logout/401), productos, productores,
// recepción de leche (aceptada + bloqueada por antibióticos), reporte de volumen,
// receta + simulador, producción (abrir + cerrar + inmutabilidad), stock + movimientos,
// zonas + listas de precios + pedidos + comprobantes + cobros + cuentas por cobrar,
// proveedores + liquidación a productores, empleados + ingest biométrico batch +
// reporte de horas, dashboard.
const API = process.env.API_URL || 'http://localhost:4000';
const log = (...a) => console.log(...a);
const fail = (msg, ...details) => { console.error('❌ FAIL:', msg, ...details); process.exit(1); };
const ok = (msg) => console.log('✓', msg);

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }
  return { status: res.status, data };
}

(async () => {
  // ============ AUTH ============
  log('\n=== AUTH ===');
  let r = await req('POST', '/api/auth/login', {
    body: { email: 'admin@lasmarias.local', password: 'Admin123!Cambiar' },
  });
  if (r.status !== 200) fail('login', r.status, r.data);
  const accessToken = r.data.tokens.accessToken;
  const refreshToken = r.data.tokens.refreshToken;
  ok(`login admin → ${r.data.user.role}`);

  r = await req('POST', '/api/auth/refresh', { body: { refreshToken } });
  if (r.status !== 200 || !r.data.accessToken) fail('refresh', r.status, r.data);
  ok('refresh token');

  // Login mal — debe rechazar
  r = await req('POST', '/api/auth/login', {
    body: { email: 'admin@lasmarias.local', password: 'wrong' },
  });
  if (r.status !== 401) fail('login wrong password debería ser 401', r.status);
  ok('login con password incorrecta → 401');

  // ============ PRODUCTOS ============
  log('\n=== PRODUCTOS ===');
  r = await req('POST', '/api/products', { token: accessToken, body: {
    sku: 'QC-001', name: 'Queso cremoso 1kg', category: 'queso', unit: 'kg', trackBatches: true,
  }});
  if (r.status !== 201) fail('create product queso', r.status, r.data);
  const productCheese = r.data;
  ok(`producto queso creado: ${productCheese.sku}`);

  r = await req('POST', '/api/products', { token: accessToken, body: {
    sku: 'RI-001', name: 'Ricota', category: 'subproducto', unit: 'kg', trackBatches: true,
  }});
  if (r.status !== 201) fail('create product ricota', r.status, r.data);
  ok('producto ricota creado');

  r = await req('GET', '/api/products', { token: accessToken });
  if (r.status !== 200 || r.data.length < 2) fail('list products', r.status, r.data);
  ok(`lista de productos: ${r.data.length}`);

  // ============ PRODUCTORES ============
  log('\n=== PRODUCTORES ===');
  r = await req('POST', '/api/producers', { token: accessToken, body: {
    name: 'Tambo La Esperanza', city: 'Pergamino', agreedPricePerLiter: 350,
  }});
  if (r.status !== 201) fail('create producer', r.status, r.data);
  const producer = r.data;
  ok(`productor creado: ${producer.name}`);

  // ============ RECEPCIÓN DE LECHE — aceptada ============
  log('\n=== RECEPCIÓN DE LECHE ===');
  r = await req('POST', '/api/milk-receptions', { token: accessToken, body: {
    receivedAt: new Date().toISOString(),
    producerId: producer.id,
    liters: 1200,
    vehiclePlate: 'AB123CD',
    quality: {
      temperatureCelsius: 4,
      ph: 6.7,
      fatPercent: 3.5,
      proteinPercent: 3.3,
      alcoholTestPassed: true,
      antibioticsDetected: false,
    },
  }});
  if (r.status !== 201) fail('create recepcion aceptada', r.status, r.data);
  if (r.data.status !== 'aceptada') fail('recepcion debería ser aceptada', r.data.status);
  if (!r.data.batchId) fail('recepcion aceptada debe tener batchId', r.data);
  const milkReception = r.data;
  const milkBatchId = milkReception.batchId;
  ok(`recepción aceptada: ${milkReception.code} (batch ${milkBatchId})`);

  // Recepción BLOQUEADA por antibióticos
  r = await req('POST', '/api/milk-receptions', { token: accessToken, body: {
    receivedAt: new Date().toISOString(),
    producerId: producer.id,
    liters: 800,
    quality: { temperatureCelsius: 4, antibioticsDetected: true },
  }});
  if (r.status !== 201) fail('create recepcion bloqueada', r.status, r.data);
  if (r.data.status !== 'bloqueada') fail('debería bloquearse', r.data.status);
  if (!r.data.blockedReason || !/antibi/i.test(r.data.blockedReason)) fail('blockedReason debería mencionar antibioticos', r.data.blockedReason);
  ok(`recepción bloqueada por calidad: ${r.data.blockedReason}`);

  // Reporte volumen por productor
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date(Date.now() + 86400000).toISOString();
  r = await req('GET', `/api/milk-receptions/volume-by-producer?from=${from}&to=${to}`, { token: accessToken });
  if (r.status !== 200) fail('volume-by-producer', r.status, r.data);
  // Volumen incluye aceptadas + bloqueadas (excluye solo 'anulada' = cancelación).
  if (r.data.length < 1 || r.data[0].totalLiters !== 2000) fail('volumen total debería ser 2000 (1200 aceptada + 800 bloqueada)', r.data);
  ok(`reporte volumen: ${r.data[0].producerName} = ${r.data[0].totalLiters} L`);

  // ============ RECETAS + SIMULADOR ============
  log('\n=== RECETAS ===');
  r = await req('POST', '/api/recipes', { token: accessToken, body: {
    productId: productCheese.id,
    name: 'Cremoso clásico',
    initialVersion: {
      baseYieldKgPerLiter: 0.1,
      yieldSensitivityFat: 0.01,
      yieldSensitivityProtein: 0,
      baselineFatPercent: 3.4,
      baselineProteinPercent: 3.2,
      standardWastePercent: 2,
      ingredients: [],
      byproducts: [
        { name: 'Suero', expectedYield: 0.7, unit: 'litro', basis: 'per_liter_milk', destination: 'sale', referenceValuePerUnit: 5 },
      ],
    },
  }});
  if (r.status !== 201) fail('create recipe', r.status, r.data);
  const recipe = r.data;
  ok(`receta creada: ${recipe.name} v${recipe.activeVersion?.versionNumber}`);

  // Simulador
  r = await req('POST', '/api/recipes/simulate', { token: accessToken, body: {
    recipeId: recipe.id, liters: 1000, fatPercent: 4.4,
  }});
  if (r.status !== 201) fail('simulate', r.status, r.data);
  if (r.data.expectedYieldKg <= 100) fail('grasa más alta debería aumentar rendimiento sobre 100kg base', r.data);
  ok(`simulador: 1000L con 4.4% grasa → ${r.data.expectedYieldKg} kg (rendimiento ${r.data.appliedYieldKgPerLiter})`);

  // ============ PRODUCCIÓN ============
  log('\n=== PRODUCCIÓN ===');
  r = await req('POST', '/api/production-orders/open', { token: accessToken, body: {
    recipeId: recipe.id,
    operatorId: r.data.operatorId || 'no-existe-pero-uso-admin',
  }});
  // El operator debe ser el admin → veamos /api/auth/login para tener su id
  // Por simplicidad: la respuesta del login tenía user.id
  // Re-login para obtener admin id
  const login2 = await req('POST', '/api/auth/login', { body: { email: 'admin@lasmarias.local', password: 'Admin123!Cambiar' } });
  const adminId = login2.data.user.id;

  r = await req('POST', '/api/production-orders/open', { token: accessToken, body: {
    recipeId: recipe.id,
    operatorId: adminId,
    startedAt: new Date().toISOString(),
    milkInputs: [{ batchId: milkBatchId, liters: 1200 }],
    notes: 'Test E2E',
  }});
  if (r.status !== 201) fail('open production', r.status, r.data);
  const order = r.data;
  ok(`orden de producción abierta: ${order.code}`);

  // Cerrar la orden
  r = await req('POST', `/api/production-orders/${order.id}/close`, { token: accessToken, body: {
    actualOutputs: [{ productId: productCheese.id, quantity: 115, isPrincipal: true }],
  }});
  if (r.status !== 201) fail('close production', r.status, r.data);
  if (r.data.status !== 'closed') fail('orden debería estar cerrada', r.data.status);
  if (!r.data.totalCost && r.data.totalCost !== 0) fail('debe tener costo calculado', r.data);
  ok(`orden cerrada: ${r.data.totalPrincipalKg} kg producidos, costo $${r.data.totalCost}, $${r.data.unitCost}/kg`);

  // Intentar cerrar de nuevo → debe fallar (inmutabilidad)
  r = await req('POST', `/api/production-orders/${order.id}/close`, { token: accessToken, body: {
    actualOutputs: [{ productId: productCheese.id, quantity: 200, isPrincipal: true }],
  }});
  if (r.status !== 403) fail('orden cerrada debe ser inmutable, esperaba 403', r.status, r.data);
  ok('orden cerrada es inmutable (403)');

  // ============ INVENTARIO ============
  log('\n=== INVENTARIO ===');
  r = await req('GET', '/api/inventory/stock', { token: accessToken });
  if (r.status !== 200) fail('stock summary', r.status, r.data);
  const cheeseStock = r.data.find((s) => s.productId === productCheese.id);
  if (!cheeseStock || cheeseStock.totalQuantity !== 115) fail('stock de queso debe ser 115 kg', cheeseStock);
  ok(`stock: ${cheeseStock.productName} = ${cheeseStock.totalQuantity} ${cheeseStock.unit}`);

  r = await req('GET', '/api/inventory/movements', { token: accessToken });
  if (r.status !== 200 || r.data.length < 2) fail('movements (esperaba al menos 2: out leche + in queso)', r.data?.length);
  ok(`movimientos registrados: ${r.data.length}`);

  // ============ ZONAS + PEDIDOS + COMPROBANTES ============
  log('\n=== COMERCIAL ===');
  r = await req('POST', '/api/delivery/zones', { token: accessToken, body: {
    name: 'Pergamino centro', deliveryDays: ['mon','wed','fri'], cutoffTime: '14:00',
  }});
  if (r.status !== 201) fail('create zone', r.status, r.data);
  const zone = r.data;
  ok(`zona creada: ${zone.name}`);

  // Cliente
  r = await req('POST', '/api/clients', { token: accessToken, body: {
    businessName: 'Almacén Don José', type: 'minorista', zoneId: zone.id, city: 'Pergamino',
  }});
  if (r.status !== 201) fail('create client', r.status, r.data);
  const client = r.data;
  ok(`cliente creado: ${client.businessName}`);

  // Lista de precios minorista
  r = await req('POST', '/api/sales/price-lists', { token: accessToken, body: {
    name: 'Minorista 2026', clientType: 'minorista',
    items: [{ productId: productCheese.id, unitPrice: 5000 }],
  }});
  if (r.status !== 201) fail('create price list', r.status, r.data);
  ok('lista de precios creada');

  // Pedido (sin deliveryDate → debe sugerir según zona)
  r = await req('POST', '/api/sales/orders', { token: accessToken, body: {
    clientId: client.id,
    lines: [{ productId: productCheese.id, quantity: 10 }],
  }});
  if (r.status !== 201) fail('create sales order', r.status, r.data);
  const salesOrder = r.data;
  if (salesOrder.total !== 50000) fail('total debería ser 50000 (10kg × $5000)', salesOrder.total);
  if (!salesOrder.deliveryDate) fail('debe tener delivery date sugerida', salesOrder);
  ok(`pedido creado: ${salesOrder.code} reparto ${salesOrder.deliveryDate} total $${salesOrder.total}`);

  // Avanzar estado → delivered
  for (const status of ['confirmed','prepared','loaded','in_delivery','delivered']) {
    r = await req('PATCH', `/api/sales/orders/${salesOrder.id}/status`, { token: accessToken, body: { status } });
    if (r.status !== 200) fail(`update status to ${status}`, r.status, r.data);
  }
  ok('pedido avanzado hasta delivered');

  // Emitir factura
  r = await req('POST', '/api/invoices/from-order', { token: accessToken, body: {
    salesOrderId: salesOrder.id, taxPercent: 21,
  }});
  if (r.status !== 201) fail('emit invoice', r.status, r.data);
  const invoice = r.data;
  const expectedTotal = 50000 * 1.21;
  if (Math.abs(invoice.total - expectedTotal) > 0.5) fail('total factura debería ser 60500', invoice);
  ok(`factura emitida: ${invoice.number} total $${invoice.total}`);

  // Cobro parcial
  r = await req('POST', `/api/invoices/${invoice.id}/payments`, { token: accessToken, body: {
    amount: 30000, method: 'transfer',
  }});
  if (r.status !== 201) fail('record payment', r.status, r.data);
  if (r.data.status !== 'issued' || r.data.paidAmount !== 30000) fail('cobro parcial mal aplicado', r.data);
  ok(`cobro parcial: pagado $${r.data.paidAmount} de $${r.data.total}, status ${r.data.status}`);

  // Accounts receivable
  r = await req('GET', '/api/invoices/accounts-receivable', { token: accessToken });
  if (r.status !== 200 || r.data.length < 1) fail('cuentas por cobrar', r.status, r.data);
  ok(`cuentas por cobrar: ${r.data.length} comprobantes pendientes`);

  // ============ COMPRAS + LIQUIDACIÓN ============
  log('\n=== COMPRAS ===');
  r = await req('POST', '/api/suppliers', { token: accessToken, body: {
    businessName: 'Insumos S.A.', email: 'ventas@insumos.com',
  }});
  if (r.status !== 201) fail('create supplier', r.status, r.data);
  ok('proveedor creado');

  // Liquidación a productor
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  r = await req('POST', '/api/producer-settlements', { token: accessToken, body: {
    producerId: producer.id, periodFrom: yesterday, periodTo: today,
  }});
  if (r.status !== 201) fail('settlement', r.status, r.data);
  if (r.data.totalLiters !== 1200) fail('liquidación debería ser 1200L', r.data);
  if (r.data.totalAmount !== 1200 * 350) fail('monto debería ser 420000', r.data);
  ok(`liquidación: ${r.data.totalLiters}L × $${r.data.averagePricePerLiter}/L = $${r.data.totalAmount}`);

  // ============ RRHH ============
  log('\n=== RRHH ===');
  r = await req('POST', '/api/employees', { token: accessToken, body: {
    firstName: 'Juan', lastName: 'Pérez', sector: 'Producción', shift: 'morning',
    hourlyCost: 1500, externalId: 'EMP001',
  }});
  if (r.status !== 201) fail('create employee', r.status, r.data);
  ok('empleado creado');

  // Ingest de eventos biométricos
  const now = Date.now();
  r = await req('POST', '/api/attendance/events', { token: accessToken, body: {
    events: [
      { externalEmployeeId: 'EMP001', type: 'in', timestamp: new Date(now - 8*3600000).toISOString() },
      { externalEmployeeId: 'EMP001', type: 'out', timestamp: new Date(now).toISOString() },
    ],
  }});
  if (r.status !== 201) fail('ingest attendance', r.status, r.data);
  if (r.data.ingested !== 2) fail('debería ingerir 2 eventos', r.data);
  ok(`ingest biométrico: ${r.data.ingested} eventos`);

  r = await req('GET', `/api/attendance/hours-report?from=${yesterday}&to=${today}`, { token: accessToken });
  if (r.status !== 200) fail('hours report', r.status, r.data);
  const empReport = r.data.find((e) => e.employeeName === 'Juan Pérez');
  if (!empReport || empReport.workedHours < 7.9 || empReport.workedHours > 8.1) fail('debería trabajar ~8 horas', empReport);
  ok(`horas trabajadas: ${empReport.workedHours} hs, costo $${empReport.laborCost}`);

  // ============ REPORTES ============
  log('\n=== REPORTES ===');
  r = await req('GET', '/api/reports/dashboard', { token: accessToken });
  if (r.status !== 200) fail('dashboard', r.status, r.data);
  if (r.data.milkReceivedTodayLiters !== 1200) fail('leche del día = 1200L', r.data);
  if (r.data.productionsClosedToday !== 1) fail('1 producción cerrada hoy', r.data);
  if (r.data.openInvoicesCount !== 1) fail('1 factura abierta', r.data);
  ok(`dashboard: ${r.data.milkReceivedTodayLiters}L leche / ${r.data.productionsClosedToday} producciones / ${r.data.openInvoicesCount} facturas abiertas`);

  r = await req('GET', '/api/reports/expiring-batches', { token: accessToken });
  if (r.status !== 200) fail('expiring batches', r.status, r.data);
  ok(`reporte vencimientos: ${r.data.length} lotes (sin expiration date asignada en este test)`);

  // ============ NOTIFICATIONS ============
  log('\n=== NOTIFICACIONES ===');
  r = await req('GET', '/api/notifications', { token: accessToken });
  if (r.status !== 200) fail('list notifications', r.status, r.data);
  ok(`notificaciones: ${r.data.length}`);

  // ============ LOGOUT ============
  log('\n=== LOGOUT ===');
  r = await req('POST', '/api/auth/logout', { token: accessToken });
  if (r.status !== 204) fail('logout', r.status, r.data);
  ok('logout');

  log('\n🎉 TODOS LOS FLUJOS VALIDADOS END-TO-END\n');
})().catch((e) => { console.error('💥', e); process.exit(1); });
