// Exportación a Excel (.xlsx) con exceljs. Genera un Buffer a partir de filas planas.
// Encabezados en negrita y ancho de columna razonable. CLAUDE.md §3 (los exportables
// van a Excel, no CSV).
import { Workbook } from 'exceljs';

type Cell = string | number | boolean | null | undefined;
type Row = Record<string, Cell>;

export async function toXlsx(
  sheetName: string,
  columns: ReadonlyArray<{ header: string; key: string }>,
  rows: ReadonlyArray<Row>,
): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(14, c.header.length + 2),
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
