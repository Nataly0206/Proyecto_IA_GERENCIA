const assert = require('node:assert/strict');
const { test } = require('node:test');
const sql = require('mssql');
const { runStbQuery } = require('../dist/services/stb.service');
const { closeStbPool } = require('../dist/config/stbDb');
const { RECEPCION_REMISIONES_QUERY, RECEPCION_RESUMEN_QUERY } = require('../dist/services/procesos.queries');
const cases = [
  ['GMS','07',30000,19402.14,10518.92], ['ICASUR','L-02',14199,9116.53,5096.79],
  ['ICASUR','L-03',13235,8158.23,4502.83], ['ICASUR','L-06',2850,1925.14,1146.73],
  ['ICASUR','L-08',2852,1898.68,1155.35], ['ICASUR','L-09',2862,1840.73,1131.73],
  ['ICASUR','L-15',3797,2495.8,1372.31], ['ICASUR','L-18',1845,1152.27,712.73],
  ['ICASUR','L-19',2751,1677.98,1033.44], ['ICASUR','L-38',2798,1713.84,1033.76],
  ['RIVERMAR','R-18',1000,669.3,418.24],
];
// SQL table variables: exercise real joins without modifying database records.
const fixture = `
DECLARE @Expected TABLE(Id int,Finca varchar(30),Laguna varchar(30),Recibido decimal(18,2),Cola decimal(18,2),Cabeza decimal(18,2));
INSERT @Expected VALUES ${cases.map(([farm,lagoon,received,tail,head],i)=>`(${i+1},'${farm}','${lagoon}',${received},${tail},${head})`).join(',')};
DECLARE @R_REMISIONES_PLANTA TABLE(ID_REMISION_PLANTA int,ID_LAGUNA int,FECHA_REMISION date,REMISION_GENERAL varchar(40),NombreCliente varchar(80),ANULADA bit,RECHAZADA bit,CERRADA bit);
DECLARE @R_REMISIONES_PLANTA_DETALLE TABLE(ID_REMISION_PLANTA int,LIBRAS decimal(18,2),PROCESADO bit);
DECLARE @R_Lagunas TABLE(IdLaguna int,IdFinca int,Laguna varchar(30));
DECLARE @R_Fincas TABLE(IdFinca int,Codigo varchar(30),Finca varchar(80));
DECLARE @RemisionesPlantaPBI TABLE(FechaRemision date,IdRemisionPlanta varchar(40),Nombre varchar(80),CodigoFinca varchar(30),Finca varchar(80),Laguna varchar(30),LibrasRemision decimal(18,2),LibrasCola decimal(18,2),LibrasCabeza decimal(18,2),Procesado bit);
DECLARE @VPesadoColaPBI TABLE(Remision varchar(40),Laguna varchar(30),LibrasNetas decimal(18,2));
DECLARE @VPesadoCabezaPBI TABLE(Remision varchar(40),Laguna varchar(30),LibrasNetas decimal(18,2));
DECLARE @VLibrasBasuraPBI TABLE(REMISION_GENERAL varchar(40),ID_LAGUNA int,LIBRAS_BASURA decimal(18,2));
INSERT @R_Fincas VALUES(1,'GMS','GMS'),(2,'ICASUR','ICASUR'),(3,'RIVERMAR','RIVERMAR');
INSERT @R_Lagunas SELECT Id,CASE Finca WHEN 'GMS' THEN 1 WHEN 'ICASUR' THEN 2 ELSE 3 END,Laguna FROM @Expected;
INSERT @R_REMISIONES_PLANTA SELECT Id,Id,'2026-09-16','STB0000252-26',NULL,0,0,1 FROM @Expected;
INSERT @R_REMISIONES_PLANTA_DETALLE SELECT Id,Recibido,1 FROM @Expected WHERE Id NOT IN(1,2);
-- Equal deliveries must remain separate; processed and pending bins both count.
INSERT @R_REMISIONES_PLANTA VALUES(12,1,'2026-09-16','STB0000252-26',NULL,0,0,1),(13,1,'2026-09-16','STB0000252-26',NULL,0,0,1);
INSERT @R_REMISIONES_PLANTA_DETALLE VALUES(1,10000,1),(12,10000,1),(13,10000,1),(2,10000,1),(2,4199,0);
-- Reproduce the source error: 11 tails x 11 heads for every incoming lagoon.
INSERT @RemisionesPlantaPBI SELECT '2026-09-16','STB0000252-26','PROCESO PROGRAMA 2026',e.Finca,e.Finca,e.Laguna,e.Recibido,c.Cola,h.Cabeza,1 FROM @Expected e CROSS JOIN @Expected c CROSS JOIN @Expected h;
INSERT @VPesadoColaPBI SELECT 'STB0000252-26',Laguna,Cola FROM @Expected WHERE Id<>1;
INSERT @VPesadoCabezaPBI SELECT 'STB0000252-26',Laguna,Cabeza FROM @Expected WHERE Id<>1;
INSERT @VPesadoColaPBI VALUES('STB0000252-26','07',19400),('STB0000252-26','07',2.14);
INSERT @VPesadoCabezaPBI VALUES('STB0000252-26','07',10500),('STB0000252-26','07',18.92);
INSERT @VLibrasBasuraPBI VALUES('STB0000252-26',2,2),('STB0000252-26',2,3);
INSERT @R_REMISIONES_PLANTA VALUES(90,1,'2026-09-16','ANULADA',NULL,1,0,1),(91,1,'2026-09-16','RECHAZADA',NULL,0,1,1),
(92,1,'2026-09-17','OTRA-REMISION','Otro cliente',0,0,1),(93,11,'2026-09-17','SIN-PESADOS','Cliente sin pesado',0,0,1);
INSERT @R_REMISIONES_PLANTA_DETALLE VALUES(90,999999,1),(91,999999,1),(92,100,1),(93,50,0);
INSERT @VPesadoColaPBI VALUES('OTRA-REMISION','07',60);
INSERT @VPesadoCabezaPBI VALUES('OTRA-REMISION','07',40);
`;
const isolate = query => fixture + query.replace(/dbo\.([A-Za-z_]+)/g, '@$1');
const params = day => [{ name:'Fecha_Inicial',type:sql.Date,value:day }, { name:'Fecha_Final',type:sql.Date,value:day }];

test('Las 11 lagunas conservan sus pesos y el resumen no multiplica bins', async () => {
  try {
    const rows = await runStbQuery(isolate(RECEPCION_REMISIONES_QUERY), params('2026-09-16'));
    assert.equal(rows.length,11);
    for (const [farm,lagoon,received,tail,head] of cases) {
      const row = rows.find(x=>x.CodigoFinca===farm && x.Laguna===lagoon);
      assert.equal(row.LibrasRemision,received); assert.equal(row.LibrasCola,tail); assert.equal(row.LibrasCabeza,head);
      assert.equal(row.Cliente,'PROCESO PROGRAMA 2026');
    }
    assert.equal(rows.find(x=>x.Laguna==='L-02').LibrasBasura,5);
    assert.equal(rows.reduce((n,x)=>n+x.LibrasRemision,0),78189);
    const summary = (await runStbQuery(isolate(RECEPCION_RESUMEN_QUERY), [{name:'Dia',type:sql.Date,value:'2026-09-16'}]))[0];
    assert.equal(summary.LibrasRemisionHoy,78189); assert.equal(summary.LibrasRecibidasHoy,78189); assert.equal(summary.LibrasBasuraHoy,5);
    for (const [detail,total] of [['LibrasCola','LibrasColaHoy'],['LibrasCabeza','LibrasCabezaHoy']]) {
      assert.ok(Math.abs(summary[total]-rows.reduce((n,x)=>n+x[detail],0))<0.001);
    }
  } finally { await closeStbPool(); }
});
test('No mezcla otra remisión con la misma laguna y conserva filas sin pesados', async () => {
  try {
    const rows = await runStbQuery(isolate(RECEPCION_REMISIONES_QUERY),params('2026-09-17'));
    assert.equal(rows.length,2);
    const other=rows.find(x=>x.Remision==='OTRA-REMISION');
    assert.equal(other.LibrasRemision,100); assert.equal(other.LibrasCola,60); assert.equal(other.LibrasCabeza,40); assert.equal(other.Cliente,'Otro cliente');
    const empty=rows.find(x=>x.Remision==='SIN-PESADOS');
    assert.equal(empty.LibrasRemision,50); assert.equal(empty.LibrasCola,0); assert.equal(empty.LibrasCabeza,0);
  } finally { await closeStbPool(); }
});
