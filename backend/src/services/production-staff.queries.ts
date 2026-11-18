import { env } from '../config/env';

/** Nombres de configuración, nunca entrada de una solicitud HTTP. */
function identifier(value: string) {
  if (!value || value.length > 128 || /[\0\r\n]/.test(value)) throw new Error('Identificador de asistencia no válido.');
  return `[${value.replace(/\]/g, ']]')}]`;
}
const punches = `${identifier(env.PAYROLL_ATTENDANCE_LINKED_SERVER)}.${identifier(env.PAYROLL_ATTENDANCE_DATABASE)}.[dbo].[CHECKINOUT]`;

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
FROM dbo.V_RH_EMPLEADOS_DIAS r
JOIN dbo.RH_EMPLEADOS e ON e.ID_EMPLEADO=r.ID_EMPLEADO
LEFT JOIN dbo.PL_TURNOS t ON t.ID_TURNO=e.ID_TURNO
LEFT JOIN Marcaciones m ON m.IdEmpleado=r.ID_EMPLEADO AND m.Dia=r.Fecha
WHERE r.Fecha>=@Desde AND r.Fecha<DATEADD(DAY,1,@Hasta)
  AND r.ID_TIPO_PLANILLA IN (SELECT ID_OBRA FROM dbo.PL_PARAMETROS_TIPO_PLANILLA WHERE ID_OBRA IS NOT NULL)`;

/** La cobertura se obtiene de la fuente viva, no de RH_Marcas ni de la copia diaria de STB_data. */
export const PAYROLL_ATTENDANCE_COVERAGE_QUERY = `
SELECT CONVERT(varchar(10),CAST(DATEADD(MINUTE,-@CorteMinutos,MAX(c.CHECKTIME)) AS date),23) UltimaFecha
FROM ${punches} c
WHERE c.CHECKTIME>=DATEADD(MINUTE,@CorteMinutos,CAST(@Desde AS datetime))
  AND c.CHECKTIME<DATEADD(MINUTE,@CorteMinutos,DATEADD(DAY,1,CAST(@Hasta AS datetime)))
  AND c.CHECKTIME<=COALESCE(@HastaMarca,GETDATE())`;
