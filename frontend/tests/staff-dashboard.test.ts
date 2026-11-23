import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffDashboardGroups } from '../src/utils/staffDashboard';
import type { StaffEmployee } from '../src/types/productionStaff';

test('las gráficas mantienen el total por entrada biométrica y el padrón al cambiar agrupación', () => {
  const people = [
    { id: 1, area: 'Sala 1', activity: 'Apoyo', biometricEntry: true },
    { id: 2, area: 'Sala 1', activity: 'Empaque', biometricEntry: false, biometricMarked: true, hasAttendance: true },
    { id: 3, area: 'Sala 2', activity: 'Empaque', biometricEntry: true, status: 'conflict' },
  ] as StaffEmployee[];
  for (const groupOf of [(person: StaffEmployee) => person.area, (person: StaffEmployee) => person.activity]) {
    const groups = staffDashboardGroups(people, groupOf);
    assert.equal(groups.reduce((sum, group) => sum + group.present, 0), 2);
    assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 3);
    assert.equal(groups.flatMap(group => group.rows).length, 3);
  }
});

test('sin datos no crea series ficticias; grupos sin entradas conservan el padrón', () => {
  assert.deepEqual(staffDashboardGroups([], person => person.area), []);
  const groups = staffDashboardGroups([{ id: 1, area: 'Sin sala', biometricEntry: false } as StaffEmployee], person => person.area);
  assert.equal(groups[0].present, 0);
  assert.equal(groups[0].total, 1);
});
