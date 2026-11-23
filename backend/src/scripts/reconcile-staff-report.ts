/** Lectura y conciliación por ID. No importa registros ni modifica el Excel o las bases. */
import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import { getProductionStaff, validStaffDate, staffToday } from '../services/production-staff.service';
import { compareStaffReference, referenceStatus, StaffReferenceRow } from '../utils/staffReportReference';
import { closePayrollPool } from '../config/payrollDb';
import { closeStbPool } from '../config/stbDb';
import { closeRedis } from '../config/redis';

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) throw new Error('Uso: npm run reconcile:personal -- archivo.xlsx [detalle.json]');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El libro no tiene hojas.');
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => columns.set(cell.text.trim().toUpperCase(), col));
  const dateHeader = [...columns.keys()].find(value => /^\d{2}\/\d{2}\/\d{4}$/.test(value));
  if (!dateHeader || !columns.has('ID') || !columns.has('TIPO CONTRATO')) throw new Error('Faltan ID, TIPO CONTRATO o la columna de fecha.');
  const [d, m, y] = dateHeader.split('/'); const day = `${y}-${m}-${d}`;
  if (!validStaffDate(day, staffToday())) throw new Error('La fecha del reporte no es válida.');
  const rows: StaffReferenceRow[] = []; const marks: Record<string, number> = {};
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.getCell(columns.get('ID')!).text.trim()) return;
    if (row.getCell(columns.get('TIPO CONTRATO')!).text.trim().toUpperCase() !== 'T') return;
    const id = Number(row.getCell(columns.get('ID')!).text);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Código inválido en fila ${index}.`);
    const mark = row.getCell(columns.get(dateHeader)!).text.trim();
    rows.push({ id, mark, status: referenceStatus(mark) });
    marks[mark] = (marks[mark] ?? 0) + 1;
  });
  console.log(JSON.stringify({ day, sheet: sheet.name, marks, total: rows.length }));
  const result = await getProductionStaff(day, true);
  const comparison = compareStaffReference(rows, result.employees);
  const { mismatches, extraIds, ...summary } = comparison;
  console.log(JSON.stringify({ day, ...summary, mismatchCount: mismatches.length, extraCount: extraIds.length }));
  if (output) await fs.writeFile(output, JSON.stringify({ day, ...comparison }, null, 2));
  // Un desajuste nunca se presenta como una conciliación exitosa.
  if (mismatches.length || extraIds.length) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'No se pudo conciliar.'); process.exitCode = 1; })
  .finally(async () => { await Promise.allSettled([closePayrollPool(), closeStbPool(), closeRedis()]); });
