const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../dist/services/sql.service');
const { closePool } = require('../dist/config/db');

// Table variables exercise real SQL without changing application data.
const fixture = `
DECLARE @Seriales TABLE (IdSerial int,FkOrdenProduccion int,FkMaster int,FkFreezer int,FkTorre int,Cantidad int);
DECLARE @SerialesSobrantes TABLE (FkSerial int);
DECLARE @OrdenesProduccion TABLE (IdOrdenProduccion int,FkLoteRemision int,FkItem int,FkStatus int,NoOrdenCompra varchar(20),CodigoExterno varchar(20),FechaProduccion date,FkTipo int,fkClienteDestinoOP int);
DECLARE @AV_LotesRemision TABLE (IdLoteRemision int,Empresa varchar(80),IDEmpresa int);
DECLARE @AV_Items TABLE (IdItem int,CodigoItem varchar(30),EstiloFinal varchar(30),Item varchar(80),Marca varchar(30),TallaExport varchar(20),Empaque varchar(30),TipoItem varchar(20),PesoKilos decimal(12,2));
DECLARE @Masteres TABLE (IdMaster int,FkLocalidad int,FkEnvio int);
DECLARE @Localidades TABLE (IdLocalidad int);
DECLARE @Freezers TABLE (IdFreezer int);
DECLARE @Torres TABLE (IdTorre int);
DECLARE @Empresas TABLE (IDEmpresa int,Empresa varchar(80),fkClienteProduccion int);
DECLARE @ClientesProduccion TABLE (IDCliente int,NombreCliente varchar(80));
INSERT @ClientesProduccion VALUES (1,'FRANCIA DP'),(2,'PROGRAMA'),(3,'LFF UK');
INSERT @Empresas VALUES (10,'FRANCIA DP 2026 FRESCO',1),(20,'PROCESO PROGRAMA 2026',2),(30,'LFF UK FRESCO',3),(40,'SIN PRINCIPAL',NULL),(50,'',NULL);
INSERT @AV_LotesRemision VALUES (1,'FRANCIA DP 2026 FRESCO',10),(2,'PROCESO PROGRAMA 2026',20);
INSERT @AV_Items VALUES (1,'A61','ANILLOS','ANILLOS 11.34 KG','STB','61/70','IQF','IQF',11.34),(2,'A71','ANILLOS','ANILLOS 11.70 KG','STB','71/90','IQF','IQF',11.70),(3,'A15','ANILLOS','ANILLOS 15.30 KG','STB','71/90','IQF','IQF',15.30);
INSERT @Localidades VALUES (1);
INSERT @Freezers VALUES (1);
INSERT @Torres VALUES (1);
INSERT @Masteres VALUES (1,1,NULL),(2,1,99);
INSERT @OrdenesProduccion VALUES
(1,1,1,1,NULL,'','2026-10-01',0,0),
(2,2,1,1,'10672','','2026-10-01',0,10),
(3,2,2,1,'10670','','2026-10-01',0,10),
(4,2,3,1,'10671','','2026-10-01',0,10),
(5,2,2,1,'10670','','2026-10-01',0,30),
(6,2,1,1,NULL,'','2026-10-01',0,10),
(7,2,1,1,NULL,'','2026-10-01',0,NULL),
(8,2,1,1,NULL,'','2026-10-01',0,999),
(9,2,1,1,NULL,'','2026-10-01',0,40),
(10,2,1,1,NULL,'','2026-10-01',0,50);
DECLARE @Cases TABLE (orden int,cajas int);
INSERT @Cases VALUES (1,89),(2,273),(3,133),(4,79),(5,45);
WITH n AS (SELECT 1 n UNION ALL SELECT n+1 FROM n WHERE n<273)
INSERT @Seriales SELECT orden*1000+n,orden,1,1,1,1 FROM @Cases CROSS JOIN n WHERE n<=cajas OPTION(MAXRECURSION 300);
INSERT @Seriales VALUES (6,6,NULL,1,1,1),(7,7,1,1,1,1),(8,8,1,1,1,1),(9,9,1,1,1,1),(10,10,1,1,1,1),(11,2,2,1,1,99);
INSERT @SerialesSobrantes VALUES (6);
`;

test('Inventario usa cliente destino en másteres y sobrantes y conserva el respaldo al lote', async () => {
  const original = service.runQuery;
  service.runQuery = (query, params) => original(fixture + query.replace(/dbo\.([A-Za-z_]+)/g, '@$1'), params);
  try {
    const rows = await require('../dist/services/inventory.service').getInventory();
    const france = rows.filter(x => x.nombreCliente === 'FRANCIA DP 2026 FRESCO');
    assert.ok(france.every(x => x.nombreClientePrincipal === 'FRANCIA DP'));
    const count = item => france.filter(x => x.nombreItem === item).reduce((n,x) => n+x.cantidadSerial,0);
    assert.equal(count('ANILLOS 11.34 KG'),363); // 362 masters plus one loose serial.
    assert.equal(count('ANILLOS 11.70 KG'),133);
    assert.equal(count('ANILLOS 15.30 KG'),79);
    assert.equal(rows.filter(x=>x.nombreClientePrincipal==='LFF UK').reduce((n,x)=>n+x.cantidadSerial,0),45);
    assert.equal(rows.filter(x=>x.nombreCliente==='PROCESO PROGRAMA 2026').reduce((n,x)=>n+x.cantidadSerial,0),3);
    assert.ok(rows.some(x=>x.nombreCliente==='SIN PRINCIPAL' && x.nombreClientePrincipal==='SIN PRINCIPAL'));
    assert.ok(france.some(x=>x.noOrdenCompra==='Sin orden'));
    assert.ok(Math.abs(france.filter(x=>x.nombreItem==='ANILLOS 11.70 KG').reduce((n,x)=>n+x.pesoKilos*2.2046,0)-3430.57806)<0.001);
  } finally {
    service.runQuery = original;
    await closePool();
  }
});
