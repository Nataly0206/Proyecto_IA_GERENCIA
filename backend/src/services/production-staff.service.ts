import { env } from '../config/env';
import { withTtlCache } from '../utils/ttlCache';
import { getStaffLocations } from './production-staff-location.service';
import { attachStaffLocations } from './production-staff-location.model';
import sql from 'mssql';
import { runPayrollQuery } from './payroll.service';
import type { SqlRow } from './sql.service';
import { pickNumber, pickString } from '../utils/rows';
import { ApiError } from '../middleware/errorHandler';
import { PAYROLL_STAFF_QUERY, PAYROLL_ATTENDANCE_COVERAGE_QUERY } from './production-staff.queries';
import { PayrollStaffRow, PayrollSource, buildStaffEmployees, buildStaffHistory, summarizeStaff, staffAreaRows } from './production-staff.model';

export function staffToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function validStaffDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > today) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const reportCutoffMinutes = () => { const [hour, minute] = env.PAYROLL_ATTENDANCE_DAY_START.split(':').map(Number); return hour * 60 + minute; };
const params = (from: string, to: string) => [
  { name: 'Desde', type: sql.Date, value: from }, { name: 'Hasta', type: sql.Date, value: to },
  { name: 'CorteMinutos', type: sql.Int, value: reportCutoffMinutes() },
  { name: 'HastaMarca', type: sql.DateTime, value: null },
];
export function mapPayrollStaffRow(row: SqlRow): PayrollStaffRow {
  return {
    day: pickString(row, 'Dia'), id: pickNumber(row, 'IdEmpleado'), code: pickString(row, 'CodigoEmpleado'),
    name: pickString(row, 'Nombre'), department: pickString(row, 'Departamento'), division: pickString(row, 'Division'),
    job: pickString(row, 'Puesto'), shift: pickString(row, 'Turno'), source: pickString(row, 'Fuente') as PayrollSource,
    reportMark: ['A', 'X'].includes(pickString(row, 'MarcaReporte')) ? pickString(row, 'MarcaReporte') as 'A' | 'X' : null,
    firstPunch: pickString(row, 'PrimeraMarca'), lastPunch: pickString(row, 'UltimaMarca'),
    actionCode: pickString(row, 'CodigoAccion'), action: pickString(row, 'Accion'),
    collector: pickNumber(row, 'Colector'), noProduction: pickNumber(row, 'FaltaProducto') > 0,
    entry: pickString(row, 'Entrada'), exit: pickString(row, 'Salida'), hours: pickString(row, 'Horas'),
  };
}
async function loadPayroll(from: string, to: string) {
  try {
    const [records, coverage] = await Promise.all([
      runPayrollQuery(PAYROLL_STAFF_QUERY, params(from, to)),
      runPayrollQuery(PAYROLL_ATTENDANCE_COVERAGE_QUERY, params(from, to)),
    ]);
    const lastAttendance = coverage.map(row => pickString(row, 'UltimaFecha')).filter(Boolean).sort().slice(-1)[0] ?? null;
    return { rows: records.map(mapPayrollStaffRow), lastAttendance };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[personal-payroll] No se pudo consultar STBPayroll:', error instanceof Error ? error.message : 'Error de conexión');
    throw new ApiError(503, 'No se pudo consultar la asistencia de STBPayroll. Intenta actualizar.');
  }
}
const limitations = [
  'Se consulta la lista completa de la planilla OBRA configurada en Payroll: A verde es asistencia y X roja es inasistencia.',
  'El estado A/X se calcula por jornada con las marcaciones de la fuente biométrica vinculada a Payroll. No se sustituye por libras, activaciones ni novedades de pago.',
  'El corte de jornada es configurable y está pendiente de confirmación contra la regla completa del reporte de planillas.',
  'Sala y área se cruzan por empleado con asignaciones y actividades de producción sin agregar asistentes ni duplicar personas.',
  'En fechas anteriores se usa la última referencia de sala fechada disponible, con un máximo de 30 días de antigüedad.',
  'La X indica falta en el reporte, sin determinar por sí sola si existe una justificación. El día en curso cambia con nuevas marcaciones.',
];
const reportInfo = () => ({ name: 'Reporte de inasistencia empleados obra', dayStart: env.PAYROLL_ATTENDANCE_DAY_START, cutoffVerified: env.PAYROLL_ATTENDANCE_DAY_START_CONFIRMED });
function warningsFor(pending: number, conflict: number) {
  const warnings: string[] = [];
  if (pending) warnings.push(`${pending} registros pendientes porque la jornada no ha iniciado o no hay un estado A/X válido.`);
  if (conflict) warnings.push(`${conflict} personas tienen estados A/X contradictorios; requieren revisión.`);
  return warnings;
}
export async function getProductionStaff(day: string, forceRefresh = false) {
  const { rows, lastAttendance } = await loadPayroll(day, day);
  const payrollEmployees = buildStaffEmployees(rows, day);
  const locationWarnings: string[] = [];
  let locationAvailable = true;
  let employees = payrollEmployees;
  try {
    const locations = await getStaffLocations(payrollEmployees.map(person => person.id), day, staffToday(), forceRefresh);
    const enriched = attachStaffLocations(payrollEmployees, locations, day, staffToday());
    employees = enriched.employees;
    if (enriched.unverified) locationWarnings.push(`${enriched.unverified} personas sin coincidencia verificable con la asignación. Se conservan en el conteo de Payroll, sin asignarlas automáticamente a una sala.`);
  } catch (error) {
    locationAvailable = false;
    locationWarnings.push('No se pudieron consultar las asignaciones por sala. Las asistencias y faltas de Payroll se conservan; las ubicaciones quedan sin asignar.');
    console.error('[personal-payroll] Asignaciones no disponibles:', error instanceof Error ? error.message : 'Error de conexión');
  }
  const summary = summarizeStaff(employees);
  return { source: 'STBPayroll' as const, report: reportInfo(), day, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    locationSource: 'STB_data' as const, locationAvailable,
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
  const cacheScope = JSON.stringify([env.PAYROLL_DB_SERVER, env.PAYROLL_DB_DATABASE,
    env.PAYROLL_ATTENDANCE_LINKED_SERVER, env.PAYROLL_ATTENDANCE_DATABASE, env.PAYROLL_ATTENDANCE_DAY_START]);
  const loadPeriod = async (start: string, end: string) => {
    const { rows, lastAttendance } = await loadPayroll(start, end);
    return { days: buildStaffHistory(rows, start, end), lastAttendance };
  };
  const [closed, current] = await Promise.all([
    withTtlCache(`personal:history-closed:v1:${cacheScope}:${from}:${closedTo}`, 60 * 60_000,
      () => loadPeriod(from, closedTo), forceRefresh),
    to === today
      ? withTtlCache(`personal:history-today:v1:${cacheScope}:${today}`, 60_000,
        () => loadPeriod(today, today), forceRefresh)
      : Promise.resolve({ days: [], lastAttendance: null }),
  ]);
  const days = [...closed.days, ...current.days];
  const lastAttendance = [closed.lastAttendance, current.lastAttendance].filter((day): day is string => !!day).sort().slice(-1)[0] ?? null;
  return { source: 'STBPayroll' as const, report: reportInfo(), from, to, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    warnings: days.some(day => day.pending > 0 || day.conflict > 0)
      ? ['Hay registros sin estado A/X definitivo. Los días en curso pueden cambiar con nuevas marcaciones.'] : [],
    days, limitations };
}
