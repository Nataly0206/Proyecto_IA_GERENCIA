import { env } from '../config/env';

const OBRA_PAYROLL = `e.ID_TIPO_PLANILLA IN (SELECT ID_OBRA FROM dbo.PL_PARAMETROS_TIPO_PLANILLA WHERE ID_OBRA IS NOT NULL)`;

/** Padrón temporal por fecha y novedades; no consulta marcadores ni pagos. */
export const PAYROLL_STAFF_COMPLEMENT_QUERY = `
WITH Dias AS (
 SELECT TOP (DATEDIFF(DAY,@Desde,@Hasta)+1) DATEADD(DAY,ROW_NUMBER() OVER(ORDER BY (SELECT NULL))-1,CAST(@Desde AS date)) Dia
 FROM sys.all_objects a CROSS JOIN sys.all_objects b
), Personas AS (
 SELECT d.Dia,e.ID_EMPLEADO,e.CODIGO_EMPLEADO,e.Nombre_Completo_Empleado Nombre,
 p.NOMBRE_PUESTO Puesto,dp.DESCRIPCION_DEPARTAMENTO Departamento,dv.NOMBRE_DIVISION Division
 FROM Dias d JOIN dbo.RH_EMPLEADOS e ON d.Dia>=CAST(e.FECHA_INGRESO AS date)
 AND (e.ACTIVO=1 OR (e.FECHA_RETIRO>='2000-01-01' AND d.Dia<=CAST(e.FECHA_RETIRO AS date)))
 LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
 LEFT JOIN dbo.RH_DEPARTAMENTOS dp ON dp.ID_DEPARTAMENTO=e.ID_DEPARTAMENTO
 LEFT JOIN dbo.RH_DIVISIONES dv ON dv.ID_DIVISION=dp.ID_DIVISION
 WHERE e.TIPO_CONTRATO='T' AND ${OBRA_PAYROLL}
), Novedades AS (
 SELECT DISTINCT v.ID_EMPLEADO IdEmpleado,CAST(v.Fecha AS date) Dia,a.CODIGO_ACCION CodigoAccion,a.NOMBRE_ACCION Accion
 FROM dbo.RH_V_EMPLEADOS_PRODUCCION_INASISTENCIA v JOIN dbo.RH_ACCIONES a ON a.ID_ACCION=v.IdAccion
 WHERE v.Fecha>=@Desde AND v.Fecha<DATEADD(DAY,1,@Hasta)
 UNION
 SELECT DISTINCT v.ID_EMPLEADO,CAST(v.FECHA AS date),v.CODIGO_ACCION,v.NOMBRE_ACCION
 FROM dbo.V_PL_ACCIONES_PERSONAL_ASISTENCIA v WHERE v.FECHA>=@Desde AND v.FECHA<DATEADD(DAY,1,@Hasta)
)
SELECT CONVERT(varchar(10),p.Dia,23) Dia,p.ID_EMPLEADO IdEmpleado,p.CODIGO_EMPLEADO CodigoEmpleado,
 p.Nombre,p.Puesto,p.Departamento,p.Division,'payroll' Fuente,n.CodigoAccion,n.Accion
FROM Personas p LEFT JOIN Novedades n ON n.IdEmpleado=p.ID_EMPLEADO AND n.Dia=p.Dia`;

export const PAYROLL_STAFF_MOVEMENTS_QUERY = `
SELECT CONVERT(varchar(10),CAST(e.FECHA_INGRESO AS date),23) Dia,'ingreso' Tipo,e.ID_EMPLEADO IdEmpleado,p.NOMBRE_PUESTO Puesto
FROM dbo.RH_EMPLEADOS e LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
WHERE e.TIPO_CONTRATO='T' AND ${OBRA_PAYROLL} AND CAST(e.FECHA_INGRESO AS date) BETWEEN @Desde AND @Hasta
  AND (e.ACTIVO=1 OR CAST(e.FECHA_RETIRO AS date)>=CAST(e.FECHA_INGRESO AS date))
UNION ALL
SELECT CONVERT(varchar(10),CAST(e.FECHA_RETIRO AS date),23),'retiro',e.ID_EMPLEADO,p.NOMBRE_PUESTO
FROM dbo.RH_EMPLEADOS e LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
WHERE e.TIPO_CONTRATO='T' AND ${OBRA_PAYROLL} AND e.ACTIVO=0 AND CAST(e.FECHA_RETIRO AS date) BETWEEN @Desde AND @Hasta
  AND CAST(e.FECHA_RETIRO AS date)>=CAST(e.FECHA_INGRESO AS date)`;


export const STB_FIRST_WEIGHING_QUERY = `
WITH Pesas AS (
 SELECT e.ID_EMPLEADO IdEmpleado,h.FECHA Dia,d.HORA Hora
 FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
 JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
 JOIN dbo.PES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
 WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND d.ANULADO=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@HoraCorte AS time) OR d.HORA IS NULL)
 UNION ALL
 SELECT e.ID_EMPLEADO,h.FECHA,d.HORA
 FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
 JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO=h.ID_ASIG_LBRS_EMPLEADO
 JOIN dbo.DES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADO_LINEA=d.ID_EMPLEADO_LINEA
 WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND ISNULL(d.ANULADO,0)=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@HoraCorte AS time) OR d.HORA IS NULL)
)
SELECT IdEmpleado,CONVERT(varchar(10),Dia,23) Dia,CONVERT(varchar(8),MIN(Hora),108) Entrada,
 'weighing' Fuente,'A' MarcaReporte FROM Pesas GROUP BY IdEmpleado,Dia`;


/** Chequeo manual por empleado y tramo. El nombre de la tabla no implica usar importes. */
export const STAFF_CHECKS_FROM = `
 FROM dbo.DCP_PagoGrupalAsistencias h
 JOIN dbo.DCP_PagoGrupalAsistenciasDetalle d ON d.IdPagoGrupalAsistencia=h.IdPagoGrupalAsistencia
 LEFT JOIN dbo.dcp_LineasProduccion l ON l.IdLineaProduccion=h.IdLineaProduccion
 LEFT JOIN dbo.DCP_PROCESOS p ON p.ID_PROCESO=l.IdProceso
 LEFT JOIN dbo.Dcp_Actividades a ON a.IdActividad=d.idActividad`;

export const STB_ACTIVITY_ATTENDANCE_QUERY = `
SELECT d.IdEmpleado,CONVERT(varchar(10),h.Fecha,23) Dia,
 CONVERT(varchar(8),d.HoraDesde,108) Entrada,CONVERT(varchar(8),d.HoraHasta,108) Salida,
 l.LineaProduccion Linea,a.Actividad,p.NOMBRE_PROCESO Proceso,'activity' Fuente
${STAFF_CHECKS_FROM}
WHERE h.Fecha>=@Desde AND h.Fecha<DATEADD(DAY,1,@Hasta)
 AND d.HoraDesde IS NOT NULL AND (h.Fecha<@Hasta OR d.HoraDesde<=CAST(@HoraCorte AS time))`;

/** Referencia de turno; nunca se utiliza como evidencia de presencia de otra fecha. */
export const STB_STAFF_SHIFT_HISTORY_QUERY = `
SELECT d.IdEmpleado,CONVERT(varchar(10),h.Fecha,23) Dia,
 CONVERT(varchar(8),d.HoraDesde,108) Entrada,l.LineaProduccion Linea,
 d.IdPagoGrupalAsistenciaDetalle Orden
${STAFF_CHECKS_FROM}
WHERE h.Fecha>=DATEADD(DAY,-30,@Desde) AND h.Fecha<DATEADD(DAY,1,@Hasta)
 AND d.HoraDesde IS NOT NULL
 AND (h.Fecha<@Hasta OR d.HoraDesde<=CAST(@HoraCorte AS time))
 AND (l.LineaProduccion LIKE '% TA%' OR l.LineaProduccion LIKE '% TB%' OR l.LineaProduccion LIKE '%TURNO A%' OR l.LineaProduccion LIKE '%TURNO B%')`;

// Identificadores de configuración escapados, sin interpolación de fechas ni IDs.
const biometricDb = [env.PAYROLL_ATTENDANCE_LINKED_SERVER, env.PAYROLL_ATTENDANCE_DATABASE, 'dbo']
 .map(value => `[${value.replace(/]/g, ']]')}]`).join('.');
export const PAYROLL_BIOMETRIC_ATTENDANCE_QUERY = `
SELECT TRY_CONVERT(int,u.BADGENUMBER) IdEmpleado,
 CONVERT(varchar(10),CAST(c.CHECKTIME AS date),23) Dia,'clock' Fuente,
 CONVERT(varchar(8),MIN(c.CHECKTIME),108) PrimeraMarca,
 CONVERT(varchar(8),MAX(c.CHECKTIME),108) UltimaMarca,
 CONVERT(varchar(8),MIN(CASE WHEN c.CHECKTYPE='I' THEN c.CHECKTIME END),108) Entrada,
 CONVERT(varchar(8),MAX(CASE WHEN c.CHECKTYPE='O' THEN c.CHECKTIME END),108) Salida,
 COUNT(*) CantidadMarcas
FROM ${biometricDb}.[CHECKINOUT] c
JOIN ${biometricDb}.[USERINFO] u ON u.USERID=c.USERID
WHERE c.CHECKTIME>=@Desde AND c.CHECKTIME<DATEADD(DAY,1,@Hasta)
GROUP BY TRY_CONVERT(int,u.BADGENUMBER),CAST(c.CHECKTIME AS date)`;

/** Solo existencia de pago positivo para conciliación; no confirma asistencia. */
export const PAYROLL_POSITIVE_PAYMENT_QUERY = `
SELECT DISTINCT ID_EMPLEADO IdEmpleado,CONVERT(varchar(10),Fecha,23) Dia,'payment' Fuente
FROM dbo.V_PL_PAGOS_COLECTORES
WHERE Fecha>=@Desde AND Fecha<DATEADD(DAY,1,@Hasta) AND PAGO>0`;
