import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupStaffActivities } from '../src/utils/staffActivities';
import type { StaffEmployee } from '../src/types/productionStaff';

const person = (id: number, extra: Partial<StaffEmployee> = {}) => ({ id, activity: 'Sin actividad registrada', dailyActivities: [], ...extra } as StaffEmployee);
const step = (activity: string, process: string, line: string) => ({ activity, process, line, area: process, start: '06:00:00', end: null, hours: null });

test('última registrada reparte cada persona una vez y distingue actividades iguales en procesos distintos', () => {
  const people = [person(1, { activity: 'Empaque', activityAssignment: { source: 'check', process: 'IQF', line: 'IQF TA', start: '07:00:00', end: null } }),
    person(2, { activity: 'Empaque', activityAssignment: { source: 'check', process: 'Pelado', line: 'PELADO TA', start: '07:00:00', end: null } }), person(3)];
  const groups = groupStaffActivities(people, 'latest');
  assert.equal(groups.length, 3);
  assert.equal(groups.reduce((sum, group) => sum + group.people.length, 0), people.length);
  assert.equal(groups.find(group => group.activity === 'Sin actividad registrada')?.people[0].id, 3);
});

test('participación deduplica regresos a la misma actividad y conserva líneas y cambios de proceso', () => {
  const people = [person(1, { dailyActivities: [step('Empaque', 'IQF', 'IQF TA'), step('Apoyo', 'Pelado', 'PELADO TA'), step('Empaque', 'IQF', 'IQF 2 TA')] })];
  const latest = groupStaffActivities(people, 'latest');
  const visited = groupStaffActivities(people, 'visited');
  assert.equal(latest.length, 1);
  assert.equal(visited.length, 2);
  const iqf = visited.find(group => group.process === 'IQF')!;
  assert.equal(iqf.people.length, 1);
  assert.deepEqual(iqf.lines, ['IQF TA', 'IQF 2 TA']);
});

test('proceso por pesa y actividad por confirmar permanecen separados de las actividades de catálogo', () => {
  const people = [person(1, { activity: 'Pelado · sin actividad específica', activityAssignment: { source: 'weighing', process: 'Pelado', line: '', start: '08:00:00', end: null } }),
    person(2, { activity: 'Actividad por confirmar', activityAssignment: { source: 'conflict', process: '', line: '', start: null, end: null } })];
  const groups = groupStaffActivities(people, 'latest');
  assert.ok(groups.some(group => group.activity.includes('evidencia de pesa') && group.process === 'Pelado'));
  assert.ok(groups.some(group => group.activity === 'Actividad por confirmar'));
});

test('chequeos sin actividad específica usan el mismo grupo en ambos modos', () => {
  const people = [person(1, { activity: 'Pelado · sin actividad específica', activityAssignment: { source: 'check', process: 'Pelado', line: 'PELADO TA', start: '06:00:00', end: null }, dailyActivities: [step('Sin actividad registrada', 'Pelado', 'PELADO TA')] })];
  assert.equal(groupStaffActivities(people, 'latest')[0].key, groupStaffActivities(people, 'visited')[0].key);
});
