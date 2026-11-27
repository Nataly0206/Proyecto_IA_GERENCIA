import { env } from '../config/env';
import { STAFF_TIME_ZONE } from './production-staff-absence';
import { attachProductionStaffShifts, productionLineShift, StaffShiftReference } from './production-staff-shift';
import { withTtlCache } from '../utils/ttlCache';
import { staffNamesQuery } from './production-staff-location.service';
import { getStaffLocations } from './production-staff-location.service';
import { attachStaffLocations } from './production-staff-location.model';
import sql from 'mssql';
import { runPayrollQuery } from './payroll.service';
import { runStbQuery } from './stb.service';
import type { SqlRow } from './sql.service';
import { pickNumber, pickString } from '../utils/rows';
import { ApiError } from '../middleware/errorHandler';
import { STB_FIRST_WEIGHING_QUERY, STB_ACTIVITY_ATTENDANCE_QUERY, PAYROLL_STAFF_COMPLEMENT_QUERY, PAYROLL_STAFF_MOVEMENTS_QUERY, STB_STAFF_SHIFT_HISTORY_QUERY, PAYROLL_BIOMETRIC_ATTENDANCE_QUERY, PAYROLL_POSITIVE_PAYMENT_QUERY } from './production-staff.queries';
import { PayrollStaffRow, PayrollSource, buildStaffEmployees, buildStaffHistory, staffKind, summarizeStaff, staffAreaRows } from './production-staff.model';

export function staffToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function validStaffDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > today) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const params = (from: string, to: string) => [
  { name: 'Desde', type: sql.Date, value: from }, { name: 'Hasta', type: sql.Date, value: to },
  { name: 'HoraCorte', type: sql.VarChar(8), value: to === staffToday() ? new Intl.DateTimeFormat('en-GB', {timeZone: STAFF_TIME_ZONE, hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(new Date()) : '23:59:59' },
];
export function mapPayrollStaffRow(row: SqlRow): PayrollStaffRow {
  return {
    day: pickString(row, 'Dia'), id: pickNumber(row, 'IdEmpleado'), code: pickString(row, 'CodigoEmpleado'),
    name: pickString(row, 'Nombre'), department: pickString(row, 'Departamento'), division: pickString(row, 'Division'),
    job: pickString(row, 'Puesto'), shift: pickString(row, 'Turno'), source: pickString(row, 'Fuente') as PayrollSource,
    line: pickString(row, 'Linea'), process: pickString(row, 'Proceso'), activity: pickString(row, 'Actividad'),
    reportMark: ['A', 'X'].includes(pickString(row, 'MarcaReporte')) ? pickString(row, 'MarcaReporte') as 'A' | 'X' : null,

    firstPunch: pickString(row, 'PrimeraMarca'), lastPunch: pickString(row, 'UltimaMarca'), punchCount: pickNumber(row, 'CantidadMarcas'),
    actionCode: pickString(row, 'CodigoAccion'), action: pickString(row, 'Accion'),
    collector: pickNumber(row, 'Colector'), noProduction: pickNumber(row, 'FaltaProducto') > 0,
    entry: pickString(row, 'Entrada'), exit: pickString(row, 'Salida'), hours: pickString(row, 'Horas'),
  };
}
const limitations = [
  'Solo personal temporal (TIPO_CONTRATO=T) de planilla OBRA; una persona por fecha.',
  'Con marca biométrica cuenta cualquier marca del día calendario; con entrada distingue CHECKTYPE=I. Las marcas sin entrada se muestran para revisión del turno nocturno.',
  'Asistieron y sus desgloses cuentan exclusivamente personas con entrada biométrica I. Pesas y chequeos conservan su evidencia operativa y recorrido; no se suman a la asistencia confirmada. Los pagos positivos solo concilian.',
  'Sin evidencia queda pendiente; solo las faltas explícitas de Payroll cuentan como faltas. No se anticipa inasistencia del turno nocturno.',
  'El recorrido conserva cada chequeo del día por actividad, proceso, línea, hora inicial y final. La última ubicación registrada no implica permanencia actual.',
  'Las asignaciones e historial de sala son referencias; no equivalen a un chequeo del día.',
];
const reportInfo = () => ({ name: 'Biométrico y recorrido de chequeos', dayStart: '00:00', cutoffVerified: false });
function warningsFor(pending: number, conflict: number) {
  const warnings: string[] = [];
  if (pending) warnings.push(`${pending} personas sin chequeo, pesa o novedad que confirme su estado del día.`);
  if (conflict) warnings.push(`${conflict} personas tienen evidencias o novedades contradictorias; requieren revisión.`);
  return warnings;
}
async function loadStaffData(from: string, to: string, forceRefresh = false) {
  const [complements, weighings, checks, shiftHistory, names, biometrics, payments] = await Promise.all([
    runPayrollQuery(PAYROLL_STAFF_COMPLEMENT_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo consultar el padrón temporal y las novedades de Payroll.'); }),
    runStbQuery(STB_FIRST_WEIGHING_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudieron consultar las primeras pesas del personal.'); }),
    runStbQuery(STB_ACTIVITY_ATTENDANCE_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo consultar el chequeo manual por actividad.'); }),
    runStbQuery(STB_STAFF_SHIFT_HISTORY_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo consultar la referencia de turnos.'); }),
    runStbQuery(staffNamesQuery, [{ name: 'Hasta', type: sql.Date, value: to }]).catch(() => { throw new ApiError(503, 'No se pudo verificar la identidad para los turnos.'); }),
    runPayrollQuery(PAYROLL_BIOMETRIC_ATTENDANCE_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo consultar el biométrico.'); }),
    runPayrollQuery(PAYROLL_POSITIVE_PAYMENT_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo conciliar el pesado positivo.'); }),
  ]);
  const namesById = new Map(names.map(row => [pickNumber(row, 'IdEmpleado'), pickString(row, 'Nombre')]));
  const historicalChecks = shiftHistory.map(row => ({ id: pickNumber(row, 'IdEmpleado'), day: pickString(row, 'Dia'), entry: pickString(row, 'Entrada'), line: pickString(row, 'Linea'), order: pickNumber(row, 'Orden') }))
    .filter(row => productionLineShift(row.line)).sort((a, b) => b.day.localeCompare(a.day) || b.entry.localeCompare(a.entry) || b.order - a.order);
  const payrollRows = complements.map(mapPayrollStaffRow).filter(row => row.id > 0 && row.day >= from && row.day <= to);
  const rosterDays = new Set(payrollRows.map(row => `${row.id}:${row.day}`));
  const evidence = [...weighings, ...checks, ...biometrics, ...payments].map(mapPayrollStaffRow).filter(row => rosterDays.has(`${row.id}:${row.day}`));
  const byDay = new Map<string, PayrollStaffRow[]>();
  for (const row of [...payrollRows, ...evidence]) {
    const group = byDay.get(row.day) ?? []; group.push(row); byDay.set(row.day, group);
  }
  const latestChecks = new Map<string, PayrollStaffRow>();
  for (const check of evidence) if (check.line) {
    const key = `${check.id}:${check.day}`, previous = latestChecks.get(key);
    if (!previous || check.entry > previous.entry) latestChecks.set(key, check);
  }
  // El turno se toma únicamente de la línea del chequeo; nunca de marcaciones biométricas.
  const rows = [...byDay].flatMap(([day, todayRows]) => {
    const references: StaffShiftReference[] = todayRows.filter(row => row.source === 'payroll').map(row => {
      const latest = latestChecks.get(`${row.id}:${day}`);
      const previous = historicalChecks.find(check => check.id === row.id && check.day < day && check.day >= addDays(day, -30));
      return {id: row.id, name: namesById.get(row.id) ?? '', active: true, currentLine: latest?.line ?? '', previousLine: previous?.line ?? '', previousLineDay: previous?.day ?? '', dayDeadline: null, nightDeadline: null, nightEnd: null};
    });
    return attachProductionStaffShifts(todayRows, day, references);
  });
  return { rows, lastAttendance: evidence.filter(row => row.source !== 'payment').map(row => row.day).sort().slice(-1)[0] ?? null };
}
export async function getProductionStaff(day: string, forceRefresh = false) {
  const { rows, lastAttendance } = await loadStaffData(day, day, forceRefresh);
  const baseEmployees = buildStaffEmployees(rows, day);
  const payrollEmployees = baseEmployees;
  const locationWarnings: string[] = [];
  let locationAvailable = true;
  let employees = payrollEmployees;
  try {
    const locations = await getStaffLocations(payrollEmployees.map(person => person.id), day, staffToday(), forceRefresh);
    const enriched = attachStaffLocations(payrollEmployees, locations, day, staffToday());
    employees = enriched.employees;
  } catch (error) {
    locationAvailable = false;
    locationWarnings.push('No se pudieron consultar las asignaciones por sala. Las personas del padrón se conservan; las ubicaciones quedan sin asignar.');
    console.error('[personal-payroll] Asignaciones no disponibles:', error instanceof Error ? error.message : 'Error de conexión');
  }
  const absenceDataAvailable = true;
  const absenceReconciliation = { recorded: employees.filter(person => person.absenceRecorded).length,
    conflicts: employees.filter(person => person.absenceRecorded && person.status === 'conflict').length,
    actionReference: null };
  const summary = { ...summarizeStaff(employees), absenceRate: absenceDataAvailable ? summarizeStaff(employees).absenceRate : null };
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), day, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    locationSource: 'STB_data' as const, locationAvailable, absenceReconciliation, absenceDataAvailable,
    absenceCutoff: { mode: 'biometric-checks' as const, timeZone: STAFF_TIME_ZONE, active: true },
    warnings: [...warningsFor(summary.pending, summary.conflict), ...locationWarnings], summary,
    areas: staffAreaRows(employees), employees, limitations };
}
export async function getProductionStaffHistory(to: string, forceRefresh = false) {
  const fromDate = new Date(`${to}T12:00:00Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  const from = fromDate.toISOString().slice(0, 10);
  // Hoy cambia continuamente; el bloque anterior se reutiliza sin consultar de nuevo todo el mes.
  // También se conserva hasta una hora el histórico para permitir correcciones de planillas.
  const today = staffToday();
  const previousDate = new Date(`${today}T12:00:00Z`); previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const closedTo = to < today ? to : previousDate.toISOString().slice(0, 10);
  const cacheScope = JSON.stringify([env.STB_DB_SERVER, env.STB_DB_DATABASE, env.PAYROLL_DB_SERVER, env.PAYROLL_DB_DATABASE, today]);
  const loadPeriod = async (start: string, end: string) => {
    const { rows, lastAttendance } = await loadStaffData(start, end, forceRefresh);
    return { days: buildStaffHistory(rows, start, end, new Date()), lastAttendance };
  };
  const [closed, current] = await Promise.all([
    withTtlCache(`personal:history-closed:v18:${cacheScope}:${from}:${closedTo}`, 60 * 60_000,
      () => loadPeriod(from, closedTo), forceRefresh),
    to === today
      ? withTtlCache(`personal:history-today:v18:${cacheScope}:${today}`, 60_000,
        () => loadPeriod(today, today), forceRefresh)
      : Promise.resolve({ days: [], lastAttendance: null }),
  ]);
  const days = [...closed.days, ...current.days];
  const lastAttendance = [closed.lastAttendance, current.lastAttendance].filter((day): day is string => !!day).sort().slice(-1)[0] ?? null;
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), from, to, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    warnings: days.some(day => day.pending > 0 || day.conflict > 0)
      ? ['Hay registros sin estado A/X definitivo. Los días en curso pueden cambiar con nuevos chequeos o pesas.'] : [],
    days, limitations };
}

const addDays = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
export const STAFF_RANGE_MAX_DAYS = 400;

/** Altas y bajas de planilla por día, separadas en obra y auxiliares por el puesto actual. */
async function loadMovements(from: string, to: string) {
  const rows = await runPayrollQuery(PAYROLL_STAFF_MOVEMENTS_QUERY, params(from, to));
  const byDay = new Map<string, { hires: number; exits: number; hiresProduction: number; hiresAuxiliary: number; exitsProduction: number; exitsAuxiliary: number }>();
  for (const row of rows) {
    const day = pickString(row, 'Dia');
    const value = byDay.get(day) ?? { hires: 0, exits: 0, hiresProduction: 0, hiresAuxiliary: 0, exitsProduction: 0, exitsAuxiliary: 0 };
    const kind = staffKind(pickString(row, 'Puesto'));
    if (pickString(row, 'Tipo') === 'ingreso') {
      value.hires += 1;
      if (kind === 'production') value.hiresProduction += 1; else if (kind === 'auxiliary') value.hiresAuxiliary += 1;
    } else {
      value.exits += 1;
      if (kind === 'production') value.exitsProduction += 1; else if (kind === 'auxiliary') value.exitsAuxiliary += 1;
    }
    byDay.set(day, value);
  }
  return byDay;
}

/**
 * Asistencia diaria y movimientos de planilla en un rango (vista Tendencia).
 * Se consulta por mes calendario: los meses cerrados se reutilizan varias horas
 * y solo el día en curso se refresca cada minuto.
 */
export async function getProductionStaffRange(from: string, to: string, forceRefresh = false) {
  const today = staffToday();
  const cacheScope = JSON.stringify([env.STB_DB_SERVER, env.STB_DB_DATABASE, env.PAYROLL_DB_SERVER, env.PAYROLL_DB_DATABASE, today]);
  const chunks: [string, string][] = [];
  for (let start = from; start <= to;) {
    const next = new Date(`${start.slice(0, 7)}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const end = [to, addDays(next.toISOString().slice(0, 10), -1)].sort()[0];
    if (start < today && end >= today) { chunks.push([start, addDays(today, -1)], [today, end]); }
    else chunks.push([start, end]);
    start = addDays(end, 1);
  }
  const load = async (start: string, end: string) => {
    const [{ rows, lastAttendance }, movements] = await Promise.all([loadStaffData(start, end, forceRefresh), loadMovements(start, end)]);
    const empty = { hires: 0, exits: 0, hiresProduction: 0, hiresAuxiliary: 0, exitsProduction: 0, exitsAuxiliary: 0 };
    return { days: buildStaffHistory(rows, start, end, new Date()).map(day => ({ ...day, ...(movements.get(day.day) ?? empty) })), lastAttendance };
  };
  const results = await Promise.all(chunks.map(([start, end]) => withTtlCache(
    `personal:range:v16:${cacheScope}:${start}:${end}`,
    end < today ? 6 * 60 * 60_000 : 60_000,
    () => load(start, end), forceRefresh)));
  const days = results.flatMap(result => result.days);
  const lastAttendance = results.map(result => result.lastAttendance).filter((day): day is string => !!day).sort().slice(-1)[0] ?? null;
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), from, to, today, updatedAt: new Date().toISOString(), lastAttendance,
    warnings: days.some(day => day.pending > 0 || day.conflict > 0)
      ? ['Hay registros sin estado A/X definitivo. Los días en curso pueden cambiar con nuevos chequeos o pesas.'] : [],
    days, limitations: [...limitations,
      'El total diario incluye personas únicas al cruzar el padrón, chequeos, pesas y novedades de la misma fecha.',
      'Ingresos y retiros salen de RH_EMPLEADOS. Si una persona fue recontratada, Payroll conserva solo su último ingreso, así que su periodo anterior no se cuenta.'] };
}
