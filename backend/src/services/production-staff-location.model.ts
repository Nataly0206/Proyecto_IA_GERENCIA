import type { StaffEmployee } from './production-staff.model';
import { departmentFromLine, departmentFromPayroll, NO_DEPARTMENT, OTHER_DEPARTMENT } from './production-staff-department';

export interface StaffLocationRow {
  id: number; name: string; source: 'production' | 'assignment' | 'activation' | 'activity' | 'workday' | 'lastLine';
  day: string; time: string; process: string; room: string; line: string;
  /** Valor trabajado en la jornada de obra (solo fuente workday); decide el proceso principal. */
  value?: number;
  /** Actividad del catálogo Dcp_Actividades (solo fuente activity). */
  activity?: string; endTime?: string;
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
 * Actividad del día, del catálogo Dcp_Actividades (DCP_PagoGrupalAsistenciasDetalle.idActividad): la última registrada hasta el corte. La obra (Pelado, Descabezado) y las líneas
 * grupales no tienen actividad en el catálogo; para ellas se usa su proceso del día. Ojo: la columna
 * `actividad` de V_EmpleadosObraActividades es solo la línea de producción, no una actividad.
 */
function staffActivity(rows: StaffLocationRow[], day: string) {
  const timed = rows.filter(row => row.source === 'activity' && row.day === day)
    .sort((a,b) => a.time.localeCompare(b.time));
  const label = (row: StaffLocationRow) => clean(row.activity ?? '') || (clean(row.process) ? `${clean(row.process)}${ACTIVITY_PROCESS_SUFFIX}` : NO_ACTIVITY);
  const last = timed[timed.length-1];
  const assignment = (source: 'check' | 'weighing' | 'unknown' | 'conflict', row?: StaffLocationRow) => ({ source, process: row?.process ?? '', line: row?.line ?? '', start: row?.time || null, end: row?.endTime || null });
  if (last) {
    const simultaneous = timed.filter(row => row.time === last.time);
    const distinct = new Set(simultaneous.map(row => JSON.stringify([label(row), clean(row.process), clean(row.line)])));
    if (distinct.size > 1) return { activity: 'Actividad por confirmar', activityBasis: 'Hay chequeos simultáneos en distintas actividades o líneas',
      activityAssignment: assignment('conflict'), otherActivities: [...new Set(timed.map(label))] };
    return {activity: label(last), activityBasis: 'Último chequeo de actividad del día', activityAssignment: assignment('check', last),
      otherActivities: [...new Set(timed.map(label))].filter(value => value !== label(last))};
  }
  const weighed = rows.filter(row => row.source === 'production' && row.day === day && clean(row.process)).sort((a,b) => a.time.localeCompare(b.time));
  const latest = weighed[weighed.length - 1];
  if (latest) {
    const processes = new Set(weighed.filter(row => row.time === latest.time).map(row => clean(row.process)));
    if (processes.size > 1) return { activity: 'Actividad por confirmar', activityBasis: 'Hay pesas simultáneas en distintos procesos', activityAssignment: assignment('conflict'), otherActivities: [] as string[] };
    return { activity: `${clean(latest.process)}${ACTIVITY_PROCESS_SUFFIX}`, activityBasis: 'Proceso de la pesada del día', activityAssignment: assignment('weighing', latest), otherActivities: [] as string[] };
  }
  return { activity: NO_ACTIVITY, activityBasis: 'Sin chequeo ni proceso de pesada registrado para el día', activityAssignment: assignment('unknown'), otherActivities: [] as string[] };
}

/**
 * Departamento de planta: última línea con hora
 * de la asistencia grupal; si no trabajó hoy, su última línea de los 30 días previos; y por último su departamento de Payroll.
 */
function staffDepartment(rows: StaffLocationRow[], day: string, payrollDepartment: string) {
  const timed = rows.filter(row => row.source === 'activity' && row.day === day && clean(row.line))
    .sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(-1)[0];
  const previous = rows.filter(row => row.source === 'lastLine' && row.day < day && clean(row.line))
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-1)[0];
  const reference = timed ? { row: timed, basis: 'Última línea del chequeo del día' }
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

/** Enriquece la ubicación del padrón. La asistencia se calcula antes con pesas y chequeos. */
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
    const activity = rows.filter(row => row.day === day && ['activation', 'activity', 'production'].includes(row.source));
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
    const dailyActivities = own.filter(row => row.source === 'activity' && row.day === day)
      .sort((a,b) => a.time.localeCompare(b.time)).map(row => {
        const start = row.time, end = row.endTime ?? '';
        const minutes = (value: string) => Number(value.slice(0,2))*60+Number(value.slice(3,5));
        return { activity: clean(row.activity ?? '') || NO_ACTIVITY, line: row.line, process: row.process, area: staffLocationArea(row.process, row.room, row.line), start: start || null, end: end || null,
          hours: start && end ? ((minutes(end)-minutes(start)+1440)%1440)/60 : null };
      });
    const enriched = { ...locate(person), dailyActivities, ...staffActivity(own, day), ...staffDepartment(own, day, person.department) };
    return enriched;
  });
  return { employees, unverified };
}
