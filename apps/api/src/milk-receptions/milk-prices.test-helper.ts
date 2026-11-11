import { MilkPricesService } from './milk-prices.service';

// Para los tests de recepciones: sin precios por mes cargados (usa el precio acordado) y
// la conversión de moneda que pase cada test.
export function milkPricesSinMeses(exchangeRates: { toArs: (...a: any[]) => any } = { toArs: (a: number) => Promise.resolve(a) }) {
  const ds = { manager: { getRepository: () => ({ findOne: async () => null }) } };
  return new MilkPricesService(ds as any, { getIvaRate: async () => 21 } as any, exchangeRates as any);
}
