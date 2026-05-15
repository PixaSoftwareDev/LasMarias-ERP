// Generación de código de lote para recepciones de leche.
// Formato: LM-LC-YYYYMMDD-NNNN  (Las Marías - Leche Cruda - fecha - secuencia diaria)
// Es legible humanamente y se imprime como QR (CLAUDE.md §4.4).

export interface BatchCodeParts {
  date: Date;
  sequence: number;
}

export function formatMilkBatchCode({ date, sequence }: BatchCodeParts): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `LM-LC-${yyyy}${mm}${dd}-${seq}`;
}

export function parseMilkBatchCode(code: string): BatchCodeParts | null {
  const m = /^LM-LC-(\d{4})(\d{2})(\d{2})-(\d{4})$/.exec(code);
  if (!m) return null;
  return {
    date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    sequence: Number(m[4]),
  };
}
