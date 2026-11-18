import type { StaffEmployee } from './production-staff.model';

export interface StaffLocationRow {
  id: number; name: string; source: 'production' | 'assignment' | 'activation' | 'activity' | 'workday';
  day: string; time: string; process: string; room: string; line: string;
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

/** Solo enriquece personas de Payroll. Ninguna asignación o pesada agrega asistencia o empleados. */
export function attachStaffLocations(people: StaffEmployee[], locations: StaffLocationRow[], day: string, currentDay: string) {
  const byId = new Map<number, StaffLocationRow[]>();
  for (const row of locations) {
    if (row.day && row.day > day) continue;
    if (row.source === 'assignment' && day !== currentDay) continue;
    const values = byId.get(row.id) ?? []; values.push(row); byId.set(row.id, values);
  }
  let unverified = 0;
  const employees = people.map(person => {
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
  });
  return { employees, unverified };
}
