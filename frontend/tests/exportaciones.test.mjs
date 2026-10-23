import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/utils/exportaciones.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {groupExportRows:group}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const rows=[
 {periodo:'2026-01-01',estilo:'ANILLOS',cliente:'FRANCIA',libras:100},
 {periodo:'2026-01-01',estilo:'ANILLOS',cliente:'UK',libras:200},
 {periodo:'2026-01-01',estilo:'PTO',cliente:'FRANCIA',libras:50},
 {periodo:'2026-01-02',estilo:'ANILLOS',cliente:'FRANCIA',libras:25},
];
const sum=data=>data.reduce((value,row)=>value+row.libras,0);
test('Las vistas estilo, cliente y cruce conservan el total y separan las fechas',()=>{
 for(const dimension of ['estilo','cliente','ambos'])assert.equal(sum(group(rows,dimension,'lbs')),375);
 assert.equal(group(rows,'estilo','lbs').find(x=>x.periodo==='2026-01-01'&&x.grupo==='ANILLOS').libras,300);
 assert.equal(group(rows,'cliente','lbs').find(x=>x.periodo==='2026-01-01'&&x.grupo==='FRANCIA').libras,150);
 assert.equal(group(rows,'ambos','lbs').length,4);
});
test('Total suma cada cliente una vez y convierte a kilos al final',()=>{
 const totals=rows.map(row=>({...row,periodo:'Total'}));
 const clients=group(totals,'cliente','lbs');
 assert.equal(clients.length,2);
 assert.equal(clients.find(x=>x.grupo==='FRANCIA').libras,175);
 assert.ok(Math.abs(sum(group(totals,'cliente','kg'))-375/2.2046)<1e-9);
 assert.equal(clients.reduce((v,x)=>v+x.porcentaje,0),100);
 assert.deepEqual(group([],'cliente','lbs'),[]);
});
