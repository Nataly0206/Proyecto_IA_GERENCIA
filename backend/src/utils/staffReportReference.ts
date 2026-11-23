/** Referencia externa de Payroll: A/X son estados, las novedades no se convierten en faltas. */
export type StaffReferenceStatus = 'present' | 'absent' | 'excused' | 'off';
export interface StaffReferenceRow { id: number; mark: string; status: StaffReferenceStatus }
export function referenceStatus(mark: string): StaffReferenceStatus {
  const text = mark.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (text === 'A') return 'present';
  if (text === 'X') return 'absent';
  if (/PERMISO|INCAPACIDAD/.test(text)) return 'excused';
  if (/DIA LIBRE|DESCANSO|VACACIONES/.test(text)) return 'off';
  throw new Error(`Marca de reporte sin clasificar: ${mark}`);
}
export function compareStaffReference(reference: StaffReferenceRow[], actual: { id: number; status: string }[]) {
  const byId = new Map(actual.map(person => [person.id, person]));
  const wanted = new Set(reference.map(person => person.id));
  if (wanted.size !== reference.length) throw new Error('El reporte repite códigos de empleado.');
  const mismatches = reference.filter(person => byId.get(person.id)?.status !== person.status)
    .map(person => ({ id: person.id, expected: person.status, actual: byId.get(person.id)?.status ?? 'missing' }));
  const counts = (values: { status: string }[]) => values.reduce<Record<string, number>>((result, person) => {
    result[person.status] = (result[person.status] ?? 0) + 1; return result;
  }, {});
  return { reference: { total: reference.length, ...counts(reference) }, actual: { total: actual.length, ...counts(actual) },
    matched: reference.length - mismatches.length, mismatches, extraIds: actual.filter(person => !wanted.has(person.id)).map(person => person.id) };
}
