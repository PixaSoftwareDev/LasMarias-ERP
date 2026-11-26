import Big from 'big.js';

// Costos fijos que una mozzarella/queso trae DENTRO del costo de la masa que consumió (Pablo
// 26/11: "que sume los costos fijos a la mozzarella"). Ya están sumados: los carga la masa por
// litro de leche y la mozzarella hereda su $/kg. Esto solo los hace VISIBLES; no cambia el costo.
//   fijo por kg de masa = línea "COSTOS FIJOS DE PLANTA" de la masa / kg de masa producidos
//   heredado            = Σ kg de masa consumidos × fijo por kg de esa masa
//   por kg              = heredado / kg de producto
export interface MasaConsumida {
  code: string;
  kgConsumidos: string | number;
  fijoMasa: string | null; // subtotal de la línea de costos fijos de la masa (null = no tenía)
  kgMasa: string | number; // kg de masa que produjo esa orden
}

export interface FijosHeredados {
  total: string;
  porKg: string | null;
  sinFijos: string[]; // masas usadas que se cerraron sin costos fijos
}

export function fijosHeredados(masas: MasaConsumida[], kgProducto: string | number): FijosHeredados | null {
  if (masas.length === 0) return null;
  let total = new Big(0);
  const sinFijos: string[] = [];
  for (const m of masas) {
    const kgMasa = new Big(String(m.kgMasa));
    if (m.fijoMasa == null || new Big(m.fijoMasa).lte(0) || kgMasa.lte(0)) {
      sinFijos.push(m.code);
      continue;
    }
    total = total.plus(new Big(String(m.kgConsumidos)).times(m.fijoMasa).div(kgMasa));
  }
  const kg = new Big(String(kgProducto));
  return {
    total: total.toFixed(2),
    porKg: kg.gt(0) ? total.div(kg).toFixed(2) : null,
    sinFijos,
  };
}
