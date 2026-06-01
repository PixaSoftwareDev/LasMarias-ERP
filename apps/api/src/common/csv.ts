// Exportación CSV mínima, sin librerías pesadas (CLAUDE.md: evitar sobre-ingeniería).
// Genera un CSV a partir de filas planas (objeto → columnas). Escapa comillas, comas
// y saltos de línea según RFC 4180. La cabecera se toma de las claves de la primera fila
// (o de `headers` si se pasa explícito, útil para fijar orden y nombres en español).

type CsvCell = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvCell>;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: ReadonlyArray<CsvRow>, headers?: ReadonlyArray<string>): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines: string[] = [];
  lines.push(cols.map((c) => escapeCell(c)).join(','));
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row[c])).join(','));
  }
  return lines.join('\r\n');
}
