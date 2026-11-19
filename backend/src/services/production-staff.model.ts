export type StaffStatus = 'present' | 'absent' | 'excused' | 'off' | 'noProduction' | 'pending' | 'conflict';
export type StaffKind = 'production' | 'auxiliary' | 'unknown';
export type PayrollSource = 'calendar' | 'action' | 'clock' | 'attendance' | 'report';
export interface PayrollStaffRow {
  day: string; id: number; code: string; name: string; department: string; division: string;
  job: string; shift: string; source: PayrollSource; actionCode: string; action: string;
  reportMark?: 'A' | 'X' | null; firstPunch?: string; lastPunch?: string;
  collector: number; noProduction: boolean; entry: string; exit: string; hours: string;
}
export interface StaffEmployee {
  id: number; code: string; name: string; department: string; division: string; job: string; shift: string;
  kind: StaffKind; wildcard: boolean; status: StaffStatus; reason: string;
  area: string; areaBasis: string; areaDay: string | null; areaTime: string | null;
  activity: string; activityBasis: string; otherActivities: string[];
  /** Renglón de la lista de departamentos de planta (ver production-staff-department.ts). */
  plantDepartment: string; plantDepartmentBasis: string;
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
  if (/AUX|APOYO|COMODIN|SUPERVISOR|COORD|CONTROL|GUARDIA|CONTABIL|FACTURACION|GERENTE|MOTORISTA|FONTANERO|MONTACARGAS|COMPRESORES|HIELO|REPARACION|COCINA|PESADORA|LIMPIEZA/.test(text)) return 'auxiliary';
  if (/\bOBRA\b|DESTAJO|DECORACION|REEMPAQUE|MAQUINISTA|OPERARIO/.test(text)) return 'production';
  return 'unknown';
}
export function payrollTime(value: string): string | null {
  const clean = value.trim();
  const match = clean.match(/^(\d{2}):?(\d{2})(?::?(\d{2}))?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}
function workingHours(value: string): boolean {
  return /^\d{2}:?\d{2}(?::?\d{2})?$/.test(value.trim()) && Number(value.replace(/:/g, '')) > 0;
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

/** N/A nunca prueba presencia ni ausencia. Una persona solo tiene un estado por fecha. */
export function buildStaffEmployees(rows: PayrollStaffRow[], day: string): StaffEmployee[] {
  const grouped = new Map<number, PayrollStaffRow[]>();
  for (const row of rows) {
    if (row.day !== day || !Number.isInteger(row.id) || row.id <= 0) continue;
    const values = grouped.get(row.id) ?? []; values.push(row); grouped.set(row.id, values);
  }
  return [...grouped].map(([id, values]): StaffEmployee => {
    const reference = values.find(row => row.source === 'calendar') ?? values[0];
    const actions = new Map<string, { code: string; label: string }>();
    const states = new Set<StaffStatus>();
    const entries: string[] = []; const exits: string[] = [];
    let hasAttendance = false;
    let unknownAction = false;
    for (const row of values) {
      const state = actionStatus(row.actionCode, row.action);
      if (state === 'present') hasAttendance = true;
      else if (state) states.add(state);
      const code = row.actionCode.trim(); const label = row.action.trim();
      if (label || (code && !/^N\/?A$/i.test(code))) {
        const key = normalize(label || code);
        if (!actions.has(key) || code) actions.set(key, { code, label: label || code });
        if (!state) unknownAction = true;
      }
      if (row.noProduction) states.add('noProduction');
      const entry = payrollTime(row.entry); const exit = payrollTime(row.exit);
      const present = (row.source === 'report' && row.reportMark === 'A') || (row.source === 'attendance' && entry !== null)
        || (row.source === 'clock' && entry !== null && (workingHours(row.hours) || (exit !== null && exit !== entry)))
        || (row.source === 'calendar' && row.collector > 0 && !row.noProduction);
      if (present) {
        hasAttendance = true;
        if (entry) entries.push(entry);
        if (exit) exits.push(exit);
      }
    }
    let absenceRecorded = states.has('absent');
    let status: StaffStatus = 'pending';
    // Las novedades contradictorias o la combinación asistencia/falta se revisan, no se resuelven por prioridad arbitraria.
    if (states.size > 1 || (hasAttendance && states.size > 0) || unknownAction) status = 'conflict';
    else if (hasAttendance) status = 'present';
    else if (states.size === 1) status = [...states][0];
    const reportRows = values.filter(row => row.source === 'report');
    const marks = new Set(reportRows.map(row => row.reportMark).filter((mark): mark is 'A' | 'X' => mark === 'A' || mark === 'X'));
    const reportMark = marks.size === 1 ? [...marks][0] : null;
    if (reportRows.length) {
      status = marks.size > 1 ? 'conflict' : reportMark === 'A' ? 'present' : reportMark === 'X' ? 'absent' : 'pending';
      hasAttendance = status === 'present';
      absenceRecorded = status === 'absent';
    }
    const reason = reportRows.length && status === 'present' ? 'A verde: asistencia según la jornada del reporte.'
      : reportRows.length && status === 'absent' ? 'X roja: inasistencia según la jornada del reporte.'
      : reportRows.length && status === 'pending' ? 'La jornada del reporte todavía no ha iniciado.'
      : status === 'conflict' ? 'Hay novedades no clasificadas o registros que requieren revisión.'
      : status === 'pending' ? 'El calendario no tiene asistencia ni una falta explícita para esta fecha.'
      : status === 'present' ? 'Asistencia registrada en STBPayroll.' : [...actions.values()].map(action => action.label).join(' · ') || STATUS_LABELS[status];
    const entry = reportRows.length ? reportMark === 'A' ? reportRows.map(row => payrollTime(row.entry)).filter((value): value is string => !!value).sort()[0] ?? null : null : entries.sort()[0] ?? null;
    const exit = reportRows.length ? reportMark === 'A' ? reportRows.map(row => payrollTime(row.exit)).filter((value): value is string => !!value).sort().slice(-1)[0] ?? null : null : exits.sort().slice(-1)[0] ?? null;
    return {
      id, code: reference.code || String(id), name: reference.name || `Empleado ${id}`,
      department: reference.department || 'Sin departamento', division: reference.division || 'Sin división',
      job: reference.job || 'Sin puesto registrado', shift: reference.shift || 'Sin turno registrado',
      kind: staffKind(reference.job), wildcard: /COMODIN/.test(normalize(reference.job)),
      area: 'Sin sala/área asignada', areaBasis: 'Sin asignación verificada', areaDay: null, areaTime: null,
      activity: 'Sin actividad registrada', activityBasis: 'Sin actividad ni proceso registrado para el día', otherActivities: [],
      plantDepartment: 'Sin departamento asignado', plantDepartmentBasis: 'Sin ubicación de STB',
      reportMark, firstPunch: values.map(row => row.firstPunch).filter((value): value is string => !!value).sort()[0] ?? null,
      lastPunch: values.map(row => row.lastPunch).filter((value): value is string => !!value).sort().slice(-1)[0] ?? null,
      status, reason, actions: [...actions.values()], entry, exit, sources: [...new Set(values.map(row => row.source))], hasAttendance, absenceRecorded,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id - b.id);
}

export function summarizeStaff(people: StaffEmployee[]) {
  const count = (status: StaffStatus) => people.filter(person => person.status === status).length;
  const present = count('present'); const absent = count('absent'); const pending = count('pending'); const conflict = count('conflict');
  return {
    total: people.length, present, absent, excused: count('excused'), off: count('off'), noProduction: count('noProduction'), pending, conflict,
    production: people.filter(person => person.kind === 'production').length,
    auxiliary: people.filter(person => person.kind === 'auxiliary').length,
    unknown: people.filter(person => person.kind === 'unknown').length,
    wildcard: people.filter(person => person.wildcard).length,
    // La tasa sigue los estados del reporte A/X. Sin estado definitivo no se publica una tasa.
    absenceRate: pending === 0 && conflict === 0 && present + absent > 0 ? absent / (present + absent) * 100 : null,
  };
}
export function staffAreaRows(people: StaffEmployee[]) {
  const main = [...[1, 2, 3, 4].map(number => `Pelado · Sala ${number}`), 'Descabezado', 'Clasificado'];
  const other = [...new Set(people.map(person => person.area))].filter(area => !main.includes(area)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return [...main, ...other].map(area => {
    const rows = people.filter(person => person.area === area);
    return { area, ...summarizeStaff(rows),
      presentProduction: rows.filter(person => person.status === 'present' && person.kind === 'production').length,
      presentAuxiliary: rows.filter(person => person.status === 'present' && person.kind === 'auxiliary').length,
      presentUnknown: rows.filter(person => person.status === 'present' && person.kind === 'unknown').length,
    };
  });
}
export function buildStaffHistory(rows: PayrollStaffRow[], from: string, to: string) {
  const byDay = new Map<string, PayrollStaffRow[]>();
  for (const row of rows) {
    if (row.day < from || row.day > to) continue;
    const values = byDay.get(row.day) ?? []; values.push(row); byDay.set(row.day, values);
  }
  const days = [];
  for (let date = new Date(`${from}T12:00:00Z`); date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    const people = buildStaffEmployees(byDay.get(day) ?? [], day);
    const by = (kind: StaffKind, status: StaffStatus) => people.filter(person => person.kind === kind && person.status === status).length;
    // Desglose obra/auxiliar para la vista semanal; el tipo sale del puesto de Payroll, sin depender de la sala.
    days.push({ day, ...summarizeStaff(people),
      presentProduction: by('production', 'present'), absentProduction: by('production', 'absent'),
      presentAuxiliary: by('auxiliary', 'present'), absentAuxiliary: by('auxiliary', 'absent') });
  }
  return days;
}
