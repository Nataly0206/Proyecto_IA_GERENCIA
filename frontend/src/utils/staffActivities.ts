import type { StaffEmployee } from '../types/productionStaff';

export type ActivityMode = 'latest' | 'visited';
export type StaffActivityGroup = { key: string; activity: string; process: string; lines: string[]; people: StaffEmployee[] };
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Última asignación: partición del padrón. Participación: una persona por actividad/proceso. */
export function groupStaffActivities(people: StaffEmployee[], mode: ActivityMode): StaffActivityGroup[] {
  const groups = new Map<string, StaffActivityGroup>();
  for (const person of people) {
    const assignment = person.activityAssignment;
    const steps = mode === 'visited' && person.dailyActivities?.length
      ? person.dailyActivities.map(step => ({ activity: step.activity === 'Sin actividad registrada' ? 'Sin actividad específica' : step.activity, process: step.process, line: step.line }))
      : [{ activity: assignment?.source === 'weighing' ? 'Sin actividad específica · evidencia de pesa' : assignment?.source === 'check' && person.activity.endsWith(' · sin actividad específica') ? 'Sin actividad específica' : person.activity || 'Sin actividad registrada', process: assignment?.process ?? '', line: assignment?.line ?? '' }];
    for (const step of steps) {
      const activity = clean(step.activity), process = clean(step.process), line = clean(step.line);
      const key = JSON.stringify([process.toLocaleLowerCase('es'), activity.toLocaleLowerCase('es')]);
      const group = groups.get(key) ?? { key, activity, process, lines: [], people: [] };
      if (!group.people.some(value => value.id === person.id)) group.people.push(person);
      if (line && !group.lines.includes(line)) group.lines.push(line);
      groups.set(key, group);
    }
  }
  const rank = (group: StaffActivityGroup) => group.activity === 'Sin actividad registrada' ? 3 : group.activity === 'Actividad por confirmar' ? 2 : group.activity.startsWith('Sin actividad específica') || group.activity.includes(' · sin actividad específica') ? 1 : 0;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.people.length - a.people.length || a.process.localeCompare(b.process, 'es') || a.activity.localeCompare(b.activity, 'es'));
}
