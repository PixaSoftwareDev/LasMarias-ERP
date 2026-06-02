import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// Cuenta por pagar a un tambo (espejo de la cuenta corriente de clientes).
// Compra de leche a precio fijo por litro, liquidación mensual.

// Saldo por tambo (vista lista).
export const producerBalanceSchema = z.object({
  producerId: uuidSchema,
  producerName: z.string(),
  totalReceived: z.number(), // $ total de leche recibida (cargos)
  totalPaid: z.number(),
  balance: z.number(), // lo que se debe = cargos − pagos
});
export type ProducerBalance = z.infer<typeof producerBalanceSchema>;

// Una recepción de leche como línea de la liquidación.
export const producerReceptionLineSchema = z.object({
  receptionId: uuidSchema,
  code: z.string(),
  receivedAt: isoDateTimeSchema,
  liters: z.number(),
  pricePerLiter: z.number(),
  amount: z.number(),
});
export type ProducerReceptionLine = z.infer<typeof producerReceptionLineSchema>;

export const producerPaymentSchema = z.object({
  id: uuidSchema,
  producerId: uuidSchema,
  amount: z.number(),
  occurredAt: isoDateTimeSchema,
  method: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ProducerPayment = z.infer<typeof producerPaymentSchema>;

// Detalle de la cuenta de un tambo: saldo total + recepciones y pagos del período.
export const producerAccountDetailSchema = z.object({
  producerId: uuidSchema,
  producerName: z.string(),
  balance: z.number(), // saldo acumulado total (lo que se debe hoy)
  receptions: z.array(producerReceptionLineSchema),
  payments: z.array(producerPaymentSchema),
});
export type ProducerAccountDetail = z.infer<typeof producerAccountDetailSchema>;

export const registerProducerPaymentInputSchema = z.object({
  producerId: uuidSchema,
  amount: z.number().positive('El pago tiene que ser mayor a 0'),
  occurredAt: isoDateTimeSchema.optional(),
  method: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});
export type RegisterProducerPaymentInput = z.infer<typeof registerProducerPaymentInputSchema>;
