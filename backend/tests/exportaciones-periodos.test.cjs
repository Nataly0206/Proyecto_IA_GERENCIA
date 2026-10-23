const assert = require('node:assert/strict');
const { test } = require('node:test');
const sql = require('../dist/services/sql.service');
const cache = require('../dist/utils/ttlCache');
const originalSql = sql.runQuery;
const originalCache = cache.withTtlCache;
const rows = [
  { Dia:'2025-12-29', Cliente:'FRANCIA', Estilo:'ANILLOS', Libras:100 },
  { Dia:'2025-12-30', Cliente:'FRANCIA', Estilo:'ANILLOS', Libras:50 },
  { Dia:'2026-01-01', Cliente:'UK', Estilo:'ANILLOS', Libras:200 },
  { Dia:'2026-01-01', Cliente:'FRANCIA', Estilo:'PTO', Libras:25 },
  { Dia:'2026-01-05', Cliente:'UK', Estilo:'PTO', Libras:75 },
];
const filters = { fechaInicial:'2025-12-29', fechaFinal:'2026-01-05' };

test('Exportaciones conserva libras por período, estilo y cliente, sin duplicar totales', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-05T18:00:00Z') });
  let params;
  sql.runQuery = async (_query, value) => { params = value; const start=value.find(x=>x.name==='Fecha_Inicial').value; const end=value.find(x=>x.name==='Fecha_Final').value; return rows.filter(row=>row.Dia>=start&&row.Dia<=end); };
  cache.withTtlCache = async (_key, _ttl, get) => get();
  try {
    const service = require('../dist/services/procesos.service');
    const sum = values => values.reduce((a,x)=>a+Number(x.libras),0);
    for (const period of ['total','dia','semana','mes']) {
      const data = await service.getExportacionesPorEstilo(filters,[],period);
      assert.equal(sum(data),period==='mes'?300:450);
      assert.equal(sum(data.filter(x=>x.cliente==='FRANCIA')),period==='mes'?25:175);
      assert.equal(sum(data.filter(x=>x.cliente==='UK')),275);
      assert.equal(sum(data.filter(x=>x.estilo==='ANILLOS')),period==='mes'?200:350);
      assert.equal(new Set(data.map(x=>JSON.stringify([x.periodo,x.estilo,x.cliente]))).size,data.length);
    }
    const weeks = await service.getExportacionesPorEstilo(filters,[],'semana');
    assert.deepEqual([...new Set(weeks.map(x=>x.periodo))],['2026-W01','2026-W02']);
    assert.equal(sum(weeks.filter(x=>x.periodo==='2026-W01')),375);
    const months = await service.getExportacionesPorEstilo(filters,[],'mes');
    assert.ok(months.every(x=>String(x.periodo).startsWith('2026-')));
    assert.equal(sum(months.filter(x=>x.periodo==='2026-01')),300);
    assert.equal(params.find(x=>x.name==='Fecha_Inicial').value,'2026-01-01');
    assert.equal(params.find(x=>x.name==='Fecha_Final').value,'2026-12-31');
    assert.equal(new Set(months.map(x=>x.periodo)).size,12);
    assert.ok(months.filter(x=>x.periodo==='2026-12').every(x=>x.libras===0));
    await service.getExportacionesPorEstilo({fechaInicial:'2020-01-01',fechaFinal:'2020-01-02'},['UK'],'mes');
    assert.equal(params.find(x=>x.name==='Fecha_Inicial').value,'2020-01-01');
    assert.equal(params.find(x=>x.name==='Fecha_Final').value,'2020-12-31');
    const excluded = await service.getExportacionesPorEstilo(filters,['UK'],'dia');
    assert.equal(sum(excluded),175);
    assert.ok(excluded.every(x=>x.cliente==='FRANCIA'));
    const legacy = await service.getExportacionesPorEstilo(filters);
    assert.equal(sum(legacy),450);
    assert.equal(legacy.length,2);
    assert.ok(legacy.every(x=>typeof x.porcentaje==='number'));
    assert.equal(params.find(x=>x.name==='Fecha_Inicial').value,filters.fechaInicial);
    assert.equal(params.find(x=>x.name==='Fecha_Final').value,filters.fechaFinal);
  } finally { sql.runQuery=originalSql; cache.withTtlCache=originalCache; }
});

test('El controlador valida períodos y separa sus claves de caché', async () => {
  const keys=[];
  sql.runQuery=async()=>rows;
  cache.withTtlCache=async(key,_ttl,get)=>{ keys.push(key); return get(); };
  try {
    const controller=require('../dist/controllers/procesos.controller');
    for(const periodo of ['total','dia','semana','mes']){
      let response;
      await controller.getExportacionesPorEstilo({query:{...filters,periodo}}, {json:data=>{response=data;}});
      assert.ok(Array.isArray(response));
    }
    const outerKeys=keys.filter(key=>key.includes('exportaciones-por-estilo:despachos-clientes-v4'));
    assert.equal(new Set(outerKeys).size,4);
    let status;
    await controller.getExportacionesPorEstilo({query:{...filters,periodo:'invalido'}}, {status:code=>{status=code;return {json:()=>{}};}});
    assert.equal(status,400);
  } finally { sql.runQuery=originalSql; cache.withTtlCache=originalCache; }
});
