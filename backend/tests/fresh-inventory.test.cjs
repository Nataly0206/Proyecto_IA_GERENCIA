const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const service = require('../dist/services/fresh-inventory.service');
const { runStbQuery } = require('../dist/services/stb.service');
const { closeStbPool } = require('../dist/config/stbDb');
after(closeStbPool);

test('Conserva existencias antiguas, llenados repetidos y destinos separados', () => {
  const base = {Fecha:new Date('2026-09-29T00:00:00Z'), Bin:'01', Talla:'51-60', Destino:'Pelado', Libras:100};
  const rows = service.aggregateFreshInventory([
    {...base,Tiempo:'0 D, 23 H, 0 M'}, {...base,Tiempo:'1 D, 2 H, 3 M'},
    {...base,Destino:'IQF',Libras:4.268}, {...base,Libras:0}, {...base,Libras:-9},
  ]);
  assert.equal(rows.length,2);
  const peeled = rows.find(r=>r.destino==='Pelado');
  assert.equal(peeled.bins,2); assert.equal(peeled.libras,200);
  assert.equal(peeled.fecha,'2026-09-29'); assert.equal(peeled.minutosEspera,1563);
  assert.equal(peeled.tiempo,'1 D, 2 H, 3 M');
  assert.equal(rows.find(r=>r.destino==='IQF').libras,4.268);
});

test('Clasificado excluye enviados/procesados/transferidos/reprocesos y conserva bins sin catálogo', async () => {
  const fixture = `
DECLARE @CL_InventarioClasificado TABLE(Fecha date,IdTallaFinal int,Destino varchar(40),FincaPBI varchar(40),LagunaPBI varchar(40),IdLLenadoRecipienteD int,BIN varchar(20),LibrasNetas decimal(18,3),EnInventario bit,Transferido bit,Procesado bit,Enviado bit,Reproceso bit);
DECLARE @DCP_TALLAS TABLE(ID_TALLA int,NOMBRE_TALLA varchar(40));
DECLARE @CL_LLENADO_RECIPIENTES_D TABLE(ID_LLENADO_RECIPIENTE_D int,ID_LLENADO_RECIPIENTE int,IdDestinoFinal int);
DECLARE @CL_LLENADO_RECIPIENTES TABLE(ID_LLENADO_RECIPIENTE int,FincaPBI varchar(40),LagunaPBI varchar(40),Remision varchar(40));
DECLARE @CL_DESTINOS_FINAL TABLE(IdDestinoFinal int,DestinoFinal varchar(40));
INSERT @DCP_TALLAS VALUES(1,'51-60');
INSERT @CL_LLENADO_RECIPIENTES_D VALUES(1,1,1);
INSERT @CL_LLENADO_RECIPIENTES VALUES(1,'Finca','Laguna','Remision');
INSERT @CL_DESTINOS_FINAL VALUES(1,'Pelado');
INSERT @CL_InventarioClasificado VALUES
('2020-01-01',1,NULL,NULL,NULL,1,'01',100,1,0,0,0,0),
('2020-01-01',NULL,NULL,NULL,NULL,NULL,'01',50,1,0,0,0,0),
('2020-01-01',1,'IQF',NULL,NULL,1,'01',25,1,0,0,0,0),
('2020-01-01',1,NULL,NULL,NULL,1,'02',999,0,0,0,0,0),
('2020-01-01',1,NULL,NULL,NULL,1,'03',999,1,1,0,0,0),
('2020-01-01',1,NULL,NULL,NULL,1,'04',999,1,0,1,0,0),
('2020-01-01',1,NULL,NULL,NULL,1,'05',999,1,0,0,1,0),
('2020-01-01',1,NULL,NULL,NULL,1,'06',0,1,0,0,0,0),
('2020-01-01',1,NULL,NULL,NULL,1,'07',999,1,0,0,0,1);`;
  const rows = await runStbQuery(fixture + service.FRESH_CLASSIFIED_QUERY.replace(/dbo\.([A-Za-z_]+)/g,'@$1'),[]);
  assert.equal(rows.length,3); assert.equal(rows.reduce((n,r)=>n+r.Libras,0),175);
  assert.deepEqual(new Set(rows.map(r=>r.Destino)),new Set(['Pelado','IQF','Sin destino']));
});

test('Las cuatro consultas reales conservan todas las libras y bins al consolidar', async () => {
  for (const name of ['RECEPTION','TAIL','CLASSIFIED','PEELED']) {
    const source = await runStbQuery(service[`FRESH_${name}_QUERY`],[]);
    const grouped = service.aggregateFreshInventory(source);
    const total = source.reduce((n,r)=>n+Number(r.Libras),0);
    assert.equal(grouped.reduce((n,r)=>n+r.bins,0),source.length,name);
    assert.ok(Math.abs(grouped.reduce((n,r)=>n+r.libras,0)-total)<0.0001,name);
    console.log(`${name}: ${source.length} bins, ${total.toFixed(2)} lbs`);
    if (name==='PEELED') {
      for (const [date,expected] of [['2026-10-20',4654.30],['2026-10-21',13902.74],['2026-10-22',13067.24],['2026-10-23',5971.87],['2026-10-24',20704.62]]) {
        const actual = grouped.filter(r=>r.fecha===date).reduce((n,r)=>n+r.libras,0);
        // Comparison with reference report, while those historical bins remain pending.
        console.log(`Pelado ${date}: ${actual.toFixed(2)} lbs; captura ${expected.toFixed(2)}`);
      }
    }
  }
});

test('Las cuatro rutas requieren el permiso Fresco y responden con saldos reales', async () => {
  const express = require('express');
  const router = require('../dist/routes/dashboard.routes').default;
  const { closeRedis } = require('../dist/config/redis');
  const app = express();
  app.use((req,res,next)=>{
    res.locals.authUser = {esAdministrador:false,permisos:req.headers['x-test-fresh']==='yes'?['inventario_fresco']:['inventario']};
    next();
  });
  app.use('/api/dashboard',router);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    for (const stage of ['recepcion','cola','clasificado','pelado']) {
      const url = `http://127.0.0.1:${server.address().port}/api/dashboard/inventario-fresco-${stage}?refresh=true`;
      assert.equal((await fetch(url)).status,403);
      const result = await fetch(url,{headers:{'x-test-fresh':'yes'}});
      assert.equal(result.status,200);
      const rows = await result.json();
      assert.ok(Array.isArray(rows));
      assert.ok(rows.every(r=>r.libras>0 && r.bins>0));
      if(stage==='clasificado') assert.ok(rows.every(r=>typeof r.destino==='string'&&r.destino.length));
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await closeRedis();
  }
});
