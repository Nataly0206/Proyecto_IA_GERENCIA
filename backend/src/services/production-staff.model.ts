import type { ProductionShiftEvidence } from './production-staff-shift';

export type StaffStatus = 'present' | 'absent' | 'excused' | 'off' | 'noProduction' | 'pending' | 'conflict';
export type StaffKind = 'production' | 'machine' | 'auxiliary' | 'supervisor' | 'unknown';
export type PayrollSource = 'calendar' | 'action' | 'clock' | 'attendance' | 'report' | 'payment' | 'payroll' | 'weighing' | 'activity';
export interface PayrollStaffRow {
  day: string; id: number; code: string; name: string; department: string; division: string;
  job: string; shift: string; source: PayrollSource; actionCode: string; action: string;
  productionShift?: ProductionShiftEvidence;
  punchCount?: number;
  line?: string; process?: string; activity?: string;
  paymentConcept?: string; reportMark?: 'A' | 'X' | null; firstPunch?: string; lastPunch?: string;
  collector: number; noProduction: boolean; entry: string; exit: string; hours: string;
}
export interface StaffEmployee {
  id: number; code: string; name: string; department: string; division: string; job: string; shift: string;
  kind: StaffKind; wildcard: boolean; status: StaffStatus; reason: string;
  area: string; areaBasis: string; areaDay: string | null; areaTime: string | null;
  activityAssignment?: { source: 'check' | 'weighing' | 'unknown' | 'conflict'; process: string; line: string; start: string | null; end: string | null };
  activity: string; activityBasis: string; otherActivities: string[];
  dailyActivities?: { activity: string; line: string; process: string; area: string; start: string | null; end: string | null; hours: number | null }[];
  /** Renglón de la lista de departamentos de planta (ver production-staff-department.ts). */
  plantDepartment: string; plantDepartmentBasis: string;
  paymentConcepts?: string[];
  derivedAbsence?: boolean;
  provisionalAbsence?: boolean;
  productionShift?: ProductionShiftEvidence;
  biometricMarked: boolean; biometricEntry: boolean; biometricReview: boolean; hasPositivePayment: boolean;
  punchCount: number; hasCheck: boolean;
  /** Asistencia según STB: chequeo de actividad o pesa del día. Es la base de Obra / Auxiliares. */
  stbAttendance: boolean;
  actions: { code: string; label: string }[]; entry: string | null; exit: string | null;
  reportMark: 'A' | 'X' | null; firstPunch: string | null; lastPunch: string | null;
  sources: PayrollSource[]; hasAttendance: boolean; absenceRecorded: boolean;
}
export const STATUS_LABELS: Record<StaffStatus, string> = {
  present: 'Asistió', absent: 'Falta registrada', excused: 'Permiso / incapacidad',
  off: 'Descanso / vacaciones', noProduction: 'Sin producción', pending: 'Sin registro de asistencia', conflict: 'Revisar registros',
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
export function staffKind(job: string): StaffKind {
  const text = normalize(job);
  if (/SUPERVISOR|SUPERVISION/.test(text) && !/APOYO|AUX|ASISTENTE/.test(text)) return 'supervisor';
  if (/AUX|APOYO|COMODIN|COORD|CONTROL|GUARDIA|CONTABIL|FACTURACION|GERENTE|MOTORISTA|FONTANERO|MONTACARGAS|COMPRESORES|HIELO|REPARACION|COCINA|PESADORA|LIMPIEZA/.test(text)) return 'auxiliary';
  if (/CLASIFICADO|\bIQF|MAQUINISTA/.test(text)) return 'machine';
  if (/\bOBRA\b|DESTAJO|DECORACION|REEMPAQUE|OPERARIO/.test(text)) return 'production';
  return 'auxiliary';
}
/** Procesos/líneas de STB que son obra aunque se registren por chequeo (Decoración Anillos, Reempaque). */
const OBRA_CHECK = (process: string, line: string) => /DECORACION ANILLOS/.test(normalize(process)) || /REEMPAQUE|DECORACION|PERFORACION/.test(normalize(line));
/**
 * Tipo de personal según STB: chequeado en cualquier otro proceso = auxiliar; pesa o chequeo de obra = obra.
 * Sin evidencia en STB se usa el puesto de Payroll solo como referencia (Máquinas se integra a Auxiliares).
 */
export function stbStaffKind(job: string, checks: { process?: string; line?: string }[], weighed: boolean): StaffKind {
  const byJob = staffKind(job);
  if (byJob === 'supervisor') return 'supervisor';
  if (checks.some(check => !OBRA_CHECK(check.process ?? '', check.line ?? ''))) return 'auxiliary';
  if (weighed || checks.length) return 'production';
  return byJob === 'machine' || byJob === 'unknown' ? 'auxiliary' : byJob;
}
/** Turno escrito en la línea o la actividad: "TA" = A, "TB" = B (como palabra suelta). */
export function shiftToken(text: string | undefined): 'A' | 'B' | null {
  const match = ` ${normalize(text ?? '')} `.match(/[^A-Z0-9]T([AB])[^A-Z0-9]/);
  return match ? match[1] as 'A' | 'B' : null;
}
/** Turno del día según STB: el del último chequeo cuya línea o actividad dice TA/TB. */
export function stbShift(checks: { entry: string; line?: string; activity?: string }[]): 'A' | 'B' | null {
  const ordered = [...checks].sort((a, b) => a.entry.localeCompare(b.entry));
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const found = shiftToken(ordered[index].line) ?? shiftToken(ordered[index].activity);
    if (found) return found;
  }
  return null;
}
export function payrollTime(value: string): string | null {
  const clean = value.trim();
  const match = clean.match(/^(\d{2}):?(\d{2})(?::?(\d{2}))?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}
function actionStatus(code: string, label: string): StaffStatus | null {
  const normalizedCode = code.trim().toUpperCase().replace(/^A(?=\d)/, '');
  const text = normalize(label);
  if (normalizedCode === '011' || /FERIADO TRABAJADO/.test(text)) return 'present';
  if (['013', '039', '009'].includes(normalizedCode) || /FALTO A TRABAJAR|^INASISTENCIA$|^DIAS AUSENCIA$/.test(text)) return 'absent';
  if (normalizedCode === '040' || /POCA PRODUCCION|FALTA.*PRODUCTO/.test(text)) return 'noProduction';
  if (['006', '007', '010', '019', '030', '035'].includes(normalizedCode) || /DESCANSO|DIA LIBRE|LIBRE POR FERIADO|FERIADO COMPENSATORIO|VACACIONES|SALIO DE TURNO/.test(text)) return 'off';
  if (['014', '015', '018', '024', '025', '026', '027', '005', '032'].includes(normalizedCode) || /INCAPACIDAD|PERMISO|PRE Y POST NATAL|LACTANCIA|TRABAJO EXTERNO|SUSPENSION CON GOCE/.test(text)) return 'excused';
  return null;
}

/** Entrada biométrica, pesa o chequeo prueban presencia; el pago solo concilia. */
export function buildStaffEmployees(rows: PayrollStaffRow[], day: string, _now = new Date()): StaffEmployee[] {
  const grouped = new Map<number, PayrollStaffRow[]>();
  for (const row of rows) {
    if (!['payroll','action','weighing','activity','clock','payment'].includes(row.source)) continue;
    if (row.day !== day || !Number.isInteger(row.id) || row.id <= 0) continue;
    const values = grouped.get(row.id) ?? []; values.push(row); grouped.set(row.id, values);
  }
  return [...grouped].filter(([, values]) => values.some(row => row.source === 'payroll')).map(([id, values]): StaffEmployee => {
    const reference = values.find(row => row.source === 'payroll') ?? values[0];
    const checkRows = values.filter(row => row.source === 'activity' && payrollTime(row.entry) !== null);
    const weighedToday = values.some(row => row.source === 'weighing');
    const kind = stbStaffKind(reference.job, checkRows, weighedToday);
    const actions = new Map<string, { code: string; label: string }>();
    const states = new Set<StaffStatus>();
    const entries: string[] = [], exits: string[] = [];
    let hasAttendance = false, unknownAction = false, hasWeighing = false;
    const clocks = values.filter(row => row.source === 'clock');
    const biometricMarked = clocks.some(row => (row.punchCount ?? 0) > 0);
    const biometricEntry = clocks.some(row => payrollTime(row.entry) !== null);
    // Marca sin entrada: solo cuando STB no confirma presencia (sin chequeo ni pesa); si no, es una marca mal tipificada.
    const biometricReview = biometricMarked && !biometricEntry && !checkRows.length && !weighedToday;
    const hasPositivePayment = values.some(row => row.source === 'payment');
    const hasCheck = values.some(row => row.source === 'activity' && payrollTime(row.entry) !== null);
    for (const row of values) {
      if (row.source === 'payroll' || row.source === 'action') {
        const state = actionStatus(row.actionCode, row.action);
        // Feriado trabajado y otras etiquetas no reemplazan el chequeo ni una pesa.
        if (state && state !== 'present') states.add(state);
        const code = row.actionCode.trim(), label = row.action.trim();
        if (label || (code && !/^N\/?A$/i.test(code))) {
          actions.set(normalize(label || code), { code, label: label || code });
          if (!state) unknownAction = true;
        }
        if (row.noProduction) states.add('noProduction');
      }
      const entry = payrollTime(row.entry), exit = payrollTime(row.exit);
      const weighed = row.source === 'weighing';
      const checked = row.source === 'activity' && entry !== null;
      const entered = row.source === 'clock' && entry !== null;
      if (weighed || checked || entered) {
        hasAttendance = true; hasWeighing ||= weighed;
        if (entry) entries.push(entry);
        if ((checked || entered) && exit) exits.push(exit);
      }
    }
    let status: StaffStatus = states.size > 1 || (hasAttendance && states.size > 0) || unknownAction ? 'conflict'
      : hasAttendance ? 'present' : states.size === 1 ? [...states][0] : 'pending';
    const identity = (name: string) => normalize(name).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
    const identityMismatch = values.some(row => row.name && reference.name && identity(row.name) !== identity(reference.name));
    if (identityMismatch) status = 'conflict';
    // TB = Turno B; TA o sin TA/TB en la línea/actividad (con chequeo o pesa del día) = Turno A.
    const explicitShift = stbShift(checkRows);
    const shiftOfDay = explicitShift ?? (checkRows.length || weighedToday ? 'A' : null);
    const productionShift = shiftOfDay ? { shift: shiftOfDay, basis: explicitShift ? 'TA/TB de la línea o actividad del chequeo del día' : 'Línea/actividad sin TA/TB: se toma Turno A', active: true, entranceDeadline: null, nightEnd: null } : undefined;
    // Sin programación de turno, ausencia de evidencia no crea una falta.
    const derivedAbsence = false;
    if (status === 'pending' && biometricReview) status = 'conflict';
    const reason = identityMismatch ? 'El código coincide pero los nombres difieren; revisar identidad.'
      : status === 'conflict' ? biometricReview && !hasAttendance && states.size === 0 ? 'Marca biométrica sin entrada hoy; revisar posible salida del turno nocturno anterior.' : 'Biométrico, chequeos o novedades contradictorias para la misma persona y fecha.'
      : status === 'present' ? biometricEntry ? 'Asistencia confirmada por entrada biométrica del día.' : hasWeighing ? 'Asistencia confirmada por la primera pesa válida del día.' : 'Asistencia confirmada por chequeo manual de actividad.'
      : status === 'pending' ? !productionShift ? 'Turno sin confirmar: pendiente de asistencia; no se cuenta como falta.' : `Turno ${productionShift.shift}: pendiente de asistencia; no se cuenta como falta.`
      : [...actions.values()].map(action => action.label).join(' · ') || STATUS_LABELS[status];
    return {
      id, code: reference.code || String(id), name: reference.name || `Empleado ${id}`,
      department: reference.department || 'Sin departamento', division: reference.division || 'Sin división',
      job: reference.job || 'Sin puesto registrado', kind, wildcard: /COMODIN/.test(normalize(reference.job)),
      shift: productionShift?.shift ?? 'Sin turno registrado', productionShift,
      area: 'Sin sala/área asignada', areaBasis: 'Sin asignación verificada', areaDay: null, areaTime: null,
      activity: 'Sin actividad registrada', activityBasis: 'Sin actividad ni proceso registrado para el día', otherActivities: [],
      plantDepartment: 'Sin departamento asignado', plantDepartmentBasis: 'Sin ubicación de STB',
      paymentConcepts: [], firstPunch: clocks.map(row => payrollTime(row.firstPunch ?? '')).filter((v): v is string => !!v).sort()[0] ?? null,
      lastPunch: clocks.map(row => payrollTime(row.lastPunch ?? '')).filter((v): v is string => !!v).sort().slice(-1)[0] ?? null,
      biometricMarked, biometricEntry, biometricReview, hasPositivePayment, hasCheck, stbAttendance: hasCheck || weighedToday,
      punchCount: clocks.reduce((sum,row) => sum + (row.punchCount ?? 0),0),
      reportMark: status === 'present' ? 'A' : status === 'absent' ? 'X' : null,
      entry: entries.sort()[0] ?? null, exit: exits.sort().slice(-1)[0] ?? null,
      status, reason, derivedAbsence, actions: [...actions.values()], sources: [...new Set(values.map(row => row.source))],
      hasAttendance, absenceRecorded: states.has('absent'),
    };
  }).sort((a,b) => a.name.localeCompare(b.name,'es',{sensitivity:'base'}) || a.id-b.id);
}

export function summarizeStaff(people: StaffEmployee[]) {
  const count = (status: StaffStatus) => people.filter(person => person.status === status).length;
  const present = people.filter(person => person.biometricEntry).length; const absent = count('absent');
  const provisionalAbsent = people.filter(person => person.status === 'absent' && person.provisionalAbsence).length; const pending = count('pending'); const conflict = count('conflict');
  return {
    total: people.length, present, absent, provisionalAbsent,
    biometricMarked: people.filter(person => person.biometricMarked).length,
    biometricEntry: people.filter(person => person.biometricEntry).length,
    biometricReview: people.filter(person => person.biometricReview).length,
    biometricWithoutPayment: people.filter(person => person.biometricMarked && !person.hasPositivePayment).length,
    checkedPeople: people.filter(person => person.hasCheck).length,
    derivedAbsent: people.filter(person => person.status === 'absent' && person.derivedAbsence).length,
    confirmedAbsent: people.filter(person => person.status === 'absent' && person.absenceRecorded).length, excused: count('excused'), off: count('off'), noProduction: count('noProduction'), pending, conflict,
    production: people.filter(person => person.kind === 'production').length,
    machine: people.filter(person => person.kind === 'machine').length,
    supervisor: people.filter(person => person.kind === 'supervisor').length,
    auxiliary: people.filter(person => person.kind === 'auxiliary').length,
    unknown: people.filter(person => person.kind === 'unknown').length,
    wildcard: people.filter(person => person.wildcard).length,
    // La tasa sigue los estados del reporte A/X. Sin estado definitivo no se publica una tasa.
    absenceRate: pending === 0 && conflict === 0 && !people.some(person => person.status === 'present' && !person.biometricEntry) && present + absent > 0 ? absent / (present + absent) * 100 : null,
  };
}
export function staffAreaRows(people: StaffEmployee[]) {
  const main = [...[1, 2, 3, 4].map(number => `Pelado · Sala ${number}`), 'Descabezado', 'Clasificado'];
  const other = [...new Set(people.map(person => person.area))].filter(area => !main.includes(area)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return [...main, ...other].map(area => {
    const rows = people.filter(person => person.area === area);
    return { area, ...summarizeStaff(rows),
      presentMachine: rows.filter(person => person.stbAttendance && person.kind === 'machine').length,
      presentSupervisor: rows.filter(person => person.stbAttendance && person.kind === 'supervisor').length,
      presentProduction: rows.filter(person => person.stbAttendance && person.kind === 'production').length,
      presentAuxiliary: rows.filter(person => person.stbAttendance && person.kind === 'auxiliary').length,
      presentUnknown: rows.filter(person => person.stbAttendance && person.kind === 'unknown').length,
    };
  });
}
export function buildStaffHistory(rows: PayrollStaffRow[], from: string, to: string, now?: Date) {
  const byDay = new Map<string, PayrollStaffRow[]>();
  for (const row of rows) {
    if (row.day < from || row.day > to) continue;
    const values = byDay.get(row.day) ?? []; values.push(row); byDay.set(row.day, values);
  }
  const days = [];
  for (let date = new Date(`${from}T12:00:00Z`); date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    const base = buildStaffEmployees(byDay.get(day) ?? [], day, now);
    const people = base;
    const by = (kind: StaffKind, status: StaffStatus) => people.filter(person => person.kind === kind && (status === 'present' ? person.stbAttendance : person.status === status)).length;
    // Clasificación por puesto del padrón; asistencia por pesa o chequeo.
    const absenceDataAvailable = true;
    const summary = summarizeStaff(people);
    days.push({ day, ...summary, shifts: ['A', 'B', 'Sin turno registrado'].map(shift => ({ shift, ...summarizeStaff(people.filter(person => person.shift === shift)) })), absenceDataAvailable, absenceRate: absenceDataAvailable ? summary.absenceRate : null,
      presentMachine: by('machine', 'present'), absentMachine: by('machine', 'absent'),
      presentSupervisor: by('supervisor', 'present'), absentSupervisor: by('supervisor', 'absent'),
      presentProduction: by('production', 'present'), absentProduction: by('production', 'absent'),
      presentAuxiliary: by('auxiliary', 'present'), absentAuxiliary: by('auxiliary', 'absent') });
  }
  return days;
}
