const assert=require('node:assert/strict');
const {test}=require('node:test');
const {plan,makePdf}=require('./telegram-fixtures.cjs');
const {normalizeImportedLoan,importedLoanErrors,importedLoanToPlan}=require('../dist/telegram/plan');
const {readDocument,documentMime}=require('../dist/telegram/extract');

test('El plan importado conserva fechas y todos los importes contractuales, sin fórmulas',()=>{
 const result=importedLoanToPlan(normalizeImportedLoan(plan),5);
 assert.equal(result.input.tipoAmortizacion,'manual');
 assert.equal(result.input.frecuencia,'mensual');
 assert.equal(result.plan.totalPagar,1130.35);
 for(let i=0;i<plan.cuotas.length;i++)for(const key of ['numero','fechaVencimiento','capital','interes','cargos','monto'])assert.equal(result.plan.cuotas[i][key],plan.cuotas[i][key]);
 assert.deepEqual(result.plan.cuotas.map(x=>x.saldo),[800,500,0]);
});
test('Bloquea fechas ambiguas, cuotas incompletas, sumas distintas y decimales adicionales',()=>{
 for(const patch of [
 {fechaDesembolso:null},{moneda:null},{tasaAnual:null},{cantidadCuotas:4},
 {cuotas:plan.cuotas.map((x,i)=>i?x:{...x,fechaVencimiento:'03/11/26'})},
 {cuotas:plan.cuotas.map((x,i)=>i?x:{...x,monto:272.28})},
 {cuotas:plan.cuotas.map((x,i)=>i?x:{...x,capital:200.001})},
 {cuotas:plan.cuotas.map((x,i)=>i?x:{...x,numero:2})},
 {cuotas:plan.cuotas.map((x,i)=>i?x:{...x,interes:null})},
 ]){
  const data=normalizeImportedLoan({...plan,...patch});assert.ok(importedLoanErrors(data).length);assert.throws(()=>importedLoanToPlan(data,5));
 }
});
test('Lee el PDF completo y rechaza archivos que solo aparentan ser PDF',async()=>{
 const result=await readDocument(makePdf());assert.equal(result.mime,'application/pdf');assert.match(result.text,/70\.12/);assert.match(result.text,/2026-12-09/);assert.deepEqual(result.images,[]);
 assert.throws(()=>documentMime(Buffer.from('<html>archivo.pdf</html>')));
 await assert.rejects(()=>readDocument(Buffer.alloc(0)));
});
