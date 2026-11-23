process.env.CACHE_ENABLED='false';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildStaffEmployees,buildStaffHistory,summarizeStaff,staffKind,payrollTime}=require('../dist/services/production-staff.model');
const {attachStaffLocations}=require('../dist/services/production-staff-location.model');
const {attachProductionStaffShifts}=require('../dist/services/production-staff-shift');
const {validStaffDate,mapPayrollStaffRow,getProductionStaff}=require('../dist/services/production-staff.service');
const q=require('../dist/services/production-staff.queries');
const day='2026-11-20';
const row=(id,extra={})=>({id,day,code:String(id),name:`Persona ${id}`,department:'PRODUCCION',division:'PRODUCCION',job:'DESTAJO',shift:'',source:'payroll',actionCode:'',action:'',collector:0,noProduction:false,entry:'',exit:'',hours:'',...extra});
const person=(...rows)=>buildStaffEmployees(rows,day)[0];

test('pagos no prueban presencia y las fuentes externas no agregan personas fuera del padrón',()=>{
 for(const source of ['payment','clock','attendance','report','calendar']){
  const external=row(1,{source,reportMark:'A',entry:'06:00:00',punchCount:1});
  assert.equal(buildStaffEmployees([external],day).length,0);
  if(source!=='clock')assert.equal(person(row(1),external).status,'pending');
 }
 const p=person(row(1,{reportMark:'A',entry:'06:00:00'}));
 assert.equal(p.status,'pending');assert.equal(p.entry,null);
});
test('obra confirma asistencia con la primera pesa válida aunque no tenga chequeo o pago',()=>{
 const p=person(row(1),row(1,{source:'weighing',entry:'08:00:00'}),row(1,{source:'weighing',entry:'06:20:00'}));
 assert.equal(p.status,'present');assert.equal(p.entry,'06:20:00');assert.match(p.reason,/primera pesa/);
 assert.equal(summarizeStaff([p]).total,1);
});
test('chequeo de auxiliares o máquinas confirma desde el inicio y conserva horas',()=>{
 for(const job of ['AUXILIARES DE PELADO','COMODIN','CLASIFICADO','AUXILIAR DE SALMUERA IQF']){
  const p=person(row(1,{job}),row(1,{job,source:'activity',entry:'06:00:00',exit:'07:00:00'}),row(1,{job,source:'activity',entry:'07:00:00',exit:'12:00:00'}));
  assert.equal(p.status,'present');assert.equal(p.entry,'06:00:00');assert.equal(p.exit,'12:00:00');
 }
});
test('chequeo sin hora válida no prueba presencia; chequeo iniciado confirma también obra',()=>{
 for(const entry of ['','25:00:00'])assert.equal(person(row(1,{job:'AUXILIAR'}),row(1,{source:'activity',entry})).status,'pending');
 assert.equal(person(row(1),row(1,{source:'activity',entry:'06:00:00'})).status,'present');
 assert.equal(person(row(1),row(1,{source:'weighing'})).status,'present','pesa válida con hora nula conserva la evidencia');
});
test('faltas, permisos, incapacidades y descansos se mantienen separados',()=>{
 for(const code of ['013','A039','009'])assert.equal(person(row(1,{actionCode:code})).status,'absent');
 for(const code of ['014','026'])assert.equal(person(row(1,{actionCode:code})).status,'excused');
 for(const code of ['007','035'])assert.equal(person(row(1,{actionCode:code})).status,'off');
 assert.equal(person(row(1,{actionCode:'040'})).status,'noProduction');
 assert.equal(person(row(1,{actionCode:'011',action:'FERIADO TRABAJADO'})).status,'pending','una etiqueta no reemplaza evidencia operativa');
});
test('pesa o chequeo con una novedad incompatible se conserva para revisión',()=>{
 const p=person(row(1,{actionCode:'013'}),row(1,{source:'weighing',entry:'06:00:00'}));
 assert.equal(p.status,'conflict');assert.equal(p.absenceRecorded,true);assert.equal(p.hasAttendance,true);
 assert.equal(summarizeStaff([p]).absent,0);
 assert.equal(person(row(1,{job:'AUXILIAR',actionCode:'026'}),row(1,{source:'activity',entry:'07:00:00'})).status,'conflict');
});
test('sin evidencia queda pendiente, sin trasladar faltas o pesas de otros días',()=>{
 const records=[row(1),row(1,{day:'2026-11-19',source:'weighing',entry:'06:00:00'}),row(1,{day:'2026-11-19',actionCode:'013'})];
 assert.equal(person(...records).status,'pending');
 const h=buildStaffHistory(records,day,day,new Date('2026-11-22T18:00:00Z'))[0];
 assert.equal(h.absent,0);assert.equal(h.pending,1);assert.equal(h.provisionalAbsent,0);assert.equal(h.derivedAbsent,0);assert.equal(h.confirmedAbsent,0);assert.equal(h.absenceDataAvailable,true);
});
test('no cruza identidades por el solo código y descarta IDs inválidos',()=>{
 assert.equal(person(row(1),row(1,{source:'activity',name:'Otra Persona',entry:'06:00:00'})).status,'conflict');
 assert.equal(buildStaffEmployees([row(0),row(1.5),row(-1)],day).length,0);
});
test('clasifica por puesto, sin conceptos de pago',()=>{
 for(const [job,kind] of [['DESTAJO','production'],['DECORACION ANILLO','production'],['REEMPAQUE','production'],['CLASIFICADO','machine'],['MAQUINISTA','machine'],['AUXILIAR DE SALMUERA IQF','auxiliary'],['COMODIN','auxiliary'],['SUPERVISOR','supervisor'],['APOYO A SUPERVISOR','auxiliary']])assert.equal(staffKind(job),kind);
 assert.equal(person(row(1,{job:'AUXILIAR'}),row(1,{source:'payment',paymentConcept:'OBRA PELADO'})).kind,'auxiliary');
});
test('histórico deduplica persona por día y mantiene estados y totales',()=>{
 const rows=[row(1),row(1,{source:'weighing',entry:'06:00:00'}),row(1,{source:'weighing',entry:'07:00:00'}),row(1,{source:'clock',entry:'06:00:00',punchCount:1}),row(2,{actionCode:'013'}),row(3,{actionCode:'014'}),row(4,{actionCode:'007'})];
 const h=buildStaffHistory(rows,day,'2026-11-21');assert.equal(h.length,2);
 assert.equal(h[0].total,4);assert.equal(h[0].present,1);assert.equal(h[0].absent,1);assert.equal(h[0].excused,1);assert.equal(h[0].off,1);assert.equal(h[0].absenceRate,50);assert.equal(h[1].total,0);
});
test('conserva todos los tramos, actividad actual, línea y duración sin duplicar persona',()=>{
 const p=person(row(1,{job:'AUXILIAR'}),row(1,{source:'activity',entry:'06:00:00'}));
 const events=[
  {id:1,name:p.name,source:'activity',day,time:'06:00:00',endTime:'07:00:00',process:'Pelado',room:'',line:'PELADO TA',activity:'Apoyo pelado'},
  {id:1,name:p.name,source:'activity',day,time:'07:00:00',endTime:'10:00:00',process:'IQF',room:'',line:'IQF TA',activity:'Empaque'},
 ];
 const result=attachStaffLocations([p],events,day,day).employees[0];
 assert.equal(result.dailyActivities.length,2);assert.equal(result.dailyActivities[0].hours,1);assert.equal(result.dailyActivities[1].hours,3);
 assert.equal(result.dailyActivities[0].process,'Pelado');assert.equal(result.dailyActivities[1].area,'IQF');assert.equal(result.dailyActivities[1].line,'IQF TA');
 assert.equal(result.activity,'Empaque');assert.deepEqual(result.otherActivities,['Apoyo pelado']);assert.equal(result.status,'present');assert.match(result.area,/IQF/);
});
test('ubicación histórica o asignación activa no confirma asistencia',()=>{
 const p=person(row(1));
 const loc={id:1,name:p.name,source:'production',day:'2026-11-19',time:'09:00:00',process:'Pelado',room:'Sala 2',line:''};
 const result=attachStaffLocations([p],[loc],day,day).employees[0];
 assert.equal(result.status,'pending');assert.equal(result.area,'Pelado · Sala 2');
 assert.equal(attachStaffLocations([p],[{...loc,name:'Otra Persona'}],day,day).unverified,1);
});
test('el turno solo usa líneas verificadas de chequeo',()=>{
 const ref={id:1,name:'Persona 1',active:true,currentLine:'PELADO TB',previousLine:'',previousLineDay:'',dayDeadline:null,nightDeadline:null,nightEnd:null};
 const result=attachProductionStaffShifts([row(1),row(2)],day,[ref]);
 assert.equal(result[0].productionShift.shift,'B');assert.match(result[0].productionShift.basis,/chequeo/);assert.equal(result[1].productionShift,undefined);
});
test('servicio combina biométrico y pagos sin agregar personas fuera del padrón',async()=>{
 const payroll=require('../dist/services/payroll.service'),stb=require('../dist/services/stb.service');
 const originalPayroll=payroll.runPayrollQuery,originalStb=stb.runStbQuery;
 const calls=[];
 try{
  payroll.runPayrollQuery=async(query)=>{calls.push(query);if(query!==q.PAYROLL_STAFF_COMPLEMENT_QUERY)return [];return [{Dia:day,IdEmpleado:1,Nombre:'Persona 1',Puesto:'DESTAJO',Fuente:'payroll'}]};
  stb.runStbQuery=async(query)=>{calls.push(query);if(query===q.STB_FIRST_WEIGHING_QUERY)return [1,2].map(IdEmpleado=>({Dia:day,IdEmpleado,Fuente:'weighing',Entrada:'06:00:00'}));if(query===q.STB_ACTIVITY_ATTENDANCE_QUERY)return [];return []};
  const result=await getProductionStaff(day,true);assert.equal(result.summary.total,1);assert.equal(result.summary.present,0);assert.equal(result.employees[0].hasAttendance,true);
  assert.equal(result.employees[0].firstPunch,null);assert.deepEqual(result.employees[0].paymentConcepts,[]);
  assert.ok(calls.includes(q.PAYROLL_BIOMETRIC_ATTENDANCE_QUERY));assert.ok(calls.includes(q.PAYROLL_POSITIVE_PAYMENT_QUERY));
 }finally{payroll.runPayrollQuery=originalPayroll;stb.runStbQuery=originalStb}
});
test('si falla chequeo o pesa devuelve error, nunca conteos en cero',async()=>{
 const payroll=require('../dist/services/payroll.service'),stb=require('../dist/services/stb.service');const p=payroll.runPayrollQuery,s=stb.runStbQuery;
 try{payroll.runPayrollQuery=async()=>[];stb.runStbQuery=async()=>{throw Error('sin acceso')};await assert.rejects(()=>getProductionStaff(day,true),e=>e.statusCode===503)}finally{payroll.runPayrollQuery=p;stb.runStbQuery=s}
});
test('validación de fechas y horas mapea marcas y excluye conceptos de pago',()=>{
 assert.equal(validStaffDate(day,day),true);assert.equal(validStaffDate('2026-02-30',day),false);assert.equal(validStaffDate('2026-11-21',day),false);assert.equal(validStaffDate([day],day),false);
 assert.equal(payrollTime('06:30'),'06:30:00');assert.equal(payrollTime('236099'),null);
 const mapped=mapPayrollStaffRow({Dia:day,IdEmpleado:1,ConceptoPago:'OBRA',PrimeraMarca:'2026-11-20T05:00:00'});assert.equal(mapped.paymentConcept,undefined);assert.equal(mapped.firstPunch,'2026-11-20T05:00:00');
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


test('sin evidencia queda pendiente en resumen, salas e histórico; solo novedades registran faltas',()=>{
 const {staffAreaRows}=require('../dist/services/production-staff.model');
 const records=[row(1),row(2,{job:'AUXILIAR'}),row(3,{actionCode:'026'}),row(4,{actionCode:'014'}),row(5,{actionCode:'007'}),row(6,{actionCode:'040'})];
 const people=buildStaffEmployees(records,day),summary=summarizeStaff(people);
 assert.equal(summary.absent,0);assert.equal(summary.derivedAbsent,0);assert.equal(summary.pending,2);assert.equal(summary.confirmedAbsent,0);
 assert.equal(summary.excused,2);assert.equal(summary.off,1);assert.equal(summary.noProduction,1);
 assert.ok(people.filter(p=>p.status==='absent').every(p=>p.derivedAbsence&&!p.absenceRecorded&&p.reportMark==='X'));
 assert.equal(staffAreaRows(people).find(r=>r.area==='Sin sala/área asignada').absent,0);
 const history=buildStaffHistory(records,day,day)[0];assert.equal(history.absenceDataAvailable,true);assert.equal(history.absent,0);
 const later=buildStaffEmployees([...records,row(1,{source:'weighing',entry:'08:00:00'}),row(2,{source:'activity',entry:'08:00:00'})],day);
 assert.equal(summarizeStaff(later).absent,0);assert.equal(summarizeStaff(later).present,0);
});


test('turnos A, B y desconocido sin evidencia quedan pendientes durante el día; Payroll mantiene faltas explícitas',()=>{
 const now=new Date('2026-11-20T18:00:00Z');
 const shift=(value)=>({shift:value,basis:'Línea del chequeo',active:true,entranceDeadline:null,nightEnd:null});
 const rows=[row(1,{productionShift:shift('A')}),row(2,{productionShift:shift('B')}),row(3),row(4,{productionShift:shift('B'),actionCode:'013'})];
 const people=buildStaffEmployees(rows,day,now);
 assert.deepEqual(people.map(p=>p.status),['pending','pending','pending','absent']);
 assert.ok(people.slice(0,3).every(p=>!p.derivedAbsence&&p.reportMark===null));
 assert.equal(summarizeStaff(people).absent,1);
 const history=buildStaffHistory(rows,day,day,now)[0];
 assert.equal(history.absent,1);assert.equal(history.pending,3);
 assert.equal(history.shifts.find(s=>s.shift==='B').absent,1);
 assert.equal(history.shifts.reduce((sum,s)=>sum+s.total,0),history.total);
});
test('turno nocturno no se cierra a medianoche; una pesa confirma asistencia sin esperar el cierre',()=>{
 const productionShift={shift:'B',basis:'Última línea de chequeo',active:true,entranceDeadline:null,nightEnd:null};
 const rows=[row(1,{productionShift})];
 assert.equal(buildStaffEmployees(rows,day,new Date('2026-11-21T07:00:00Z'))[0].status,'pending');
 assert.equal(buildStaffEmployees(rows,day,new Date('2026-11-22T07:00:00Z'))[0].status,'pending');
 assert.equal(buildStaffEmployees([...rows,row(1,{source:'weighing',entry:'21:00:00'})],day,new Date('2026-11-21T07:00:00Z'))[0].status,'present');
});
test('el chequeo actual reemplaza el turno histórico y no se cruzan identidades',()=>{
 const ref={id:1,name:'Persona 1',active:true,currentLine:'PELADO TA',previousLine:'PELADO TB',previousLineDay:'2026-11-19',dayDeadline:null,nightDeadline:null,nightEnd:null};
 assert.equal(attachProductionStaffShifts([row(1)],day,[ref])[0].productionShift.shift,'A');
 const previous=attachProductionStaffShifts([row(1)],day,[{...ref,currentLine:''}])[0];
 assert.equal(previous.productionShift.shift,'B');assert.match(previous.productionShift.basis,/2026-11-19/);
 assert.equal(attachProductionStaffShifts([row(1)],day,[{...ref,name:'Otra Persona'}])[0].productionShift,undefined);
});


test('biométrico deduplica empleados, distingue entrada y salida, y concilia pagos sin confundirlos con chequeos',()=>{
 const rows=[row(1),row(2),row(3),row(4),
  row(1,{source:'clock',entry:'06:00:00',exit:'14:00:00',firstPunch:'06:00:00',lastPunch:'14:00:00',punchCount:3}),
  row(2,{source:'clock',exit:'02:00:00',firstPunch:'02:00:00',lastPunch:'02:00:00',punchCount:1}),
  row(3,{source:'payment'}),row(1,{source:'payment'}),
  row(4,{source:'activity',entry:'07:00:00',line:'PELADO TA'})];
 const people=buildStaffEmployees(rows,day),summary=summarizeStaff(people);
 assert.equal(summary.total,4);assert.equal(summary.biometricMarked,2);assert.equal(summary.biometricEntry,1);
 assert.equal(summary.biometricReview,1);assert.equal(summary.biometricWithoutPayment,1);assert.equal(summary.checkedPeople,1);
 assert.equal(people[0].firstPunch,'06:00:00');assert.equal(people[0].lastPunch,'14:00:00');assert.equal(people[0].punchCount,3);
 assert.equal(people[1].status,'conflict');assert.equal(people[1].absenceRecorded,false);assert.equal(people[1].reportMark,null);
 assert.equal(people[2].status,'pending');assert.equal(people[3].status,'present');assert.equal(summary.absent,0);
});

test('servicio cuenta biométricos sin pago y conserva chequeos fuera del conteo de marcaciones',async()=>{
 const payroll=require('../dist/services/payroll.service'),stb=require('../dist/services/stb.service');const p=payroll.runPayrollQuery,s=stb.runStbQuery;
 try{
  payroll.runPayrollQuery=async(query)=>query===q.PAYROLL_STAFF_COMPLEMENT_QUERY?[1,2].map(IdEmpleado=>({Dia:day,IdEmpleado,Nombre:`Persona ${IdEmpleado}`,Puesto:'DESTAJO',Fuente:'payroll'})):query===q.PAYROLL_BIOMETRIC_ATTENDANCE_QUERY?[{Dia:day,IdEmpleado:1,Fuente:'clock',Entrada:'06:00:00',PrimeraMarca:'06:00:00',UltimaMarca:'06:00:00',CantidadMarcas:1},{Dia:day,IdEmpleado:2,Fuente:'clock',Salida:'02:00:00',PrimeraMarca:'02:00:00',UltimaMarca:'02:00:00',CantidadMarcas:1},{Dia:day,IdEmpleado:999,Fuente:'clock',Entrada:'06:00:00',CantidadMarcas:1}]:query===q.PAYROLL_POSITIVE_PAYMENT_QUERY?[{Dia:day,IdEmpleado:2,Fuente:'payment'}]:[];
  stb.runStbQuery=async()=>[];
  const result=await getProductionStaff(day,true);
  assert.equal(result.summary.total,2);assert.equal(result.summary.biometricMarked,2);assert.equal(result.summary.biometricEntry,1);assert.equal(result.summary.biometricReview,1);assert.equal(result.summary.biometricWithoutPayment,1);
 }finally{payroll.runPayrollQuery=p;stb.runStbQuery=s}
});


test('recorrido conserva cambios de lugar, tramos nocturnos y final abierto; no agrega ubicaciones históricas',()=>{
 const p=person(row(1));
 const base={id:1,name:p.name,source:'activity',day,process:'Pelado',room:'',line:'PELADO TB',activity:'Apoyo'};
 const events=[{...base,time:'22:00:00',endTime:'02:00:00'},
  {...base,time:'23:00:00',endTime:'',process:'IQF',line:'IQF TB'},
  {...base,day:'2026-11-19',time:'20:00:00',endTime:'21:00:00'},
  {...base,source:'assignment',day:'',time:'',endTime:''}];
 const result=attachStaffLocations([p],events,day,day).employees[0];
 assert.equal(result.dailyActivities.length,2);assert.equal(result.dailyActivities[0].hours,4);
 assert.equal(result.dailyActivities[1].end,null);assert.equal(result.dailyActivities[1].hours,null);
 assert.equal(result.dailyActivities[1].line,'IQF TB');assert.equal(result.dailyActivities[1].area,'IQF');
});


test('actividad principal usa el último chequeo y separa empates simultáneos sin asignación arbitraria',()=>{
 const p=person(row(1));
 const base={id:1,name:p.name,source:'activity',day,time:'06:00:00',endTime:'07:00:00',process:'Pelado',room:'',line:'PELADO TA',activity:'Apoyo'};
 const latest={...base,time:'08:00:00',endTime:'',process:'IQF',line:'IQF TA',activity:'Empaque'};
 const result=attachStaffLocations([p],[latest,base],day,day).employees[0];
 assert.equal(result.activity,'Empaque');assert.deepEqual(result.activityAssignment,{source:'check',process:'IQF',line:'IQF TA',start:'08:00:00',end:null});
 const ambiguous=attachStaffLocations([p],[latest,{...base,time:'08:00:00'}],day,day).employees[0];
 assert.equal(ambiguous.activity,'Actividad por confirmar');assert.equal(ambiguous.activityAssignment.source,'conflict');assert.equal(ambiguous.dailyActivities.length,2);
});
test('sin chequeo usa el último proceso pesado y no infiere actividad desde ubicación histórica',()=>{
 const p=person(row(1));
 const base={id:1,name:p.name,source:'production',day,time:'06:00:00',process:'Pelado',room:'Sala 2',line:''};
 const result=attachStaffLocations([p],[{...base,time:'09:00:00',process:'Descabezado'},base],day,day).employees[0];
 assert.equal(result.activityAssignment.source,'weighing');assert.equal(result.activityAssignment.process,'Descabezado');
 const unknown=attachStaffLocations([p],[{...base,day:'2026-11-19'}],day,day).employees[0];
 assert.equal(unknown.activity,'Sin actividad registrada');assert.equal(unknown.activityAssignment.source,'unknown');
});


test('Asistieron suma solo entradas biométricas, sin sumar pesa, chequeo ni salida sola',()=>{
 const rows=[row(1),row(2),row(3),row(4),
  row(1,{source:'clock',entry:'06:00:00',punchCount:2}),
  row(2,{source:'weighing',entry:'07:00:00'}),
  row(3,{source:'activity',entry:'08:00:00'}),
  row(4,{source:'clock',exit:'02:00:00',punchCount:1})];
 const people=buildStaffEmployees(rows,day),summary=summarizeStaff(people);
 assert.equal(summary.present,1);assert.equal(summary.biometricEntry,1);assert.equal(summary.biometricMarked,2);
 assert.equal(summary.absenceRate,null);
 const areas=require('../dist/services/production-staff.model').staffAreaRows(people);
 assert.equal(areas.reduce((sum,area)=>sum+area.present,0),1);
 const history=buildStaffHistory(rows,day,day)[0];assert.equal(history.present,1);assert.equal(history.presentProduction,1);
});
