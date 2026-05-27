/**
 * Carga de DATOS DE DEMOSTRACIÓN vía la API REST (respeta validaciones y lógica
 * de negocio: genera lotes, resuelve precios, calcula totales).
 *
 * Uso:  pnpm --filter api seed:demo      (con la API corriendo en :4000)
 *
 * Es tolerante a duplicados: si un dato ya existe, lo saltea y sigue.
 * NO borra nada. Pensado para dejar la app "poblada" para demo/capacitación.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:4000';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@lasmarias.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Cambiar';

let token = '';

async function login(): Promise<void> {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login falló (${r.status}). ¿La API está corriendo en ${API}?`);
  const data = (await r.json()) as { tokens?: { accessToken: string }; accessToken?: string };
  token = data.tokens?.accessToken ?? data.accessToken ?? '';
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
    const short = text.replace(/\s+/g, ' ').slice(0, 140);
    console.warn(`   ↳ ${method} ${path} → ${r.status} ${short}`);
    return null;
  }
  return text ? (JSON.parse(text) as T) : null;
}

const get = <T = any>(p: string) => req<T>('GET', p);
const post = <T = any>(p: string, b: unknown) => req<T>('POST', p, b);

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

async function main() {
  console.log(`[seed:demo] API: ${API}`);
  await login();
  console.log('[seed:demo] Sesión iniciada como admin.');

  // 1) Zonas de reparto -------------------------------------------------------
  console.log('→ Zonas de reparto');
  await post('/api/delivery/zones', { name: 'Centro Pergamino', description: 'Casco urbano', deliveryDays: ['mon', 'wed', 'fri'], cutoffTime: '12:00' });
  await post('/api/delivery/zones', { name: 'Ruta Norte', description: 'Localidades del norte', deliveryDays: ['tue', 'thu'], cutoffTime: '10:00' });
  const zones = (await get<any[]>('/api/delivery/zones')) ?? [];
  const zoneCentro = zones.find((z) => z.name === 'Centro Pergamino')?.id;
  const zoneNorte = zones.find((z) => z.name === 'Ruta Norte')?.id;

  // 2) Productos --------------------------------------------------------------
  console.log('→ Productos');
  const productSeeds = [
    { sku: 'QC-001', name: 'Queso cremoso 1kg', category: 'queso', unit: 'kg', trackBatches: true },
    { sku: 'MUZ-001', name: 'Muzzarella 1kg', category: 'queso', unit: 'kg', trackBatches: true },
    { sku: 'RIC-001', name: 'Ricota 500g', category: 'subproducto', unit: 'unidad', trackBatches: true },
    { sku: 'SUE-001', name: 'Suero (granel)', category: 'subproducto', unit: 'litro', trackBatches: false },
    { sku: 'SAL-001', name: 'Sal entrefina', category: 'insumo', unit: 'kg', trackBatches: false },
    { sku: 'FER-001', name: 'Fermento láctico', category: 'insumo', unit: 'unidad', trackBatches: false },
  ];
  for (const p of productSeeds) await post('/api/products', p);
  const products = (await get<any[]>('/api/products')) ?? [];
  const idBySku = (sku: string) => products.find((p) => p.sku === sku)?.id;

  // 3) Listas de precios (una por tipo de cliente) ----------------------------
  console.log('→ Listas de precios');
  const priced = (sku: string, minor: number, mayor: number, distri: number) => ({ sku, minor, mayor, distri });
  const priceRows = [
    priced('QC-001', 3500, 3000, 2800),
    priced('MUZ-001', 4200, 3700, 3500),
    priced('RIC-001', 1800, 1500, 1400),
    priced('SUE-001', 200, 180, 150),
  ].filter((r) => idBySku(r.sku));
  const existingLists = (await get<any[]>('/api/sales/price-lists')) ?? [];
  for (const [type, key] of [['minorista', 'minor'], ['mayorista', 'mayor'], ['distribuidor', 'distri']] as const) {
    if (existingLists.some((l) => l.clientType === type)) continue;
    await post('/api/sales/price-lists', {
      name: `Lista ${type}`,
      clientType: type,
      items: priceRows.map((r) => ({ productId: idBySku(r.sku)!, unitPrice: (r as any)[key] })),
    });
  }

  // 4) Productores ------------------------------------------------------------
  console.log('→ Productores');
  await post('/api/producers', { name: 'Tambo La Esperanza', agreedPricePerLiter: 320, city: 'Pergamino' });
  await post('/api/producers', { name: 'Tambo Don Pedro', agreedPricePerLiter: 315, city: 'Colón' });
  await post('/api/producers', { name: 'Tambo Santa Rita', agreedPricePerLiter: 310, city: 'Pergamino' });
  const producers = (await get<any[]>('/api/producers')) ?? [];

  // 5) Proveedores ------------------------------------------------------------
  console.log('→ Proveedores');
  await post('/api/suppliers', { businessName: 'Insumos del Litoral', contactName: 'Mariana Gómez', phone: '2477-456789' });
  await post('/api/suppliers', { businessName: 'Envases del Sur SA', contactName: 'Carlos Ruiz', phone: '2477-112233' });

  // 6) Clientes ---------------------------------------------------------------
  console.log('→ Clientes');
  const clientSeeds = [
    { businessName: 'Almacén Doña Rosa', type: 'minorista', city: 'Pergamino', zoneId: zoneCentro },
    { businessName: 'Supermercado El Ahorro', type: 'mayorista', city: 'Pergamino', zoneId: zoneCentro },
    { businessName: 'Distribuidora Norte SRL', type: 'distribuidor', city: 'Colón', zoneId: zoneNorte },
    { businessName: 'Rotisería La Esquina', type: 'minorista', city: 'Pergamino', zoneId: zoneNorte },
  ];
  for (const c of clientSeeds) await post('/api/clients', c);
  const clients = (await get<any[]>('/api/clients')) ?? [];

  // 7) Recepciones de leche (calidad buena → aceptadas, generan lote) ---------
  console.log('→ Recepciones de leche');
  const goodQuality = { fatPercent: 3.5, proteinPercent: 3.2, ph: 6.7, temperatureCelsius: 4, somaticCellCount: 200000, bacterialCount: 50000, alcoholTestPassed: true, antibioticsDetected: false };
  for (let i = 0; i < producers.length; i++) {
    const prod = producers[i];
    if (!prod) continue;
    await post('/api/milk-receptions', { receivedAt: daysAgo(i + 1), producerId: prod.id, liters: 1200 + i * 200, quality: goodQuality, vehiclePlate: `AB${100 + i}CD` });
  }

  // 8) Pedidos (con cliente + productos vendibles → total resuelto) -----------
  console.log('→ Pedidos');
  const sellable = ['QC-001', 'MUZ-001', 'RIC-001'].map(idBySku).filter(Boolean) as string[];
  const withZone = clients.filter((c) => c.zoneId);
  for (let i = 0; i < Math.min(3, withZone.length); i++) {
    const c = withZone[i];
    await post('/api/sales/orders', {
      clientId: c.id,
      lines: [
        { productId: sellable[0], quantity: 5 + i },
        ...(sellable[1] ? [{ productId: sellable[1], quantity: 3 }] : []),
      ],
    });
  }

  console.log('[seed:demo] ✓ Listo. Entrá a la app y vas a ver las pantallas pobladas.');
}

main().catch((e) => {
  console.error('[seed:demo] Error:', e.message ?? e);
  process.exit(1);
});
