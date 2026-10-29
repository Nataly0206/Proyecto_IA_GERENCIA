const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summaryPeriods,summarizeSamples}=require('../dist/utils/processSummary');

test('períodos calendario: semana de lunes y cruce de año',()=>{
 const periods=summaryPeriods('2026-01-01');
 assert.equal(periods.find(p=>p.key==='week').from,'2025-12-29');
 assert.equal(periods.find(p=>p.key==='year').from,'2026-01-01');
 assert.equal(summaryPeriods('2026-10-29').find(p=>p.key==='week').from,'2026-10-26');
 assert.equal(summaryPeriods('2026-10-26').find(p=>p.key==='week').from,'2026-10-26');
 assert.equal(summaryPeriods('2026-11-01').find(p=>p.key==='week').from,'2026-10-26');
});
test('cociente de sumas y promedio IQF conservan sus distintos criterios',()=>{
 const samples=[{day:'2026-10-28',pounds:100,hours:1},{day:'2026-10-29',pounds:900,hours:3}];
 assert.equal(summarizeSamples(samples,'2026-10-01','2026-10-29').rate,250);
 assert.equal(summarizeSamples(samples,'2026-10-01','2026-10-29',true).rate,200);
 assert.equal(summarizeSamples(samples,'2026-10-29','2026-10-29').rate,300);
});
test('sin intervalo válido no se inventa rendimiento; cero real se conserva',()=>{
 const samples=[{day:'2026-10-29',pounds:100,hours:0},{day:'2026-10-30',pounds:900,hours:3}];
 assert.equal(summarizeSamples(samples,'2026-10-29','2026-10-29').rate,null);
 assert.equal(summarizeSamples([{day:'2026-10-29',pounds:0,hours:2}],'2026-10-29','2026-10-29').rate,0);
 assert.equal(summarizeSamples([{day:'2026-10-29',pounds:100,hours:-1}],'2026-10-29','2026-10-29').rate,null);
});
