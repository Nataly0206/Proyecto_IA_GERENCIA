import type { StaffEmployee } from '../types/productionStaff';

/** Las gráficas usan la misma entrada biométrica que el contador Asistieron. */
export function staffDashboardGroups(people: StaffEmployee[], groupOf: (person: StaffEmployee) => string) {
  const grouped = new Map<string, StaffEmployee[]>();
  for (const person of people) {
    const label = groupOf(person);
    const rows = grouped.get(label) ?? [];
    rows.push(person);
    grouped.set(label, rows);
  }
  return [...grouped].map(([label, rows]) => ({ label, rows, total: rows.length, present: rows.filter(person => person.biometricEntry).length }))
    .sort((a, b) => b.present - a.present || b.total - a.total || a.label.localeCompare(b.label, 'es', { numeric: true }));
}
