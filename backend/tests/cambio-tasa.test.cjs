const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalcularTasa } = require('../dist/services/cambio-tasa');
const rows = () => Array.from({length:24},(_,i)=>({numero:i+1,fecha:`2028-${String(i%12+1).padStart(2,'0')}-09`,capital:1000,interes:100,cargos:25,pagado:i<17?1125:0,interesDiferido:0}));
test('17 cuotas pagadas: cambia desde 18, conserva originales y liquida capital pendiente',()=>{
 const cuotas=rows(), original=JSON.stringify(cuotas);
 const plan=recalcularTasa(cuotas,18,16,'cuota_fija','mensual');
 assert.equal(JSON.stringify(cuotas),original);
 assert.equal(plan.cuotas.length,7);
 assert.equal(plan.cuotas[0].numero,18);
 assert.equal(plan.cuotas[0].interes,93.30);
 assert.equal(plan.cuotas[6].saldo,0);
 assert.equal(Math.round(plan.cuotas.reduce((s,q)=>s+q.capital,0)*100),700000);
 assert.ok(plan.cuotas.every(q=>q.cargos===25));
});
test('irregular conserva capital y cargos, respeta diferidos y admite 0%',()=>{
 const cuotas=rows();cuotas[17].interesDiferido=15;
 const plan=recalcularTasa(cuotas,18,0,'personalizado','semestral');
 assert.equal(plan.cuotas[0].interes,15);
 assert.ok(plan.cuotas.every(q=>q.capital===1000 && q.cargos===25));
 assert.equal(plan.cuotas[6].saldo,0);
});
test('protege pagos completos y parciales en cualquier cuota afectada',()=>{
 assert.throws(()=>recalcularTasa(rows(),17,16,'cuota_fija','mensual'),/pagos/);
 const cuotas=rows();cuotas[22].pagado=1;
 assert.throws(()=>recalcularTasa(cuotas,18,16,'cuota_fija','mensual'),/pagos/);
});
test('valida cuota, tasa y tipo de plan',()=>{
 for(const tasa of [-1,201,NaN,16.12345]) assert.throws(()=>recalcularTasa(rows(),18,tasa,'cuota_fija','mensual'));
 assert.throws(()=>recalcularTasa(rows(),99,16,'cuota_fija','mensual'),/no existe/);
 assert.throws(()=>recalcularTasa(rows(),18,16,'balon','mensual'),/reprogramar/);
});
