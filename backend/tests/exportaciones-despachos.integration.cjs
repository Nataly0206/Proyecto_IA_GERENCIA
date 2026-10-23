const assert=require('node:assert/strict');
const {test}=require('node:test');
const sql=require('mssql');
const {runQuery}=require('../dist/services/sql.service');
const {closePool}=require('../dist/config/db');
const {EXPORTACIONES_LIBRAS_QUERY,EXPORTACIONES_CONTENEDORES_QUERY}=require('../dist/services/procesos.queries');
const fixture=`
DECLARE @Envios TABLE(IdEnvio int,FechaCarga date,NumeroContenedor varchar(30),ReferenciaEnvio varchar(30),CodigoEmbarque varchar(30),TipoDestino int);
DECLARE @Masteres TABLE(IdMaster int,CodigoMaster varchar(30),FkEnvio int);
DECLARE @Seriales TABLE(IdSerial int,FkMaster int,FkOrdenProduccion int,Cantidad int);
DECLARE @OrdenesProduccion TABLE(IdOrdenProduccion int,FkItem int,FkLoteRemision int);
DECLARE @AV_Items TABLE(IdItem int,EstiloFinal varchar(30),PesoLibras decimal(18,4));
DECLARE @AV_LotesRemision TABLE(IdLoteRemision int,NombreGrupo varchar(60),Empresa varchar(60));
DECLARE @ProductosClienteItem TABLE(fkItem int,fkProducto int);
DECLARE @ProductosCliente TABLE(IDproducto int,Unidades int);
INSERT @AV_Items VALUES(1,'ANILLOS',100);
INSERT @AV_LotesRemision VALUES(1,'JMC FISHERIES','JMC FISHERIES'),(2,'MAYCA','AC HOLDING MAYCA EXPORT'),(3,'AC HOLDING','WALMART-HONDURAS');
INSERT @OrdenesProduccion VALUES(1,1,1),(2,1,2),(3,1,3);
INSERT @Envios VALUES
 (1,'2026-01-10','CONT-1','EXPORT-JMC-1','E1',1),
 (2,'2026-02-10',NULL,'EXPORT-JMC-2','E2',1),
 (3,'2026-03-10','','INTERNO','E3',2),
 (4,'2026-01-10','','EXPORT-MAYCA-1','E4',1),
 (5,'2026-01-10','   ','EXPORT-WALMART-1','E5',1),
 (6,'2026-01-10','CONT-R','REEMPAQUE','E6',3),
 (7,'2026-01-10','CONT-X','OTRO-001','E7',1);
INSERT @Masteres VALUES(1,'M1',1),(2,'M2',2),(3,'M3',3),(4,'M4',4),(5,'M5',5),(6,'M6',6),(7,'M7',7);
INSERT @Seriales VALUES(1,1,1,1),(2,2,1,1),(3,3,1,1),(4,4,2,1),(5,5,3,1),(6,6,1,1),(7,7,1,1);
`;
test('Libras incluye despachos sin contenedor de JMC, MAYCA y Walmart y excluye movimientos internos',async()=>{
 try{
 const params=[{name:'Fecha_Inicial',type:sql.Date,value:'2026-01-01'},{name:'Fecha_Final',type:sql.Date,value:'2026-12-31'}];
 const isolate=query=>fixture+query.replace(/dbo\.([A-Za-z_]+)/g,'@$1');
 const rows=await runQuery(isolate(EXPORTACIONES_LIBRAS_QUERY),params);
 assert.equal(rows.length,4);
 assert.equal(rows.reduce((n,x)=>n+Number(x.Libras),0),400);
 assert.equal(rows.filter(x=>x.Cliente==='JMC FISHERIES').length,2);
 assert.ok(rows.some(x=>x.Cliente==='MAYCA'&&x.Referencia==='EXPORT-MAYCA-1'));
 assert.ok(rows.some(x=>x.Cliente==='AC HOLDING'&&x.Referencia==='EXPORT-WALMART-1'));
 assert.ok(rows.every(x=>!['INTERNO','REEMPAQUE','OTRO-001'].includes(x.Referencia)));
 // The separate container report retains its original criteria.
 const containers=await runQuery(isolate(EXPORTACIONES_CONTENEDORES_QUERY),params);
 assert.equal(containers.length,1);
 assert.equal(containers[0].Referencia,'EXPORT-JMC-1');
 }finally{await closePool()}
});
