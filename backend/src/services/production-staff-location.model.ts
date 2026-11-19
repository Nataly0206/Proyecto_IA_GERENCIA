import type { StaffEmployee } from './production-staff.model';
import { departmentFromLine, departmentFromPayroll, NO_DEPARTMENT, OTHER_DEPARTMENT } from './production-staff-department';

export interface StaffLocationRow {
  id: number; name: string; source: 'production' | 'assignment' | 'activation' | 'activity' | 'workday' | 'lastLine';
  day: string; time: string; process: string; room: string; line: string;
  /** Valor trabajado en la jornada de obra (solo fuente workday); decide el proceso principal. */
  value?: number;
  /** Actividad del catálogo Dcp_Actividades (solo fuente activity). */
  activity?: string;
}
export function normalizeStaffName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}
export function staffLocationArea(process: string, room = '', line = ''): string {
  const text = `${process} ${room} ${line}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/DESCAB|DECABEZ/.test(text)) return 'Descabezado';
  if (/DECORACION.*ANILLO|ARMADO.*ARO/.test(text)) return 'Aros / decoración de anillos';
  if (/CLASIF/.test(text)) return 'Clasificado';
  if (/RECEPCION/.test(text)) return 'Recepción';
  if (/AUX.*PESADO.*CHEQUEO/.test(text)) return 'Auxiliares de pesado y chequeo';
  if (/IQF/.test(text)) return 'IQF';
  if (/PELADO|SALA\s*[#-]?\s*\d/.test(text)) {
    const number = room.match(/\d+/)?.[0] ?? line.match(/SALA\s*[#-]?\s*(\d+)/i)?.[1];
    return number ? `Pelado · Sala ${Number(number)}` : 'Pelado · Sin sala registrada';
  }
  return line.trim() || process.trim() || 'Sin sala/área asignada';
}
function referenceFallback(person: StaffEmployee) {
  const job = person.job.toUpperCase();
  let area = 'Sin sala/área asignada';
  if (/PELADO/.test(job)) area = 'Pelado · Sin sala registrada';
  else if (/DESCABEZADO/.test(job)) area = 'Descabezado';
  else if (/CLASIFICADO/.test(job)) area = 'Clasificado';
  else if (/DECORACION.*ANILLO/.test(job)) area = 'Aros / decoración de anillos';
  return { area, areaBasis: area === 'Sin sala/área asignada' ? 'Sin asignación verificada' : 'Referencia de puesto en Payroll; sin sala asignada', areaDay: null, areaTime: null };
}
function sameProcess(a: string, b: string) {
  return a.split(' · ')[0] === b.split(' · ')[0];
}
function uniqueLocation(rows: StaffLocationRow[]) {
  // Una referencia genérica de Pelado no contradice una sala concreta del mismo proceso.
  const specific = rows.filter(row => !staffLocationArea(row.process, row.room, row.line).includes('Sin sala registrada'));
  const filtered = rows.filter(row => {
    const area = staffLocationArea(row.process, row.room, row.line);
    return !area.includes('Sin sala registrada') || !specific.some(value => sameProcess(area, staffLocationArea(value.process, value.room, value.line)));
  });
  const areas = new Set(filtered.map(row => staffLocationArea(row.process, row.room, row.line)));
  return areas.size === 1 ? filtered[0] : null;
}

export const NO_ACTIVITY = 'Sin actividad registrada';
/** Sufijo de los grupos sin actividad del catálogo; el frontend los ordena después de las actividades. */
export const ACTIVITY_PROCESS_SUFFIX = ' · sin actividad específica';
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
/**
 * Actividad del día, del catálogo Dcp_Actividades (DCP_PagoGrupalAsistenciasDetalle.idActividad, vía
 * VAsistenciaActividades): la última registrada hasta el corte. La obra (Pelado, Descabezado) y las líneas
 * grupales no tienen actividad en el catálogo; para ellas se usa su proceso del día. Ojo: la columna
 * `actividad` de V_EmpleadosObraActividades es solo la línea de producción, no una actividad.
 */
function staffActivity(rows: StaffLocationRow[], day: string) {
  const timed = rows.filter(row => row.source === 'activity' && row.day === day && clean(row.activity ?? ''))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const last = timed[timed.length - 1];
  if (last) {
    const activity = clean(last.activity ?? '');
    return { activity, activityBasis: timed.length > 1 ? 'Última actividad registrada en asistencia grupal' : 'Actividad registrada en asistencia grupal',
      otherActivities: [...new Set(timed.map(row => clean(row.activity ?? '')))].filter(label => label !== activity) };
  }
  // Sin actividad: proceso con mayor valor trabajado en la jornada de obra; si no hay, el de la asignación o pesada del día.
  const processes = new Map<string, number>();
  for (const row of rows) if (row.source === 'workday' && row.day === day && clean(row.process)) {
    processes.set(clean(row.process), (processes.get(clean(row.process)) ?? 0) + (row.value ?? 0));
  }
  const ranked = [...processes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([label]) => label);
  const process = ranked[0]
    ?? rows.find(row => row.source === 'activation' && row.day === day && clean(row.process))?.process
    ?? rows.find(row => row.source === 'production' && row.day === day && clean(row.process))?.process;
  if (process) return { activity: `${clean(process)}${ACTIVITY_PROCESS_SUFFIX}`, activityBasis: 'Sin actividad del catálogo; se agrupa por su proceso del día', otherActivities: [] as string[] };
  return { activity: NO_ACTIVITY, activityBasis: 'Sin actividad ni proceso registrado para el día', otherActivities: [] as string[] };
}

/**
 * Departamento de planta: línea de obra con mayor valor trabajado del día; si no hay, la última línea con hora
 * de la asistencia grupal; si no trabajó hoy, su última línea de los 30 días previos; y por último su departamento de Payroll.
 */
function staffDepartment(rows: StaffLocationRow[], day: string, payrollDepartment: string) {
  const worked = new Map<string, { process: string; line: string; value: number }>();
  for (const row of rows) if (row.source === 'workday' && row.day === day && clean(row.line)) {
    const current = worked.get(clean(row.line)) ?? { process: row.process, line: row.line, value: 0 };
    current.value += row.value ?? 0; worked.set(clean(row.line), current);
  }
  const main = [...worked.values()].sort((a, b) => b.value - a.value)[0];
  const timed = rows.filter(row => row.source === 'activity' && row.day === day && clean(row.line))
    .sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(-1)[0];
  const previous = rows.filter(row => row.source === 'lastLine' && row.day < day && clean(row.line))
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-1)[0];
  const reference = main ? { row: main, basis: 'Línea de producción del día' }
    : timed ? { row: timed, basis: 'Línea de la asistencia grupal del día' }
      : previous ? { row: previous, basis: `Última línea registrada (${previous.day})` } : null;
  const byLine = reference && departmentFromLine(reference.row.process, reference.row.line);
  if (byLine) return { plantDepartment: byLine as string, plantDepartmentBasis: `${reference!.basis}: ${clean(reference!.row.line)}` };
  const byPayroll = departmentFromPayroll(payrollDepartment);
  if (byPayroll) return { plantDepartment: byPayroll as string, plantDepartmentBasis: `Departamento de Payroll: ${payrollDepartment}` };
  if (reference) return { plantDepartment: OTHER_DEPARTMENT, plantDepartmentBasis: `${reference.basis}: ${clean(reference.row.line)} (no está en la lista)` };
  if (clean(payrollDepartment) && !/^PRODUCCION$/i.test(clean(payrollDepartment)) && payrollDepartment !== 'Sin departamento')
    return { plantDepartment: OTHER_DEPARTMENT, plantDepartmentBasis: `Departamento de Payroll: ${payrollDepartment} (no está en la lista)` };
  return { plantDepartment: NO_DEPARTMENT, plantDepartmentBasis: 'Sin línea de producción en los últimos 30 días' };
}

/** Solo enriquece personas de Payroll. Ninguna asignación o pesada agrega asistencia o empleados. */
export function attachStaffLocations(people: StaffEmployee[], locations: StaffLocationRow[], day: string, currentDay: string) {
  const byId = new Map<number, StaffLocationRow[]>();
  for (const row of locations) {
    if (row.day && row.day > day) continue;
    if (row.source === 'assignment' && day !== currentDay) continue;
    const values = byId.get(row.id) ?? []; values.push(row); byId.set(row.id, values);
  }
  let unverified = 0;
  function locate(person: StaffEmployee) {
    const raw = byId.get(person.id) ?? [];
    // El ID compartido se valida también contra el nombre; las discrepancias no se asignan automáticamente.
    const rows = raw.filter(row => row.name && normalizeStaffName(row.name) === normalizeStaffName(person.name));
    if (raw.length && !rows.length) unverified++;
    const currentTimed = rows.filter(row => row.day === day && row.time && (row.source === 'production' || row.source === 'activity'));
    const latestTime = currentTimed.map(row => row.time).sort().slice(-1)[0];
    const latest = latestTime ? currentTimed.filter(row => row.time === latestTime) : [];
    const assignments = rows.filter(row => row.source === 'assignment');
    const activity = rows.filter(row => row.day === day && ['workday', 'activation', 'activity', 'production'].includes(row.source));
    const past = rows.filter(row => row.source === 'production' && row.day && row.day < day);
    const latestPast = past.map(row => `${row.day}T${row.time || '00:00:00'}`).sort().slice(-1)[0];
    const historical = latestPast ? past.filter(row => `${row.day}T${row.time || '00:00:00'}` === latestPast) : [];
    let choice: StaffLocationRow | undefined;
    let ambiguous = false;
    if (latest.length) {
      const resolved = uniqueLocation(latest);
      if (!resolved) ambiguous = true;
      else {
        const area = staffLocationArea(resolved.process, resolved.room, resolved.line);
        const assigned = uniqueLocation(assignments);
        // La actividad genérica no identifica una sala; conserva la asignación específica compatible.
        choice = area.includes('Sin sala registrada') && assigned && sameProcess(area, staffLocationArea(assigned.process, assigned.room, assigned.line)) ? assigned : resolved;
      }
    } else if (assignments.length) {
      choice = uniqueLocation(assignments) ?? undefined;
      if (!choice) {
        const daily = uniqueLocation(activity.filter(row => row.source !== 'activation'));
        if (daily) {
          const dailyArea = staffLocationArea(daily.process, daily.room, daily.line);
          const compatible = assignments.filter(row => sameProcess(dailyArea, staffLocationArea(row.process, row.room, row.line)));
          choice = uniqueLocation(compatible) ?? daily;
        }
      }
      ambiguous = !choice;
    } else {
      const workday = activity.filter(row => row.source !== 'activation');
      const references = workday.length ? workday : activity;
      const resolved = uniqueLocation(references);
      const old = uniqueLocation(historical);
      if (references.length && !resolved) ambiguous = true;
      else if (resolved) {
        const area = staffLocationArea(resolved.process, resolved.room, resolved.line);
        choice = area.includes('Sin sala registrada') && old && sameProcess(area, staffLocationArea(old.process, old.room, old.line)) ? old : resolved;
      } else if (historical.length) {
        choice = old ?? undefined; ambiguous = !choice;
      }
    }
    if (ambiguous) return { ...person, area: 'Ubicación por confirmar', areaBasis: 'Hay referencias simultáneas a distintas salas o áreas', areaDay: day, areaTime: latestTime || null };
    if (!choice) return { ...person, ...referenceFallback(person) };
    const basis = choice.source === 'assignment' ? 'Asignación activa actual'
      : choice.source === 'production' ? choice.day === day ? 'Última área con producción registrada' : 'Última sala registrada anteriormente'
      : choice.source === 'activation' ? 'Proceso de asignación del día' : 'Área de actividad registrada';
    return { ...person, area: staffLocationArea(choice.process, choice.room, choice.line), areaBasis: basis,
      areaDay: choice.day || (choice.source === 'assignment' ? currentDay : null), areaTime: choice.time || null };
  }
  const employees = people.map(person => {
    const own = (byId.get(person.id) ?? []).filter(row => row.name && normalizeStaffName(row.name) === normalizeStaffName(person.name));
    return { ...locate(person), ...staffActivity(own, day), ...staffDepartment(own, day, person.department) };
  });
  return { employees, unverified };
}
