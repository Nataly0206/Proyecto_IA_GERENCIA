const {test}=require('node:test');
const assert=require('node:assert/strict');
const stb=require('../dist/services/stb.service');
const plant=require('../dist/services/sql.service');
const cache=require('../dist/utils/ttlCache');
let reads=[];
const values=new Map();
cache.withTtlCache=async(key,ttl,loader,force=false)=>{
 if(!force&&values.has(key))return values.get(key);
 const value=await loader();values.set(key,value);return value;
};
const read=async(query,params)=>{
 const from=params.find(p=>p.name==='Fecha_Inicial').value;
 const to=params.find(p=>p.name==='Fecha_Final').value;
 reads.push({from,to});
 const current=from===to;
 return [{Dia:to,Libras:current?600:100,Horas:current?3:2,TotalLibras:current?600:100,TiempoHorasDecimales:current?3:2}];
};
stb.runStbQuery=read;plant.runQuery=read;
const {getProcessSummary}=require('../dist/services/process-summary.service');

test('carga por proceso, comparte histórico y actualiza solo hoy sin alterar acumulados',async()=>{
 const today='2026-10-29';
 const first=await getProcessSummary(today,false,'Descabezado');
 assert.equal(reads.length,2);
 assert.equal(first.rows.length,1);
 assert.equal(first.rows[0].values.year.rate,140);
 assert.equal(first.rows[0].values.today.rate,200);
 const all=await getProcessSummary(today);
 assert.equal(reads.length,8);
 assert.equal(all.rows.length,4);
 assert.equal(all.rows[3].values.year.rate,125);
 await getProcessSummary(today);assert.equal(reads.length,8);
 // Simulate eviction of the shared Redis/local layer. Long history stays in memory.
 values.clear();reads=[];
 const refreshed=await getProcessSummary(today,true);
 assert.equal(reads.length,4);
 assert.ok(reads.every(row=>row.from===today&&row.to===today));
 assert.deepEqual(refreshed.rows,all.rows);
 // A failed cold history is retried rather than cached as empty data.
 plant.runQuery=async()=>{throw new Error('SQL unavailable')};
 await assert.rejects(getProcessSummary('2026-10-30',false,'IQF'),/SQL unavailable/);
 plant.runQuery=read;
 const retry=await getProcessSummary('2026-10-30',false,'IQF');
 assert.equal(retry.rows.length,1);
});
