import type { PayrollStaffRow } from './production-staff.model';

/** Línea del día y última línea TA/TB de STB_data, con las ventanas de entrada de su departamento.
 * No se usa el turno asignado (Cl_Turnos): en STB_data todo el personal figura como TURNO A. */
export interface StaffShiftReference {
  id: number; name: string; active: boolean;
  currentLine: string; previousLine: string; previousLineDay: string;
  dayDeadline: number | null; nightDeadline: number | null; nightEnd: number | null;
}
export type StaffShift = 'A' | 'B';
export type ProductionShiftEvidence = {
  shift: StaffShift; basis: string; active: boolean; entranceDeadline: number | null; nightEnd: number | null;
};

export function productionLineShift(value: string): StaffShift | null {
  const text = value.toUpperCase().trim();
  return (text.match(/\bT([AB])\b/)?.[1] ?? text.match(/\bTURNO\s+([AB])\b/)?.[1] ?? text.match(/^([AB])$/)?.[1] ?? null) as StaffShift | null;
}
const identity = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/** El turno solo se deduce de líneas de chequeo verificadas por identidad. */
export function attachProductionStaffShifts(rows: PayrollStaffRow[], day: string, references: StaffShiftReference[]): PayrollStaffRow[] {
  const byId = new Map(references.map(reference => [reference.id, reference]));
  return rows.map(row => {
    if (row.day !== day) return row;
    const ref = byId.get(row.id);
    if (!ref || !ref.name || !row.name || identity(ref.name) !== identity(row.name)) return row;
    const current = productionLineShift(ref.currentLine), previous = productionLineShift(ref.previousLine);
    const shift = current ?? previous;
    if (!shift) return row;
    return {...row, productionShift: {shift, basis: current ? `Línea del chequeo: ${ref.currentLine.trim()}` : `Última línea de chequeo (${ref.previousLineDay}): ${ref.previousLine.trim()}`,
      active: ref.active, entranceDeadline: null, nightEnd: null}};
  });
}
