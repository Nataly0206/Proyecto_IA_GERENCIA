const {test}=require('node:test');
const assert=require('node:assert/strict');
const {referenceStatus,compareStaffReference}=require('../dist/utils/staffReportReference');
test('referencia conserva permisos y descansos fuera de X y rechaza marcas desconocidas',()=>{
  assert.equal(referenceStatus('A'),'present');assert.equal(referenceStatus('X'),'absent');
  assert.equal(referenceStatus('PERMISO SIN SUELDO'),'excused');assert.equal(referenceStatus('INCAPACIDAD'),'excused');
  assert.equal(referenceStatus('DÍA LIBRE'),'off');assert.throws(()=>referenceStatus('N/A'));
});
test('iguales totales no bastan: concilia estado por ID y detecta población extra',()=>{
 const ref=[{id:1,status:'present'},{id:2,status:'absent'},{id:3,status:'excused'}];
 const comparison=compareStaffReference(ref,[{id:1,status:'absent'},{id:2,status:'present'},{id:4,status:'excused'}]);
 assert.equal(comparison.matched,0);assert.equal(comparison.mismatches.length,3);assert.deepEqual(comparison.extraIds,[4]);
 assert.equal(comparison.mismatches[2].actual,'missing');
 assert.throws(()=>compareStaffReference([...ref,ref[0]],[]));
});
