import sql from 'mssql';
import { runStbQuery } from './stb.service';
import { pickNumber, pickString } from '../utils/rows';
import type { StaffLocationRow } from './production-staff-location.model';

export function staffLocationsQuery(count: number) {
  return `WITH Personas AS (SELECT IdEmpleado FROM (VALUES ${Array.from({ length: count }, (_, index) => `(@Id${index})`).join(',')}) ids(IdEmpleado)),
  Pesadas AS (
    SELECT e.ID_EMPLEADO IdEmpleado, h.FECHA Dia, CONVERT(varchar(8),d.HORA,108) Hora,
      'Pelado' Proceso, s.NOMBRE_SALA Sala
    FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
    JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
    JOIN dbo.PES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
    JOIN Personas ids ON ids.IdEmpleado=e.ID_EMPLEADO
    LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=d.ID_LINEA_ACTUAL
    LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
    WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND d.ANULADO=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@Corte AS time) OR d.HORA IS NULL)
    UNION ALL
    SELECT e.ID_EMPLEADO,h.FECHA,CONVERT(varchar(8),d.HORA,108),'Descabezado',NULL
    FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
    JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO=h.ID_ASIG_LBRS_EMPLEADO
    JOIN dbo.DES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADO_LINEA=d.ID_EMPLEADO_LINEA
    JOIN Personas ids ON ids.IdEmpleado=e.ID_EMPLEADO
    WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND ISNULL(d.ANULADO,0)=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@Corte AS time) OR d.HORA IS NULL)
  ), Ultimas AS (
    SELECT *,DENSE_RANK() OVER(PARTITION BY IdEmpleado ORDER BY Dia DESC,Hora DESC) posicion FROM Pesadas
  ), Ubicaciones AS (
    SELECT DISTINCT IdEmpleado,'production' Fuente,CONVERT(varchar(10),Dia,23) Dia,Hora,Proceso,Sala,CAST(NULL AS varchar(200)) Linea FROM Ultimas WHERE posicion=1
    UNION ALL
    SELECT e.ID_EMPLEADO,'assignment',NULL,NULL,'Pelado',s.NOMBRE_SALA,NULL
    FROM dbo.PES_EMPLEADOS_LINEAS e
    JOIN Personas ids ON ids.IdEmpleado=e.ID_EMPLEADO
    LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=e.ID_LINEA
    LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
    WHERE @Actual=1 AND e.ACTIVO=1
    UNION ALL
    SELECT e.ID_EMPLEADO,'assignment',NULL,NULL,'Descabezado',NULL,NULL
    FROM dbo.DES_EMPLEADOS_LINEAS e JOIN Personas ids ON ids.IdEmpleado=e.ID_EMPLEADO
    WHERE @Actual=1 AND e.ACTIVO=1
    UNION ALL
    SELECT f.IdEmpleado,'activation',CONVERT(varchar(10),f.Fecha,23),NULL,p.NOMBRE_PROCESO,NULL,NULL
    FROM Personas ids
    CROSS APPLY (SELECT TOP(1) f.* FROM dbo.DCP_EmpleadosDeptosFechas f WHERE f.IdEmpleado=ids.IdEmpleado AND f.Fecha=@Hasta ORDER BY f.FechaHora DESC,f.IdEmpleadoDepto DESC) f
    LEFT JOIN dbo.DCP_PROCESOS p ON p.ID_PROCESO=f.IdProceso
    WHERE f.Activo=1
    UNION ALL
    SELECT a.IdEmpleado,'activity',CONVERT(varchar(10),a.Fecha,23),CONVERT(varchar(8),a.HoraDesde,108),p.Proceso,NULL,a.LineaProduccion
    FROM dbo.VAsistenciaActividades a JOIN Personas ids ON ids.IdEmpleado=a.IdEmpleado
    OUTER APPLY (SELECT TOP(1) p.NOMBRE_PROCESO Proceso FROM dbo.dcp_LineasProduccion l JOIN dbo.DCP_PROCESOS p ON p.ID_PROCESO=l.IdProceso WHERE l.LineaProduccion=a.LineaProduccion ORDER BY l.Activa DESC,l.IdLineaProduccion) p
    WHERE a.Fecha=@Hasta AND (a.HoraDesde<=CAST(@Corte AS time) OR a.HoraDesde IS NULL)
    UNION ALL
    SELECT a.idempleado,'workday',CONVERT(varchar(10),a.Fecha,23),NULL,a.Proceso,NULL,a.LineaProduccion
    FROM dbo.V_EmpleadosObraActividades a JOIN Personas ids ON ids.IdEmpleado=a.idempleado WHERE a.Fecha=@Hasta
  )
  SELECT DISTINCT u.*,COALESCE(nombre.NombreEmpleado,e.NombreEmpleado) Nombre
  FROM Ubicaciones u
  OUTER APPLY (SELECT TOP(1) f.NombreEmpleado FROM dbo.DCP_EmpleadosDeptosFechas f WHERE f.IdEmpleado=u.IdEmpleado AND f.Fecha<=@Hasta ORDER BY f.Fecha DESC,f.FechaHora DESC,f.IdEmpleadoDepto DESC) nombre
  OUTER APPLY (SELECT TOP(1) e.NombreEmpleado FROM dbo.DCP_EmpleadosDeptos e WHERE e.IdEmpleado=u.IdEmpleado ORDER BY e.IdEmpleadoDepto DESC) e`;
}
export async function getStaffLocations(ids: number[], day: string, currentDay: string): Promise<StaffLocationRow[]> {
  const from = new Date(`${day}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 30);
  const cutoff = day === currentDay ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Tegucigalpa', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()) : '23:59:59';
  const batches: number[][] = [];
  for (let offset = 0; offset < ids.length; offset += 500) batches.push(ids.slice(offset, offset + 500));
  const result = await Promise.all(batches.map(async batch => {
    const rows = await runStbQuery(staffLocationsQuery(batch.length), [
      { name: 'Desde', type: sql.Date, value: from.toISOString().slice(0, 10) },
      { name: 'Hasta', type: sql.Date, value: day }, { name: 'Actual', type: sql.Bit, value: day === currentDay },
      { name: 'Corte', type: sql.VarChar(8), value: cutoff },
      ...batch.map((value, index) => ({ name: `Id${index}`, type: sql.Int, value })),
    ]);
    return rows.map(row => ({ id: pickNumber(row, 'IdEmpleado'), name: pickString(row, 'Nombre'),
      source: pickString(row, 'Fuente') as StaffLocationRow['source'], day: pickString(row, 'Dia'), time: pickString(row, 'Hora'),
      process: pickString(row, 'Proceso'), room: pickString(row, 'Sala'), line: pickString(row, 'Linea') }));
  }));
  return result.flat();
}
