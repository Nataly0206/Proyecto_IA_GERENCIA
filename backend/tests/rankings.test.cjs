const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {rankingsQuery}=require('../dist/services/rankings.service');
const {runStbQuery}=require('../dist/services/stb.service');
const {closeStbPool}=require('../dist/config/stbDb');
after(closeStbPool);

for(const process of ['pelado','descabezado'])test(`${process}: top20 agrupa líneas, excluye anulados, resuelve empates y nombres sin duplicar libras`,async()=>{
 const peeled=process==='pelado';
 const header=peeled?'PES_ASIGNACION_LIBRAS_EMPLEADOS':'DES_ASIG_LBRS_EMPLEADOS';
 const detail=peeled?'PES_ASIGNACION_LIBRAS_EMPLEADOS_DET':'DES_ASIG_LBRS_EMPLEADOS_DET';
 const employees=peeled?'PES_EMPLEADOS_LINEAS':'DES_EMPLEADOS_LINEAS';
 const headerId=peeled?'ID_ASIGNACION_LIBRAS_EMPLEADO':'ID_ASIG_LBRS_EMPLEADO';
 const employeeLineId=peeled?'ID_EMPLEADOS_LINEA':'ID_EMPLEADO_LINEA';
 const fixture=`DECLARE @Desde date='2026-10-01', @Hasta date='2026-10-29';
 DECLARE @${header} TABLE(${headerId} int,FECHA date);
 DECLARE @${detail} TABLE(${headerId} int,ID_EMPLEADO_LINEA int,LIBRAS decimal(12,2),ANULADO bit);
 DECLARE @${employees} TABLE(${employeeLineId} int,ID_EMPLEADO int);
 DECLARE @DCP_EmpleadosDeptosFechas TABLE(IdEmpleadoDepto int,IdEmpleado int,Fecha date,NombreEmpleado varchar(100));
 INSERT @${header} VALUES(1,'2026-10-29'),(2,'2026-09-30'),(3,'2026-10-30');
 ;WITH n AS (SELECT 1 i UNION ALL SELECT i+1 FROM n WHERE i<25)
 INSERT @${employees} SELECT i,i FROM n;
 INSERT @${detail} SELECT 1,ID_EMPLEADO,100,0 FROM @${employees};
 INSERT @${employees} VALUES(26,1);
 INSERT @${detail} VALUES(1,26,50,0),(1,2,9999,1),(2,2,9999,0),(3,2,9999,0);
 INSERT @DCP_EmpleadosDeptosFechas VALUES(1,1,'2026-10-01','Anterior'),(2,1,'2026-10-29','Actual'),(3,1,'2026-10-30','Futuro');`;
 const rows=await runStbQuery(fixture+rankingsQuery(process).replace(/dbo\.([A-Za-z_]+)/g,'@$1'),[]);
 assert.equal(rows.length,20);assert.equal(rows[0].TotalEmpleados,25);
 assert.equal(rows[0].IdEmpleado,1);assert.equal(rows[0].Libras,150);assert.equal(rows[0].NombreEmpleado,'Actual');
 assert.equal(new Set(rows.map(row=>row.IdEmpleado)).size,20);
 assert.deepEqual(rows.map(row=>row.IdEmpleado),Array.from({length:20},(_,i)=>i+1));
 assert.equal(rows[1].Libras,100);assert.equal(rows[1].NombreEmpleado,null);
 assert.deepEqual(rows.map(row=>Number(row.Posicion)),Array.from({length:20},(_,i)=>i+1));
});
