import { env } from '../config/env';

/** Nombres de configuración, nunca entrada de una solicitud HTTP. */
function identifier(value: string) {
  if (!value || value.length > 128 || /[\0\r\n]/.test(value)) throw new Error('Identificador de asistencia no válido.');
  return `[${value.replace(/\]/g, ']]')}]`;
}
const punches = `${identifier(env.PAYROLL_ATTENDANCE_LINKED_SERVER)}.${identifier(env.PAYROLL_ATTENDANCE_DATABASE)}.[dbo].[CHECKINOUT]`;

const OBRA_PAYROLL = `e.ID_TIPO_PLANILLA IN (SELECT ID_OBRA FROM dbo.PL_PARAMETROS_TIPO_PLANILLA WHERE ID_OBRA IS NOT NULL)`;

/**
 * Planilla OBRA vigente en cada fecha. V_RH_EMPLEADOS_DIAS repite la lista ACTUAL de activos
 * en todas las fechas (contaba como falta a quien aún no ingresaba y omitía a quien ya se retiró).
 * Aquí cada persona cuenta desde FECHA_INGRESO; los inactivos, hasta FECHA_RETIRO inclusive.
 * En activos FECHA_RETIRO es el retiro anterior a una recontratación, por eso no se usa.
 */
const PAYROLL_ROSTER = `(
  SELECT f.Fecha,e.ID_EMPLEADO,RTRIM(e.Nombre_Completo_Empleado) NOMBRE_EMPLEADO,e.CODIGO_EMPLEADO,
    dp.DESCRIPCION_DEPARTAMENTO,dv.NOMBRE_DIVISION,p.NOMBRE_PUESTO,e.ID_TURNO
  FROM (
    SELECT TOP (DATEDIFF(DAY,@Desde,@Hasta)+1) DATEADD(DAY,ROW_NUMBER() OVER (ORDER BY (SELECT NULL))-1,CAST(@Desde AS date)) Fecha
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
  ) f
  JOIN dbo.RH_EMPLEADOS e ON f.Fecha>=CAST(e.FECHA_INGRESO AS date)
    AND (e.ACTIVO=1 OR (e.FECHA_RETIRO>='2000-01-01' AND f.Fecha<=CAST(e.FECHA_RETIRO AS date)))
  LEFT JOIN dbo.RH_DEPARTAMENTOS dp ON dp.ID_DEPARTAMENTO=e.ID_DEPARTAMENTO
  LEFT JOIN dbo.RH_DIVISIONES dv ON dv.ID_DIVISION=dp.ID_DIVISION
  LEFT JOIN dbo.RH_PUESTOS p ON p.ID_PUESTO=e.ID_PUESTO
  WHERE ${OBRA_PAYROLL}
)`;

/** Población completa de planilla OBRA, no una muestra ni las personas con libras. */
export const PAYROLL_STAFF_QUERY = `
WITH Marcaciones AS (
  SELECT c.USERID IdEmpleado,
    CAST(DATEADD(MINUTE,-@CorteMinutos,c.CHECKTIME) AS date) Dia,
    MIN(c.CHECKTIME) PrimeraMarca, MAX(c.CHECKTIME) UltimaMarca,
    MIN(CASE WHEN c.CHECKTYPE='I' THEN c.CHECKTIME END) Entrada,
    MAX(CASE WHEN c.CHECKTYPE='O' THEN c.CHECKTIME END) Salida
  FROM ${punches} c
  WHERE c.CHECKTIME >= DATEADD(MINUTE,@CorteMinutos,CAST(@Desde AS datetime))
    AND c.CHECKTIME < DATEADD(MINUTE,@CorteMinutos,DATEADD(DAY,1,CAST(@Hasta AS datetime)))
    AND c.CHECKTIME <= COALESCE(@HastaMarca,GETDATE())
  GROUP BY c.USERID,CAST(DATEADD(MINUTE,-@CorteMinutos,c.CHECKTIME) AS date)
)
SELECT CONVERT(varchar(10),r.Fecha,23) Dia,r.ID_EMPLEADO IdEmpleado,
  r.NOMBRE_EMPLEADO Nombre,r.CODIGO_EMPLEADO CodigoEmpleado,
  r.DESCRIPCION_DEPARTAMENTO Departamento,r.NOMBRE_DIVISION Division,r.NOMBRE_PUESTO Puesto,
  t.TURNO Turno,'report' Fuente,
  CASE WHEN DATEADD(MINUTE,@CorteMinutos,CAST(r.Fecha AS datetime))>COALESCE(@HastaMarca,GETDATE()) THEN NULL
    WHEN m.IdEmpleado IS NOT NULL THEN 'A' ELSE 'X' END MarcaReporte,
  CONVERT(varchar(8),m.Entrada,108) Entrada,CONVERT(varchar(8),m.Salida,108) Salida,
  CONVERT(varchar(19),m.PrimeraMarca,126) PrimeraMarca,
  CONVERT(varchar(19),m.UltimaMarca,126) UltimaMarca
FROM ${PAYROLL_ROSTER} r
LEFT JOIN dbo.PL_TURNOS t ON t.ID_TURNO=r.ID_TURNO
LEFT JOIN Marcaciones m ON m.IdEmpleado=r.ID_EMPLEADO AND m.Dia=r.Fecha`;

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

/** La cobertura se obtiene de la fuente viva, no de RH_Marcas ni de la copia diaria de STB_data. */
export const PAYROLL_ATTENDANCE_COVERAGE_QUERY = `
SELECT CONVERT(varchar(10),CAST(DATEADD(MINUTE,-@CorteMinutos,MAX(c.CHECKTIME)) AS date),23) UltimaFecha
FROM ${punches} c
WHERE c.CHECKTIME>=DATEADD(MINUTE,@CorteMinutos,CAST(@Desde AS datetime))
  AND c.CHECKTIME<DATEADD(MINUTE,@CorteMinutos,DATEADD(DAY,1,CAST(@Hasta AS datetime)))
  AND c.CHECKTIME<=COALESCE(@HastaMarca,GETDATE())`;
