import { BadRequestException } from '@nestjs/common';
import Big from 'big.js';
import type { SaleLot } from '@lasmarias/shared-schemas';
import type { FefoPlan } from './fefo-plan';

// Renglón de venta repartido entre lotes elegidos a mano (pedido del dueño, 12/11/2026): un solo
// renglón "701 kg de masa, 44 bultos" que sale 328 kg / 20 b de un lote y 373 kg / 24 b de otro.
// Cuentas puras en decimal exacto; tiran BadRequest con un mensaje para el usuario.

interface RenglonRepartido {
  quantity: number;
  bultos?: number;
  lotes?: SaleLot[];
}

// Los kg repartidos tienen que dar exacto el total del renglón.
export function validarRepartoKg(l: RenglonRepartido, producto: string, unidad: string): void {
  const suma = (l.lotes ?? []).reduce((acc, x) => acc.plus(x.quantity), new Big(0));
  if (!suma.eq(l.quantity))
    throw new BadRequestException(
      `Repartiste ${suma.toNumber()} ${unidad} de ${producto} entre los lotes, pero el renglón es de ${l.quantity}. Tienen que coincidir.`,
    );
}

// Bultos del renglón: si se cargaron por lote, son la suma (y si además vino el total, tiene que
// coincidir). Si no se cargaron por lote, queda el total del renglón (se reparte a prorrata).
export function bultosDelReparto(l: RenglonRepartido, producto: string): number | undefined {
  if (!l.lotes?.some((x) => x.bultos != null)) return l.bultos;
  const suma = l.lotes.reduce((acc, x) => acc + (x.bultos ?? 0), 0);
  if (l.bultos != null && l.bultos !== suma)
    throw new BadRequestException(
      `Repartiste ${suma} bultos de ${producto} entre los lotes, pero el renglón dice ${l.bultos}. Tienen que coincidir.`,
    );
  return suma;
}

interface LoteConSaldo {
  id: string;
  code: string;
  remainingQuantity: string | number;
}

// Cuánto sale de cada lote: lo que cargaron, si el lote lo tiene.
export function planDelReparto(
  line: { productName: string; unit: string; lotes?: SaleLot[] },
  activos: LoteConSaldo[],
): FefoPlan {
  const allocations = (line.lotes ?? []).map((x) => {
    const lote = activos.find((b) => b.id === x.batchId);
    if (!lote)
      throw new BadRequestException(
        `Uno de los lotes elegidos de ${line.productName} ya no tiene stock. Volvé a elegir los lotes.`,
      );
    const saldo = new Big(lote.remainingQuantity);
    if (saldo.lt(x.quantity))
      throw new BadRequestException(
        `El lote ${lote.code} tiene ${saldo.toNumber()} ${line.unit} de ${line.productName} y le asignaste ${x.quantity}.`,
      );
    return { batchId: lote.id, take: x.quantity, remainingAfter: saldo.minus(x.quantity).toNumber() };
  });
  return { allocations, shortage: 0 };
}
