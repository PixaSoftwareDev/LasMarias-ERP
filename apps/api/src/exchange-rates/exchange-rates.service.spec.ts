import { BadRequestException } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

// Mock mínimo del repo: solo lo que usa el servicio (findOne con order DESC).
function makeService(rows: Array<{ date: string; usd: string; eur: string }>) {
  const repo = {
    findOne: jest.fn(async (opts: { where?: { date?: unknown } }) => {
      // Sin filtro de fecha → "latest". Con filtro → la última <= fecha (ya vienen ordenadas DESC).
      return rows[0] ?? null;
    }),
  };
  return new ExchangeRatesService(repo as never);
}

describe('ExchangeRatesService — conversión a pesos (sella el costo, no toca la calculadora)', () => {
  const day = new Date('2026-06-05T10:00:00');

  it('ARS → multiplicador 1 (no consulta cotización)', async () => {
    const svc = makeService([]);
    expect((await svc.rateToArs('ARS', day)).toNumber()).toBe(1);
    expect(await svc.toArs(300, 'ARS', day)).toBe(300);
  });

  it('USD → precio × cotización del dólar. Ej verificable a mano: 0,30 USD × 1000 = $300', async () => {
    const svc = makeService([{ date: '2026-06-05', usd: '1000', eur: '1100' }]);
    expect(await svc.toArs(0.3, 'USD', day)).toBe(300);
    expect(await svc.toArs(2, 'USD', day)).toBe(2000);
  });

  it('EUR → precio × cotización del euro. Ej: 5 EUR × 1100 = $5500', async () => {
    const svc = makeService([{ date: '2026-06-05', usd: '1000', eur: '1100' }]);
    expect(await svc.toArs(5, 'EUR', day)).toBe(5500);
  });

  it('sin cotización cargada y moneda extranjera → error claro (no convierte a ciegas)', async () => {
    const svc = makeService([]);
    await expect(svc.toArs(10, 'USD', day)).rejects.toBeInstanceOf(BadRequestException);
  });
});
