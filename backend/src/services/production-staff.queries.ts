import { env } from '../config/env';

const OBRA_PAYROLL = `e.ID_TIPO_PLANILLA IN (SELECT ID_OBRA FROM dbo.PL_PARAMETROS_TIPO_PLANILLA WHERE ID_OBRA IS NOT NULL)`;

/** Personas incluidas en el reporte de pagos grupales por concepto de STB_data.
 * Sin padrón de RH, lista fija de conceptos ni filtro de importes: se conserva la población del reporte.
 * Los nombres de conceptos se resuelven con el catálogo de pagos, sin traer personas de Payroll.
 */
export const STB_GROUP_PAYMENT_STAFF_QUERY = `
SELECT CONVERT(varchar(10),d.Fecha,23) Dia,d.ID_EMPLEADO IdEmpleado,
  CONVERT(varchar(20),d.ID_EMPLEADO) CodigoEmpleado,
  COALESCE(f.NombreEmpleado,e.NombreEmpleado) Nombre,
  p.NOMBRE_PROCESO Departamento,'Producción' Division,e.Puesto,
  tr.Turno,'payment' Fuente,'A' MarcaReporte,d.IdPagoDeduccion IdConceptoPago
FROM dbo.V_PL_EMPLEADOS_PAGO_DETALLE_R d
OUTER APPLY (
  SELECT TOP(1) f.NombreEmpleado,f.IdProceso,f.IdTurno
  FROM dbo.DCP_EmpleadosDeptosFechas f
  WHERE f.IdEmpleado=d.ID_EMPLEADO AND f.Fecha<=d.Fecha
  ORDER BY f.Fecha DESC,f.FechaHora DESC,f.IdEmpleadoDepto DESC
) f
OUTER APPLY (
  SELECT TOP(1) e.NombreEmpleado,e.Puesto,e.IdProceso,e.IdTurno
  FROM dbo.DCP_EmpleadosDeptos e WHERE e.IdEmpleado=d.ID_EMPLEADO
  ORDER BY e.IdEmpleadoDepto DESC
) e
LEFT JOIN dbo.DCP_PROCESOS p ON p.ID_PROCESO=COALESCE(f.IdProceso,e.IdProceso)
LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno=COALESCE(f.IdTurno,e.IdTurno)
WHERE d.Fecha>=@Desde AND d.Fecha<DATEADD(DAY,1,@Hasta) AND d.ID_EMPLEADO>0`;

export const PAYMENT_CONCEPT_CATALOG_QUERY = `SELECT DISTINCT ID_PAGO_DEDUCCION IdConceptoPago,
 LTRIM(RTRIM(NOMBRE_PAGO_DEDUCCION)) ConceptoPago FROM dbo.PL_V_PAGOS_DEDUCCIONES`;

export const STB_GROUP_PAYMENT_COVERAGE_QUERY = `
SELECT CONVERT(varchar(10),MAX(CAST(d.Fecha AS date)),23) UltimaFecha
FROM dbo.V_PL_EMPLEADOS_PAGO_DETALLE_R d
WHERE d.Fecha>=@Desde AND d.Fecha<DATEADD(DAY,1,@Hasta) AND d.ID_EMPLEADO>0`;

/** Altas y bajas de la planilla OBRA por día, con el puesto para separar obra y auxiliares. */
export const PAYROLL_STAFF_MOVEMENTS_QUERY = `
SELECT CONVERT(varchar(10),CAST(e.FECHA_INGRESO AS date),23) Dia,'ingreso' Tipo,e.ID_EMPLEADO IdEmpleado,p.NOMBRE_PUESTO Puesto
FROM dbo.RH_EMPLEADOS e LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
WHERE ${OBRA_PAYROLL} AND CAST(e.FECHA_INGRESO AS date) BETWEEN @Desde AND @Hasta
  AND (e.ACTIVO=1 OR CAST(e.FECHA_RETIRO AS date)>=CAST(e.FECHA_INGRESO AS date))
UNION ALL
SELECT CONVERT(varchar(10),CAST(e.FECHA_RETIRO AS date),23),'retiro',e.ID_EMPLEADO,p.NOMBRE_PUESTO
FROM dbo.RH_EMPLEADOS e LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
WHERE ${OBRA_PAYROLL} AND e.ACTIVO=0 AND CAST(e.FECHA_RETIRO AS date) BETWEEN @Desde AND @Hasta
  AND CAST(e.FECHA_RETIRO AS date)>=CAST(e.FECHA_INGRESO AS date)`;

/** Referencias separadas: no agregan personas ni faltas al reporte de pagos. */
export const STAFF_ATTENDANCE_REFERENCES_QUERY = `
WITH Ultimo AS (
  SELECT MAX(v.Fecha) Fecha
  FROM dbo.RH_V_EMPLEADOS_PRODUCCION_INASISTENCIA v
  JOIN dbo.RH_ACCIONES a ON a.ID_ACCION=v.IdAccion
  WHERE v.Fecha<DATEADD(DAY,1,@Hasta) AND a.CODIGO_ACCION='013'
)
SELECT CONVERT(varchar(10),u.Fecha,23) UltimaFechaInasistencias,
 (SELECT COUNT(DISTINCT v.ID_EMPLEADO)
  FROM dbo.RH_V_EMPLEADOS_PRODUCCION_INASISTENCIA v
  JOIN dbo.RH_ACCIONES a ON a.ID_ACCION=v.IdAccion
  WHERE v.Fecha=u.Fecha AND a.CODIGO_ACCION='013') Inasistencias,
 (SELECT COUNT(DISTINCT e.ID_EMPLEADO) FROM dbo.RH_EMPLEADOS e
  JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
  WHERE e.ACTIVO=1 AND p.NOMBRE_PUESTO LIKE '%SUPERVISOR%'
    AND p.NOMBRE_PUESTO NOT LIKE '%APOYO%' AND p.NOMBRE_PUESTO NOT LIKE '%AUX%'
    AND p.NOMBRE_PUESTO NOT LIKE '%ASISTENTE%') SupervisoresActivos
FROM Ultimo u`;

/** Planilla OBRA y supervisores; sin marcación ni pago no se deduce una falta. */
export function payrollStaffComplementQuery(punches: string) {
 return `WITH Dias AS (
 SELECT TOP (DATEDIFF(DAY,@Desde,@Hasta)+1) DATEADD(DAY,ROW_NUMBER() OVER(ORDER BY (SELECT NULL))-1,CAST(@Desde AS date)) Dia
 FROM sys.all_objects a CROSS JOIN sys.all_objects b
), Personas AS (
 SELECT d.Dia,e.ID_EMPLEADO,e.CODIGO_EMPLEADO,e.Nombre_Completo_Empleado Nombre,
 p.NOMBRE_PUESTO Puesto,dp.DESCRIPCION_DEPARTAMENTO Departamento,dv.NOMBRE_DIVISION Division,t.TURNO Turno
 FROM Dias d JOIN dbo.RH_EMPLEADOS e ON d.Dia>=CAST(e.FECHA_INGRESO AS date)
 AND (e.ACTIVO=1 OR (e.FECHA_RETIRO>='2000-01-01' AND d.Dia<=CAST(e.FECHA_RETIRO AS date)))
 LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
 LEFT JOIN dbo.RH_DEPARTAMENTOS dp ON dp.ID_DEPARTAMENTO=e.ID_DEPARTAMENTO
 LEFT JOIN dbo.RH_DIVISIONES dv ON dv.ID_DIVISION=dp.ID_DIVISION
 LEFT JOIN dbo.PL_TURNOS t ON t.ID_TURNO=e.ID_TURNO
 WHERE ${OBRA_PAYROLL} OR (p.NOMBRE_PUESTO LIKE '%SUPERVISOR%' AND p.NOMBRE_PUESTO NOT LIKE '%APOYO%'
 AND p.NOMBRE_PUESTO NOT LIKE '%AUX%' AND p.NOMBRE_PUESTO NOT LIKE '%ASISTENTE%')
), Marcas AS (
 SELECT c.USERID IdEmpleado,CAST(DATEADD(MINUTE,-@CorteMinutos,c.CHECKTIME) AS date) Dia,
 MIN(c.CHECKTIME) PrimeraMarca,MAX(c.CHECKTIME) UltimaMarca,
 MIN(CASE WHEN c.CHECKTYPE='I' THEN c.CHECKTIME END) Entrada,
 MAX(CASE WHEN c.CHECKTYPE='O' THEN c.CHECKTIME END) Salida
 FROM ${punches} c
 WHERE c.CHECKTIME>=DATEADD(MINUTE,@CorteMinutos,CAST(@Desde AS datetime))
 AND c.CHECKTIME<DATEADD(MINUTE,@CorteMinutos,DATEADD(DAY,1,CAST(@Hasta AS datetime))) AND c.CHECKTIME<=GETDATE()
 GROUP BY c.USERID,CAST(DATEADD(MINUTE,-@CorteMinutos,c.CHECKTIME) AS date)
), Novedades AS (
 SELECT DISTINCT v.ID_EMPLEADO IdEmpleado,CAST(v.Fecha AS date) Dia,a.CODIGO_ACCION CodigoAccion,a.NOMBRE_ACCION Accion
 FROM dbo.RH_V_EMPLEADOS_PRODUCCION_INASISTENCIA v JOIN dbo.RH_ACCIONES a ON a.ID_ACCION=v.IdAccion
 WHERE v.Fecha>=@Desde AND v.Fecha<DATEADD(DAY,1,@Hasta)
 UNION
 SELECT DISTINCT v.ID_EMPLEADO,CAST(v.FECHA AS date),v.CODIGO_ACCION,v.NOMBRE_ACCION
 FROM dbo.V_PL_ACCIONES_PERSONAL_ASISTENCIA v WHERE v.FECHA>=@Desde AND v.FECHA<DATEADD(DAY,1,@Hasta)
)
SELECT CONVERT(varchar(10),p.Dia,23) Dia,p.ID_EMPLEADO IdEmpleado,p.CODIGO_EMPLEADO CodigoEmpleado,
 p.Nombre,p.Puesto,p.Departamento,p.Division,p.Turno,'payroll' Fuente,
 CASE WHEN m.IdEmpleado IS NOT NULL THEN 'A' ELSE NULL END MarcaReporte,
 CONVERT(varchar(8),m.Entrada,108) Entrada,CONVERT(varchar(8),m.Salida,108) Salida,
 CONVERT(varchar(19),m.PrimeraMarca,126) PrimeraMarca,CONVERT(varchar(19),m.UltimaMarca,126) UltimaMarca,
 n.CodigoAccion,n.Accion
FROM Personas p LEFT JOIN Marcas m ON m.IdEmpleado=p.ID_EMPLEADO AND m.Dia=p.Dia
LEFT JOIN Novedades n ON n.IdEmpleado=p.ID_EMPLEADO AND n.Dia=p.Dia`;
}

const sqlIdentifier = (value: string) => `[${value.replace(/\]/g, ']]')}]`;
export const PAYROLL_STAFF_COMPLEMENT_QUERY = payrollStaffComplementQuery(
 `${sqlIdentifier(env.PAYROLL_ATTENDANCE_LINKED_SERVER)}.${sqlIdentifier(env.PAYROLL_ATTENDANCE_DATABASE)}.[dbo].[CHECKINOUT]`,
);
