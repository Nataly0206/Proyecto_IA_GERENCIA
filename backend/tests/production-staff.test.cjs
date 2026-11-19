process.env.CACHE_ENABLED = 'false';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildStaffEmployees, summarizeStaff, staffAreaRows, buildStaffHistory, staffKind, payrollTime } = require('../dist/services/production-staff.model');
const { validStaffDate, mapPayrollStaffRow } = require('../dist/services/production-staff.service');
const day = '2026-11-17';
const row = (id, extra = {}) => ({ id, day, code: String(id), name: `Persona ${id}`, department: 'PRODUCCION', division: 'PRODUCCION', job: 'OBRA', shift: 'A', source: 'calendar', actionCode: 'N/A', action: '', collector: 0, noProduction: false, entry: '', exit: '', hours: '', ...extra });
const employee = (...rows) => buildStaffEmployees(rows, day)[0];

test('N/A sin asistencia no se interpreta como presente ni ausente', () => {
  const person = employee(row(1));
  assert.equal(person.status, 'pending');
  assert.equal(person.hasAttendance, false);
  assert.equal(summarizeStaff([person]).absenceRate, null);
});

test('faltó a trabajar e inasistencia se clasifican solo por registro explícito', () => {
  for (const code of ['A039', '039', 'A013', '009']) assert.equal(employee(row(1, { actionCode: code })).status, 'absent');
  assert.equal(employee(row(1, { source: 'action', actionCode: '', action: 'FALTO A TRABAJAR' })).status, 'absent');
});

test('permisos e incapacidades no se suman como faltas', () => {
  for (const actionCode of ['A014', 'A015', 'A024', 'A026', 'A027']) {
    const person = employee(row(1, { actionCode }));
    assert.equal(person.status, 'excused');
    assert.equal(summarizeStaff([person]).absent, 0);
  }
});

test('descansos, vacaciones y falta de producción conservan estados separados', () => {
  for (const actionCode of ['A006', 'A007', 'A035', 'A030']) assert.equal(employee(row(1, { actionCode })).status, 'off');
  assert.equal(employee(row(1, { actionCode: 'A040' })).status, 'noProduction');
  assert.equal(employee(row(1, { noProduction: true })).status, 'noProduction');
});

test('marcaciones válidas y asistencia manual confirman asistencia sin exigir libras', () => {
  const person = employee(row(1), row(1, { source: 'clock', entry: '050000', exit: '180000', hours: '130000' }));
  assert.equal(person.status, 'present');
  assert.equal(person.entry, '05:00:00');
  assert.equal(person.exit, '18:00:00');
  assert.equal(employee(row(2, { source: 'attendance', entry: '06:00:00' })).status, 'present');
  assert.equal(employee(row(3, { collector: 1 })).status, 'present');
  assert.equal(employee(row(4, { actionCode: 'A011', action: 'FERIADO TRABAJADO' })).status, 'present');
});

test('marcación incompleta o inválida no inventa asistencia', () => {
  assert.equal(employee(row(1, { source: 'clock', entry: '000000', exit: '000000', hours: '000000' })).status, 'pending');
  assert.equal(employee(row(1, { source: 'clock', entry: '990000', exit: '180000', hours: '080000' })).status, 'pending');
  assert.equal(payrollTime('05:30'), '05:30:00');
  assert.equal(payrollTime('236099'), null);
});

test('deduplica persona entre calendario, novedades y varias marcas', () => {
  const people = buildStaffEmployees([row(1), row(1), row(1, { source: 'clock', entry: '050000', exit: '180000', hours: '130000' }), row(1, { source: 'attendance', entry: '04:50:00', exit: '18:20:00' })], day);
  assert.equal(people.length, 1);
  assert.equal(people[0].entry, '04:50:00');
  assert.equal(people[0].exit, '18:20:00');
  assert.equal(summarizeStaff(people).present, 1);
});

test('novedad duplicada no genera conflicto ni duplica faltas', () => {
  const person = employee(row(1, { actionCode: 'A039', action: 'FALTO A TRABAJAR' }), row(1, { source: 'action', actionCode: '', action: 'FALTO A TRABAJAR' }));
  assert.equal(person.status, 'absent');
  assert.equal(person.actions.length, 1);
  assert.equal(person.actions[0].code, 'A039');
});

test('asistencia y falta simultáneas o novedades incompatibles requieren revisión', () => {
  const person = employee(row(1, { actionCode: 'A039' }), row(1, { source: 'clock', entry: '050000', exit: '180000', hours: '130000' }));
  assert.equal(person.status, 'conflict');
  assert.equal(person.hasAttendance, true);
  assert.equal(person.absenceRecorded, true);
  assert.equal(summarizeStaff([person]).absent, 0);
  assert.equal(employee(row(1, { actionCode: 'A014' }), row(1, { source: 'action', action: 'DIA LIBRE', actionCode: '' })).status, 'conflict');
  assert.equal(employee(row(1, { actionCode: 'A999', action: 'ESTADO DESCONOCIDO' })).status, 'conflict');
});

test('tasa sobre asistencias y faltas con carga completa, sin permisos ni descansos', () => {
  const people = buildStaffEmployees([row(1, { collector: 1 }), row(2, { actionCode: 'A039' }), row(3, { actionCode: 'A014' }), row(4, { actionCode: 'A007' }), row(5, { actionCode: 'A040' })], day);
  const summary = summarizeStaff(people);
  assert.equal(summary.absenceRate, 50);
  assert.equal(summary.total, 5);
  assert.equal(summary.present + summary.absent + summary.excused + summary.off + summary.noProduction + summary.pending + summary.conflict, 5);
  assert.equal(summarizeStaff([...people, employee(row(6))]).absenceRate, null);
});

test('histórico separa personas-día, no toma datos futuros e incluye días sin datos', () => {
  const result = buildStaffHistory([row(1, { actionCode: 'A039' }), row(1, { actionCode: 'A039', day: '2026-11-16' }), row(2, { day: '2026-11-18', collector: 1 })], '2026-11-15', day);
  assert.equal(result.length, 3);
  assert.equal(result[0].total, 0);
  assert.equal(result[1].absent, 1);
  assert.equal(result[2].absent, 1);
  assert.equal(result.reduce((sum, date) => sum + date.absent, 0), 2);
});

test('departamentos reconcilian totales y comodines no se cuentan dos veces', () => {
  const people = buildStaffEmployees([row(1, { job: 'APOYO COMODIN' }), row(2, { department: 'CALIDAD', job: 'AUXILIAR DE CALIDAD' }), row(3, { job: 'DECORACION ANILLO' })], day);
  assert.equal(staffAreaRows(people).reduce((sum, area) => sum + area.total, 0), 3);
  assert.equal(summarizeStaff(people).wildcard, 1);
  assert.equal(staffKind(''), 'unknown');
  assert.equal(staffKind('APOYO COMODIN'), 'auxiliary');
  assert.equal(staffKind('OBRA'), 'production');
});

test('mapeo mantiene códigos y fechas sin exponer otros datos de nómina', () => {
  const result = mapPayrollStaffRow({ Dia: '2026-11-17', IdEmpleado: 1, CodigoEmpleado: '0001', Fuente: 'calendar', FaltaProducto: 1 });
  assert.equal(result.code, '0001');
  assert.equal(result.noProduction, true);
  assert.equal(result.day, day);
});

test('fecha inválida, futura y parámetros no escalares se rechazan', () => {
  for (const value of ['2026-02-30', '2026-11-18', '2026-1-2', 'x', ['2026-11-17'], undefined]) assert.equal(validStaffDate(value, day), false);
  assert.equal(validStaffDate(day, day), true);
});

test('asistencia y faltas siguen saliendo de Payroll aunque fallen las asignaciones', async () => {
  const payroll = require('../dist/services/payroll.service');
  const stb = require('../dist/services/stb.service');
  const service = require('../dist/services/production-staff.service');
  const { PAYROLL_STAFF_QUERY } = require('../dist/services/production-staff.queries');
  const original = payroll.runPayrollQuery; const originalStb = stb.runStbQuery; const log = console.error;
  try {
    console.error = () => {};
    stb.runStbQuery = async () => { throw new Error('Asignaciones no disponibles'); };
    payroll.runPayrollQuery = async query => query === PAYROLL_STAFF_QUERY
      ? [{ Dia: day, IdEmpleado: 1, Fuente: 'calendar', CodigoAccion: 'A039', Accion: 'FALTO A TRABAJAR' }] : [{ UltimaFecha: '2026-11-11' }];
    const result = await service.getProductionStaff(day);
    assert.equal(result.source, 'STBPayroll');
    assert.equal(result.summary.absent, 1);
    assert.equal(result.lastAttendance, '2026-11-11');
    assert.equal(result.employees.length, 1);
    assert.equal(result.locationAvailable, false);
  } finally { payroll.runPayrollQuery = original; stb.runStbQuery = originalStb; console.error = log; }
});

test('un error de STBPayroll devuelve 503 sin sustituir conteos por ceros', async () => {
  const payroll = require('../dist/services/payroll.service');
  const service = require('../dist/services/production-staff.service');
  const original = payroll.runPayrollQuery; const log = console.error;
  try {
    console.error = () => {};
    payroll.runPayrollQuery = async () => { throw new Error('Fallo de prueba'); };
    await assert.rejects(() => service.getProductionStaff(day), error => error.statusCode === 503);
  } finally { payroll.runPayrollQuery = original; console.error = log; }
});

test('Personal requiere su propio permiso y Productividad no lo concede', async () => {
  const express = require('express'); const router = require('../dist/routes/dashboard.routes').default;
  const app = express();
  app.use((req, res, next) => { res.locals.authUser = { esAdministrador: false, permisos: req.headers['x-test-permission'] === 'yes' ? ['personal'] : req.headers['x-test-permission'] === 'productivity' ? ['resumen_procesos'] : [] }; next(); });
  app.use(router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/personal-produccion', '/personal-produccion/historico']) {
      assert.equal((await fetch(base + path)).status, 403);
      assert.equal((await fetch(base + path, { headers: { 'x-test-permission': 'productivity' } })).status, 403);
      assert.equal((await fetch(base + path + '?fecha=2026-02-30', { headers: { 'x-test-permission': 'yes' } })).status, 400);
    }
    assert.equal((await fetch(base + '/resumen-procesos', { headers: { 'x-test-permission': 'yes' } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});


const { attachStaffLocations } = require('../dist/services/production-staff-location.model');
const location = (id, extra = {}) => ({ id, name: `Persona ${id}`, source: 'assignment', day: '', time: '', process: 'Pelado', room: 'Sala 1', line: '', ...extra });

test('asistente de Payroll cuenta en sala sin exigir una pesada y conserva su tipo auxiliar', () => {
  const people = buildStaffEmployees([row(1, { collector: 1, job: 'AUXILIARES DE PELADO' })], day);
  const { employees } = attachStaffLocations(people, [location(1)], day, day);
  assert.equal(employees[0].area, 'Pelado · Sala 1');
  assert.equal(employees[0].status, 'present');
  const sala = staffAreaRows(employees).find(value => value.area === 'Pelado · Sala 1');
  assert.equal(sala.presentAuxiliary, 1);
  assert.equal(sala.presentProduction, 0);
  assert.equal(sala.present, 1);
});

test('una pesada no convierte a un pendiente en asistente ni agrega otro empleado', () => {
  const people = buildStaffEmployees([row(1)], day);
  const { employees } = attachStaffLocations(people, [location(1, { source: 'production', day, time: '08:00:00' }), location(2, { source: 'production', day, time: '09:00:00' })], day, day);
  assert.equal(employees.length, 1);
  assert.equal(employees[0].status, 'pending');
  assert.equal(summarizeStaff(employees).present, 0);
  assert.equal(employees[0].area, 'Pelado · Sala 1');
});

test('las faltas se distribuyen por asignación de sala sin duplicar personas', () => {
  const people = buildStaffEmployees([row(1, { actionCode: 'A039' })], day);
  const { employees } = attachStaffLocations(people, [location(1, { room: 'Sala 2' }), location(1, { room: 'Sala 2' })], day, day);
  assert.equal(employees[0].status, 'absent');
  assert.equal(staffAreaRows(employees).find(value => value.area === 'Pelado · Sala 2').absent, 1);
  assert.equal(staffAreaRows(employees).reduce((sum, area) => sum + area.total, 0), 1);
});

test('última actividad del día cambia sala a Descabezado y conserva asistencia de Payroll', () => {
  const people = buildStaffEmployees([row(1, { collector: 1 })], day);
  const { employees } = attachStaffLocations(people, [location(1), location(1, { source: 'production', day, time: '08:00:00' }), location(1, { source: 'production', process: 'Descabezado', room: '', day, time: '10:00:00' })], day, day);
  assert.equal(employees[0].area, 'Descabezado');
  assert.equal(employees[0].status, 'present');
  assert.equal(employees[0].areaTime, '10:00:00');
  assert.equal(staffAreaRows(employees).reduce((sum, area) => sum + area.present, 0), 1);
});

test('asignaciones simultáneas sin evidencia suficiente quedan por confirmar', () => {
  const people = buildStaffEmployees([row(1)], day);
  const { employees } = attachStaffLocations(people, [location(1), location(1, { room: 'Sala 2' })], day, day);
  assert.equal(employees[0].area, 'Ubicación por confirmar');
  assert.equal(employees[0].status, 'pending');
});

test('en consulta histórica ignora la asignación actual y las actividades futuras', () => {
  const people = buildStaffEmployees([row(1)], day);
  const { employees } = attachStaffLocations(people, [location(1, { room: 'Sala 4' }), location(1, { source: 'production', room: 'Sala 2', day: '2026-11-16', time: '12:00:00' }), location(1, { source: 'production', room: 'Sala 3', day: '2026-11-18', time: '12:00:00' })], day, '2026-11-18');
  assert.equal(employees[0].area, 'Pelado · Sala 2');
  assert.equal(employees[0].areaDay, '2026-11-16');
});

test('no asigna sala cuando el nombre del mismo ID no coincide entre las bases', () => {
  const people = buildStaffEmployees([row(1)], day);
  const result = attachStaffLocations(people, [location(1, { name: 'Otra persona' })], day, day);
  assert.equal(result.unverified, 1);
  assert.equal(result.employees[0].area, 'Sin sala/área asignada');
  assert.equal(result.employees.length, 1);
});

test('una referencia genérica de pelado conserva la sala específica compatible', () => {
  const people = buildStaffEmployees([row(1)], day);
  const { employees } = attachStaffLocations(people, [location(1), location(1, { source: 'activity', day, time: '08:00:00', room: '', line: 'Pelado apoyo' })], day, day);
  assert.equal(employees[0].area, 'Pelado · Sala 1');
});

test('A verde y X roja del reporte tienen prioridad sobre novedades y fuentes anteriores', () => {
  const a = employee(row(1, { source: 'report', reportMark: 'A', actionCode: 'A014', action: 'INCAPACIDAD', firstPunch: `${day}T06:12:14` }));
  assert.equal(a.status, 'present');
  assert.equal(a.reportMark, 'A');
  assert.equal(a.hasAttendance, true);
  assert.equal(a.firstPunch, `${day}T06:12:14`);
  const x = employee(row(2, { source: 'report', reportMark: 'X', actionCode: 'A026', action: 'PERMISO SIN SUELDO' }), row(2, { source: 'clock', entry: '010000', exit: '030000', hours: '020000' }));
  assert.equal(x.status, 'absent');
  assert.equal(x.reportMark, 'X');
  assert.equal(x.hasAttendance, false);
  assert.equal(x.absenceRecorded, true);
});

test('A del reporte no exige entrada I: puede sustentarse en otra marcación de la jornada', () => {
  const a = employee(row(21803, { source: 'report', reportMark: 'A', entry: '', exit: '06:12:14', firstPunch: `${day}T06:12:14` }));
  assert.equal(a.status, 'present');
  assert.equal(a.entry, null);
  assert.equal(a.exit, '06:12:14');
});

test('sin jornada iniciada no se convierte un estado de reporte nulo en X', () => {
  const a = employee(row(1, { source: 'report', reportMark: null }));
  assert.equal(a.status, 'pending');
  assert.equal(a.reportMark, null);
});

test('reporte A/X deduplica personas y detecta estados contradictorios sin doble conteo', () => {
  const people = buildStaffEmployees([
    row(1, { source: 'report', reportMark: 'A' }), row(1, { source: 'report', reportMark: 'A' }),
    row(2, { source: 'report', reportMark: 'X' }), row(2, { source: 'report', reportMark: 'X' }),
    row(3, { source: 'report', reportMark: 'A' }), row(3, { source: 'report', reportMark: 'X' }),
  ], day);
  const summary = summarizeStaff(people);
  assert.equal(summary.total, 3);
  assert.equal(summary.present, 1);
  assert.equal(summary.absent, 1);
  assert.equal(summary.conflict, 1);
  assert.equal(summary.absenceRate, null);
});

test('actividad del día: usa el catálogo de actividades; sin actividad, agrupa por proceso', () => {
  const people = buildStaffEmployees([row(1, { collector: 1 }), row(2, { collector: 1 }), row(3, { collector: 1 })], day);
  const { employees } = attachStaffLocations(people, [
    location(1),
    // La columna actividad de la vista de obra es la línea: no debe usarse como actividad.
    location(1, { source: 'workday', day, process: 'Pelado', room: '', line: 'OBRA  PELADO ND PROGRAMA', value: 40 }),
    location(1, { source: 'workday', day, process: 'Descabezado', room: '', line: 'OBRA DESCABEZADO PROGRAMA TA (PESADO)', value: 60 }),
    location(2, { source: 'workday', day, process: 'Clasificado', room: '', line: 'Pesado de Cola Clasificado', value: 460 }),
    location(2, { source: 'activity', day, time: '07:00:00', process: 'Clasificado', room: '', line: 'Pesado de Cola Clasificado', activity: 'Pesado de Cola TA' }),
    location(2, { source: 'activity', day, time: '09:00:00', process: 'Recepción', room: '', line: 'Recepcion', activity: 'Fabrica de Hielo TA' }),
  ], day, day);
  assert.equal(employees[0].area, 'Pelado · Sala 1');
  assert.equal(employees[0].activity, 'Descabezado · sin actividad específica');
  assert.deepEqual(employees[0].otherActivities, []);
  assert.equal(employees[1].activity, 'Fabrica de Hielo TA');
  assert.deepEqual(employees[1].otherActivities, ['Pesado de Cola TA']);
  assert.equal(employees[2].activity, 'Sin actividad registrada');
});

const { departmentFromLine, departmentFromPayroll } = require('../dist/services/production-staff-department');
test('departamento de planta según la línea de producción', () => {
  const cases = [
    ['Pelado', 'OBRA  PELADO ND PROGRAMA', '1.3 Pelado Programada'],
    ['Pelado', 'Aux pelado tercero TA ', '1.4 Pelado Tercero'],
    ['Pelado', 'OBRA PELADO ANILLO (PESADO)', '1.5 Pelado Anillo'],
    ['Descabezado', 'Pesado de Cola Descabezado', '1.1 Descabezado'],
    ['Clasificado', 'Clasificado Reproceso Programa 2 TA', '1.2 Clasificado'],
    ['IQF', 'IQF Anillos 126G TA', '1.6 IQF'],
    ['DECORACION ANILLOS', 'Perforacion Anillo TA', '1.11 Decoración Anillos'],
    ['PRODUCCION', 'Reempaque TA', '1.12 Reempaque WSO'],
    ['EMPAQUE', 'Codigo y Etiqueta', '2.1 Bodega, empaque, código'],
    ['PLANILLA ACTIVIDADES', 'Poes', '2.2 Calidad, lavandería y POES'],
    ['AUX. PESADO Y CHEQUEO ', 'Apoyo RRHH y SSO', '2.3 RRHH, gestión ambiental y mantenimiento'],
    ['Recepción', 'Recepcion', '1.8 Recepción'],
  ];
  for (const [process, line, expected] of cases) assert.equal(departmentFromLine(process, line), expected, line);
  assert.equal(departmentFromLine('Clasificado', 'Apoyo Cafeteria '), null);
  assert.equal(departmentFromPayroll('CALIDAD E INOCUIDAD'), '2.2 Calidad, lavandería y POES');
  assert.equal(departmentFromPayroll('PRODUCCION'), null);
});

test('la planilla por fecha respeta ingreso y retiro en lugar de repetir los activos actuales', () => {
  const { PAYROLL_STAFF_QUERY, PAYROLL_STAFF_MOVEMENTS_QUERY } = require('../dist/services/production-staff.queries');
  assert.doesNotMatch(PAYROLL_STAFF_QUERY, /V_RH_EMPLEADOS_DIAS/);
  assert.match(PAYROLL_STAFF_QUERY, /f\.Fecha>=CAST\(e\.FECHA_INGRESO AS date\)/);
  assert.match(PAYROLL_STAFF_QUERY, /e\.ACTIVO=1 OR \(e\.FECHA_RETIRO>='2000-01-01' AND f\.Fecha<=CAST\(e\.FECHA_RETIRO AS date\)\)/);
  assert.match(PAYROLL_STAFF_MOVEMENTS_QUERY, /e\.ACTIVO=0 AND CAST\(e\.FECHA_RETIRO AS date\) BETWEEN/);
});
