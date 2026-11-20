import type { StaffEmployee, PayrollStaffRow } from './production-staff.model';

/** Línea del día y última línea TA/TB de STB_data, con las ventanas de entrada de su departamento.
 * No se usa el turno asignado (Cl_Turnos): en STB_data todo el personal figura como TURNO A. */
export interface StaffShiftReference {
  id: number; name: string; active: boolean;
  currentLine: string; previousLine: string; previousLineDay: string;
  dayDeadline: number | null; nightDeadline: number | null; nightEnd: number | null;
}
/** Primera entrada de cada jornada trabajada (marcador biométrico de Payroll), en minutos desde medianoche. */
export interface StaffEntryPunch { id: number; day: string; minute: number }
export type StaffShift = 'A' | 'B';
export type ProductionShiftEvidence = {
  shift: StaffShift; basis: string; active: boolean; entranceDeadline: number | null; nightEnd: number | null;
};

/** Tolerancia sobre la hora habitual de entrada de la persona antes de considerarla ausente. */
export const ENTRY_GRACE_MINUTES = 45;
/** Entradas de 04:00 a 13:59 son del turno A; las de la tarde, noche o madrugada son del turno B. */
export const entryShift = (minute: number): StaffShift => minute >= 240 && minute < 840 ? 'A' : 'B';

export function productionLineShift(value: string): StaffShift | null {
  const text = value.toUpperCase().trim();
  return (text.match(/\bT([AB])\b/)?.[1] ?? text.match(/\bTURNO\s+([AB])\b/)?.[1] ?? text.match(/^([AB])$/)?.[1] ?? null) as StaffShift | null;
}
const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Turno de la jornada trabajada más reciente y hora habitual (mediana) de entrada en ese turno. */
export function punchPattern(punches: StaffEntryPunch[] | undefined) {
  if (!punches?.length) return null;
  const sorted = [...punches].sort((a, b) => b.day.localeCompare(a.day));
  const shift = entryShift(sorted[0].minute);
  // En el turno B la madrugada va después de la tarde: 01:00 se ordena como 25:00.
  const minutes = sorted.filter(punch => entryShift(punch.minute) === shift)
    .map(punch => shift === 'B' && punch.minute < 240 ? punch.minute + 1440 : punch.minute).sort((a, b) => a - b);
  const typical = minutes[Math.floor((minutes.length - 1) / 2)];
  return { shift, typical, days: minutes.length, lastDay: sorted[0].day };
}

const identity = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

export function attachProductionStaffShifts(rows: PayrollStaffRow[], day: string, references: StaffShiftReference[], punches: StaffEntryPunch[] = []): PayrollStaffRow[] {
  const byId = new Map(references.map(reference => [reference.id, reference]));
  const punchesById = new Map<number, StaffEntryPunch[]>();
  for (const punch of punches) if (punch.day < day) punchesById.set(punch.id, [...(punchesById.get(punch.id) ?? []), punch]);
  return rows.map(row => {
    if (row.day !== day) return row;
    const ref = byId.get(row.id);
    // Un ID de STB_data con otro nombre no es evidencia de la misma persona.
    if (ref && (!ref.name || !row.name || identity(ref.name) !== identity(row.name))) return row;
    const current = ref ? productionLineShift(ref.currentLine) : null;
    const previous = ref ? productionLineShift(ref.previousLine) : null;
    const pattern = punchPattern(punchesById.get(row.id));
    // Prioridad: línea TA/TB del día > marcaciones recientes > última línea TA/TB.
    const shift = current ?? pattern?.shift ?? previous;
    if (!shift) return row;
    const configured = shift === 'A' ? ref?.dayDeadline ?? null : ref?.nightDeadline ?? null;
    const personal = pattern?.shift === shift ? Math.min(pattern.typical + ENTRY_GRACE_MINUTES, 1439) : null;
    // En A nunca antes de la ventana de STB_data; en B la ventana configurada (19:05) no coincide con las entradas reales (15:30–18:00).
    const entranceDeadline = personal === null ? configured : shift === 'A' && configured !== null ? Math.max(personal, configured) : personal;
    const habit = pattern?.shift === shift ? `; suele entrar ${clock(pattern.typical)} (${pattern.days} jornadas en Payroll)` : '';
    const basis = current ? `Línea del día: ${ref!.currentLine.trim()}${habit}`
      : pattern?.shift === shift ? `Marcaciones de Payroll: entra ${clock(pattern.typical)} (${pattern.days} jornadas; última ${pattern.lastDay})`
        : `Última línea (${ref!.previousLineDay}): ${ref!.previousLine.trim()}`;
    return { ...row, productionShift: { shift, basis, active: ref?.active ?? true, entranceDeadline, nightEnd: ref?.nightEnd ?? null } };
  });
}
export function hasProductionShiftEvidence(person: StaffEmployee): boolean {
  return person.productionShift?.active === true && person.productionShift.entranceDeadline !== null;
}
