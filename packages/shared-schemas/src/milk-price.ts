import { z } from 'zod';
import { monthKeySchema } from './month';

// Precio de la leche POR MES de cada tambo (pedido del dueño 10/11/2026): los litros de
// octubre al precio de octubre, los de noviembre al de noviembre. El precio se carga en la
// moneda y con el IVA que tenga el tambo (igual que el precio acordado). Al guardarlo se
// re-precian todas las recepciones de ese tambo en ese mes → la cuenta corriente queda real
// y el costo de la leche que todavía no se usó también. Las elaboraciones ya cerradas NO
// cambian (mismo criterio que editar una recepción, CLAUDE.md §5).

export const milkMonthPriceRowSchema = z.object({
  producerId: z.string().uuid(),
  producerName: z.string(),
  currency: z.string(), // ARS | USD | EUR
  ivaMode: z.string(), // sin_iva | con_iva
  litros: z.string(), // litros recibidos en el mes (recepciones aceptadas)
  recepciones: z.number().int(),
  preciosUsados: z.array(z.number()), // $/L (en pesos, con IVA) con que están cargadas hoy
  importe: z.string(), // Σ litros × precio usado, en pesos (lo que hoy dice la cuenta corriente)
  precioMes: z.number().nullable(), // precio cargado para este mes (moneda del tambo)
  precioAcordado: z.number().nullable(), // precio actual del tambo (moneda del tambo)
});
export type MilkMonthPriceRow = z.infer<typeof milkMonthPriceRowSchema>;

export const milkMonthPricesSchema = z.object({
  month: monthKeySchema,
  mesActual: monthKeySchema,
  ivaRate: z.number(),
  rows: z.array(milkMonthPriceRowSchema), // tambos activos + los que entregaron ese mes
});
export type MilkMonthPrices = z.infer<typeof milkMonthPricesSchema>;

export const saveMilkMonthPricesInputSchema = z.object({
  prices: z
    .array(
      z.object({
        producerId: z.string().uuid(),
        price: z.number().positive('El precio tiene que ser mayor a 0').max(1e7).nullable(), // null = sacar el precio del mes
      }),
    )
    .min(1)
    .max(500),
});
export type SaveMilkMonthPricesInput = z.infer<typeof saveMilkMonthPricesInputSchema>;

export const saveMilkMonthPricesResultSchema = z.object({
  overview: milkMonthPricesSchema,
  recepcionesActualizadas: z.number().int(),
  importeAntes: z.string(), // total a pagar a los tambos cambiados, antes (en pesos)
  importeDespues: z.string(),
  litrosYaElaborados: z.string(), // de esa leche, lo que ya entró en elaboraciones (no se recalcula)
  diferenciaYaElaborada: z.string(), // litros ya elaborados × (precio nuevo − viejo): no entra al costo de lo ya cerrado
});
export type SaveMilkMonthPricesResult = z.infer<typeof saveMilkMonthPricesResultSchema>;
