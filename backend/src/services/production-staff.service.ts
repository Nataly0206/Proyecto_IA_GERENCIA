import { env } from '../config/env';
import { withTtlCache } from '../utils/ttlCache';
import { getStaffLocations } from './production-staff-location.service';
import { attachStaffLocations } from './production-staff-location.model';
import sql from 'mssql';
import { runPayrollQuery } from './payroll.service';
import { runStbQuery } from './stb.service';
import type { SqlRow } from './sql.service';
import { pickNumber, pickString } from '../utils/rows';
import { ApiError } from '../middleware/errorHandler';
import { STB_GROUP_PAYMENT_STAFF_QUERY, STB_GROUP_PAYMENT_COVERAGE_QUERY, PAYMENT_CONCEPT_CATALOG_QUERY, PAYROLL_STAFF_COMPLEMENT_QUERY, STAFF_ATTENDANCE_REFERENCES_QUERY, PAYROLL_STAFF_MOVEMENTS_QUERY } from './production-staff.queries';
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
  { name: 'CorteMinutos', type: sql.Int, value: Number(env.PAYROLL_ATTENDANCE_DAY_START.slice(0, 2)) * 60 + Number(env.PAYROLL_ATTENDANCE_DAY_START.slice(3)) },
];
export function mapPayrollStaffRow(row: SqlRow): PayrollStaffRow {
  return {
    day: pickString(row, 'Dia'), id: pickNumber(row, 'IdEmpleado'), code: pickString(row, 'CodigoEmpleado'),
    name: pickString(row, 'Nombre'), department: pickString(row, 'Departamento'), division: pickString(row, 'Division'),
    job: pickString(row, 'Puesto'), shift: pickString(row, 'Turno'), source: pickString(row, 'Fuente') as PayrollSource,
    paymentConcept: pickString(row, 'ConceptoPago'),
    reportMark: ['A', 'X'].includes(pickString(row, 'MarcaReporte')) ? pickString(row, 'MarcaReporte') as 'A' | 'X' : null,
    firstPunch: pickString(row, 'PrimeraMarca'), lastPunch: pickString(row, 'UltimaMarca'),
    actionCode: pickString(row, 'CodigoAccion'), action: pickString(row, 'Accion'),
    collector: pickNumber(row, 'Colector'), noProduction: pickNumber(row, 'FaltaProducto') > 0,
    entry: pickString(row, 'Entrada'), exit: pickString(row, 'Salida'), hours: pickString(row, 'Horas'),
  };
}
async function loadGroupPayments(from: string, to: string) {
  try {
    const [records, coverage, catalog] = await Promise.all([
      runStbQuery(STB_GROUP_PAYMENT_STAFF_QUERY, params(from, to)),
      runStbQuery(STB_GROUP_PAYMENT_COVERAGE_QUERY, params(from, to)),
      withTtlCache(`personal:payment-concepts:v1:${env.PAYROLL_DB_SERVER}:${env.PAYROLL_DB_DATABASE}`, 60 * 60_000,
        () => runPayrollQuery(PAYMENT_CONCEPT_CATALOG_QUERY, [])),
    ]);
    const concepts = new Map(catalog.map(row => [pickNumber(row, 'IdConceptoPago'), pickString(row, 'ConceptoPago')]));
    const mapped = records.map(row => {
      const concept = concepts.get(pickNumber(row, 'IdConceptoPago'));
      if (!concept) throw new ApiError(503, 'No se pudo identificar un concepto del reporte de pagos grupales. Intenta actualizar.');
      return mapPayrollStaffRow({ ...row, ConceptoPago: concept });
    });
    const lastAttendance = coverage.map(row => pickString(row, 'UltimaFecha')).filter(Boolean).sort().slice(-1)[0] ?? null;
    return { rows: mapped, lastAttendance };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[personal-pagos] No se pudo consultar el reporte de STB_data:', error instanceof Error ? error.message : 'Error de conexión');
    throw new ApiError(503, 'No se pudo consultar el reporte de pagos grupales por concepto de STB_data. Intenta actualizar.');
  }
}
const limitations = [
  'STB_data aporta los pagos grupales del día; Payroll complementa la planilla OBRA y los supervisores con marcaciones, inasistencias explícitas, permisos, incapacidades, descansos y vacaciones.',
  'Se cruza por ID de empleado y fecha; los nombres se validan. Cada persona cuenta una sola vez. Si hay pago o marcación junto con una novedad incompatible, queda para revisión.',
  'Supervisores por puesto; obra y máquinas por concepto del día. Sin pago se usa el puesto de Payroll y lo no definido queda como auxiliar.',
  'No tener pago o marcación no confirma una falta. Sin evidencia queda pendiente; sin cierre de inasistencias no se publica tasa.',
  'La ubicación y la asistencia son datos distintos. Un concepto de Pelado general no asigna una sala concreta.',
];
const reportInfo = () => ({ name: 'Pagos grupales de STB_data + asistencia y novedades de Payroll', dayStart: env.PAYROLL_ATTENDANCE_DAY_START, cutoffVerified: env.PAYROLL_ATTENDANCE_DAY_START_CONFIRMED });
function warningsFor(pending: number, conflict: number) {
  const warnings: string[] = [];
  if (pending) warnings.push(`${pending} personas sin pago, marcación o novedad que confirme su estado del día.`);
  if (conflict) warnings.push(`${conflict} personas tienen datos contradictorios entre fuentes; requieren revisión.`);
  return warnings;
}
/** Contexto de Payroll, separado de la población y clasificación del reporte de pagos. */
async function loadAttendanceReferences(day: string, forceRefresh: boolean) {
  try {
    const rows = await withTtlCache(`personal:references:v1:${env.PAYROLL_DB_SERVER}:${env.PAYROLL_DB_DATABASE}:${day}`, 60_000,
      () => runPayrollQuery(STAFF_ATTENDANCE_REFERENCES_QUERY, params(day, day)), forceRefresh);
    const row = rows[0];
    if (!row || row.SupervisoresActivos === undefined) return null;
    const absenceDay = pickString(row, 'UltimaFechaInasistencias');
    return { source: 'STBPayroll' as const, activeSupervisors: pickNumber(row, 'SupervisoresActivos'),
      latestAbsences: absenceDay ? { day: absenceDay, count: pickNumber(row, 'Inasistencias'), report: 'RH_V_EMPLEADOS_PRODUCCION_INASISTENCIA · 013 INASISTENCIA' } : null };
  } catch { return null; }
}
async function loadStaffData(from: string, to: string, forceRefresh = false) {
  const [payments, complements, references] = await Promise.all([
    loadGroupPayments(from, to),
    runPayrollQuery(PAYROLL_STAFF_COMPLEMENT_QUERY, params(from, to)).catch(() => { throw new ApiError(503, 'No se pudo consultar el complemento de asistencia de Payroll. Intenta actualizar.'); }),
    loadAttendanceReferences(to, forceRefresh),
  ]);
  const payrollRows = complements.map(mapPayrollStaffRow).filter(row => row.id > 0 && row.day >= from && row.day <= to);
  const paymentIds = new Set(payments.rows.map(row => row.id));
  const payrollIds = new Set(payrollRows.map(row => row.id));
  const overlap = [...paymentIds].filter(id => payrollIds.has(id)).length;
  return { rows: [...payments.rows, ...payrollRows], lastAttendance: payments.lastAttendance, references,
    reconciliation: { paymentPeople: paymentIds.size, payrollPeople: payrollIds.size, matchedPeople: overlap,
      onlyPaymentPeople: paymentIds.size - overlap, onlyPayrollPeople: payrollIds.size - overlap } };
}
export async function getProductionStaff(day: string, forceRefresh = false) {
  const { rows, lastAttendance, references: attendanceReferences, reconciliation } = await loadStaffData(day, day, forceRefresh);
  const payrollEmployees = buildStaffEmployees(rows, day);
  const locationWarnings: string[] = [];
  let locationAvailable = true;
  let employees = payrollEmployees;
  try {
    const locations = await getStaffLocations(payrollEmployees.map(person => person.id), day, staffToday(), forceRefresh);
    const enriched = attachStaffLocations(payrollEmployees, locations, day, staffToday());
    employees = enriched.employees;
  } catch (error) {
    locationAvailable = false;
    locationWarnings.push('No se pudieron consultar las asignaciones por sala. Las personas del reporte de pagos se conservan; las ubicaciones quedan sin asignar.');
    console.error('[personal-payroll] Asignaciones no disponibles:', error instanceof Error ? error.message : 'Error de conexión');
  }
  const absenceDataAvailable = attendanceReferences?.latestAbsences?.day === day || employees.some(person => person.absenceRecorded);
  const summary = { ...summarizeStaff(employees), absenceRate: absenceDataAvailable ? summarizeStaff(employees).absenceRate : null };
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), day, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    locationSource: 'STB_data' as const, locationAvailable, attendanceReferences, reconciliation, absenceDataAvailable,
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
  const cacheScope = JSON.stringify([env.STB_DB_SERVER, env.STB_DB_DATABASE, env.PAYROLL_DB_SERVER, env.PAYROLL_DB_DATABASE]);
  const loadPeriod = async (start: string, end: string) => {
    const { rows, lastAttendance } = await loadStaffData(start, end, forceRefresh);
    return { days: buildStaffHistory(rows, start, end), lastAttendance };
  };
  const [closed, current] = await Promise.all([
    withTtlCache(`personal:history-closed:v8:${cacheScope}:${from}:${closedTo}`, 60 * 60_000,
      () => loadPeriod(from, closedTo), forceRefresh),
    to === today
      ? withTtlCache(`personal:history-today:v8:${cacheScope}:${today}`, 60_000,
        () => loadPeriod(today, today), forceRefresh)
      : Promise.resolve({ days: [], lastAttendance: null }),
  ]);
  const days = [...closed.days, ...current.days];
  const lastAttendance = [closed.lastAttendance, current.lastAttendance].filter((day): day is string => !!day).sort().slice(-1)[0] ?? null;
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), from, to, today: staffToday(), updatedAt: new Date().toISOString(), lastAttendance,
    warnings: days.some(day => day.pending > 0 || day.conflict > 0)
      ? ['Hay registros sin estado A/X definitivo. Los días en curso pueden cambiar con nuevos conceptos de pagos.'] : [],
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
  const cacheScope = JSON.stringify([env.STB_DB_SERVER, env.STB_DB_DATABASE, env.PAYROLL_DB_SERVER, env.PAYROLL_DB_DATABASE]);
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
    return { days: buildStaffHistory(rows, start, end).map(day => ({ ...day, ...(movements.get(day.day) ?? empty) })), lastAttendance };
  };
  const results = await Promise.all(chunks.map(([start, end]) => withTtlCache(
    `personal:range:v6:${cacheScope}:${start}:${end}`,
    end < today ? 6 * 60 * 60_000 : 60_000,
    () => load(start, end), forceRefresh)));
  const days = results.flatMap(result => result.days);
  const lastAttendance = results.map(result => result.lastAttendance).filter((day): day is string => !!day).sort().slice(-1)[0] ?? null;
  return { source: 'STB_data + STBPayroll' as const, report: reportInfo(), from, to, today, updatedAt: new Date().toISOString(), lastAttendance,
    warnings: days.some(day => day.pending > 0 || day.conflict > 0)
      ? ['Hay registros sin estado A/X definitivo. Los días en curso pueden cambiar con nuevos conceptos de pagos.'] : [],
    days, limitations: [...limitations,
      'El total diario incluye personas únicas al complementar pagos, planilla, marcaciones y novedades de la misma fecha.',
      'Ingresos y retiros salen de RH_EMPLEADOS. Si una persona fue recontratada, Payroll conserva solo su último ingreso, así que su periodo anterior no se cuenta.'] };
}
