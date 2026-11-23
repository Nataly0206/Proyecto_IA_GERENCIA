import sql from 'mssql';
import { STAFF_CHECKS_FROM } from './production-staff.queries';
import { env } from '../config/env';
import { withTtlCache } from '../utils/ttlCache';
import { runStbQuery } from './stb.service';
import { pickNumber, pickString } from '../utils/rows';
import type { StaffLocationRow } from './production-staff-location.model';

// Sin lista de IDs: con ~1.100 parámetros en VALUES, SQL Server elegía planes de varios segundos.
// Leer todo el día (o el histórico) y filtrar en Node es ~10x más rápido.
export function staffLocationsQuery(historicalOnly = false) {
  return `WITH Pesadas AS (
    SELECT e.ID_EMPLEADO IdEmpleado, h.FECHA Dia, CONVERT(varchar(8),d.HORA,108) Hora,
      'Pelado' Proceso, s.NOMBRE_SALA Sala
    FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
    JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
    JOIN dbo.PES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
    LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=d.ID_LINEA_ACTUAL
    LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
    WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND d.ANULADO=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@Corte AS time) OR d.HORA IS NULL)
    UNION ALL
    SELECT e.ID_EMPLEADO,h.FECHA,CONVERT(varchar(8),d.HORA,108),'Descabezado',NULL
    FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
    JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO=h.ID_ASIG_LBRS_EMPLEADO
    JOIN dbo.DES_EMPLEADOS_LINEAS e ON e.ID_EMPLEADO_LINEA=d.ID_EMPLEADO_LINEA
    WHERE h.FECHA>=@Desde AND h.FECHA<DATEADD(DAY,1,@Hasta) AND ISNULL(d.ANULADO,0)=0 AND d.LIBRAS>0 AND (h.FECHA<@Hasta OR d.HORA<=CAST(@Corte AS time) OR d.HORA IS NULL)
  ), Ultimas AS (
    SELECT *,DENSE_RANK() OVER(PARTITION BY IdEmpleado ORDER BY Dia DESC,Hora DESC) posicion FROM Pesadas
  )
  SELECT DISTINCT IdEmpleado,'production' Fuente,CONVERT(varchar(10),Dia,23) Dia,Hora,Proceso,Sala,CAST(NULL AS varchar(200)) Linea,CAST(NULL AS decimal(18,2)) Valor,CAST(NULL AS varchar(200)) Actividad,CAST(NULL AS varchar(8)) HoraHasta FROM Ultimas WHERE posicion=1
  ${historicalOnly ? `
  UNION ALL
  SELECT IdEmpleado,'lastLine',CONVERT(varchar(10),Fecha,23),Hora,Proceso,NULL,LineaProduccion,NULL,Actividad,HoraHasta
  FROM (
    SELECT d.IdEmpleado,h.Fecha,CONVERT(varchar(8),d.HoraDesde,108) Hora,p.NOMBRE_PROCESO Proceso,l.LineaProduccion,a.Actividad,
      CONVERT(varchar(8),d.HoraHasta,108) HoraHasta,
      ROW_NUMBER() OVER(PARTITION BY d.IdEmpleado ORDER BY h.Fecha DESC,d.HoraDesde DESC,d.IdPagoGrupalAsistenciaDetalle DESC) orden
    ${STAFF_CHECKS_FROM}
    WHERE h.Fecha>=@Desde AND h.Fecha<=@Hasta AND d.HoraDesde IS NOT NULL
  ) u WHERE orden=1` : `
  UNION ALL
  SELECT e.ID_EMPLEADO,'assignment',NULL,NULL,'Pelado',s.NOMBRE_SALA,NULL,NULL,NULL,NULL
  FROM dbo.PES_EMPLEADOS_LINEAS e
  LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=e.ID_LINEA
  LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
  WHERE @Actual=1 AND e.ACTIVO=1
  UNION ALL
  SELECT e.ID_EMPLEADO,'assignment',NULL,NULL,'Descabezado',NULL,NULL,NULL,NULL,NULL
  FROM dbo.DES_EMPLEADOS_LINEAS e
  WHERE @Actual=1 AND e.ACTIVO=1
  UNION ALL
  SELECT f.IdEmpleado,'activation',CONVERT(varchar(10),f.Fecha,23),NULL,p.NOMBRE_PROCESO,NULL,NULL,NULL,NULL,NULL
  FROM (
    SELECT f.IdEmpleado,f.Fecha,f.IdProceso,f.Activo,
      ROW_NUMBER() OVER(PARTITION BY f.IdEmpleado ORDER BY f.FechaHora DESC,f.IdEmpleadoDepto DESC) orden
    FROM dbo.DCP_EmpleadosDeptosFechas f
    WHERE f.Fecha=@Hasta
  ) f
  LEFT JOIN dbo.DCP_PROCESOS p ON p.ID_PROCESO=f.IdProceso
  WHERE f.Activo=1 AND f.orden=1
  UNION ALL
  SELECT d.IdEmpleado,'activity',CONVERT(varchar(10),h.Fecha,23),CONVERT(varchar(8),d.HoraDesde,108),p.NOMBRE_PROCESO,NULL,l.LineaProduccion,NULL,a.Actividad,CONVERT(varchar(8),d.HoraHasta,108)
  ${STAFF_CHECKS_FROM}
  WHERE h.Fecha=@Hasta AND d.HoraDesde IS NOT NULL AND d.HoraDesde<=CAST(@Corte AS time)`}`;
}

/** Nombre vigente al día consultado; si no hay registro fechado, el del catálogo de departamentos. */
export const staffNamesQuery = `WITH NombresFecha AS (
    SELECT IdEmpleado,NombreEmpleado,
      ROW_NUMBER() OVER(PARTITION BY IdEmpleado ORDER BY Fecha DESC,FechaHora DESC,IdEmpleadoDepto DESC) orden
    FROM dbo.DCP_EmpleadosDeptosFechas WHERE Fecha<=@Hasta
  ), NombresEmpleado AS (
    SELECT IdEmpleado,NombreEmpleado,ROW_NUMBER() OVER(PARTITION BY IdEmpleado ORDER BY IdEmpleadoDepto DESC) orden
    FROM dbo.DCP_EmpleadosDeptos
  )
  SELECT COALESCE(f.IdEmpleado,e.IdEmpleado) IdEmpleado,COALESCE(f.NombreEmpleado,e.NombreEmpleado) Nombre
  FROM (SELECT * FROM NombresFecha WHERE orden=1) f
  FULL JOIN (SELECT * FROM NombresEmpleado WHERE orden=1) e ON e.IdEmpleado=f.IdEmpleado`;

type RawLocation = Omit<StaffLocationRow, 'name'>;
const isoDay = (base: string, offset: number) => {
  const date = new Date(`${base}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
async function loadLocations(start: string, end: string, current: boolean, cutoff: string, historicalOnly: boolean): Promise<RawLocation[]> {
  const rows = await runStbQuery(staffLocationsQuery(historicalOnly), [
    { name: 'Desde', type: sql.Date, value: start }, { name: 'Hasta', type: sql.Date, value: end },
    { name: 'Actual', type: sql.Bit, value: current }, { name: 'Corte', type: sql.VarChar(8), value: cutoff },
  ]);
  return rows.map(row => ({ id: pickNumber(row, 'IdEmpleado'),
    source: pickString(row, 'Fuente') as StaffLocationRow['source'], day: pickString(row, 'Dia'), time: pickString(row, 'Hora'),
    process: pickString(row, 'Proceso'), room: pickString(row, 'Sala'), line: pickString(row, 'Linea'), value: pickNumber(row, 'Valor'), activity: pickString(row, 'Actividad'), endTime: pickString(row, 'HoraHasta') }));
}

export async function getStaffLocations(ids: number[], day: string, currentDay: string, forceRefresh = false): Promise<StaffLocationRow[]> {
  if (!ids.length) return [];
  const wanted = new Set(ids);
  const isCurrent = day === currentDay;
  const cutoff = isCurrent ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Tegucigalpa', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()) : '23:59:59';
  // Las claves dependen solo del día: así las personas que marcan entrada durante la mañana no invalidan el caché.
  const scope = `${env.STB_DB_SERVER}:${env.STB_DB_DATABASE}:${day}`;
  const [history, names, current] = await Promise.all([
    withTtlCache(`personal:locations-history:v8:${scope}`, 60 * 60_000,
      () => loadLocations(isoDay(day, -30), isoDay(day, -1), false, '23:59:59', true), forceRefresh),
    withTtlCache(`personal:names:v1:${scope}`, 60 * 60_000, async () =>
      (await runStbQuery(staffNamesQuery, [{ name: 'Hasta', type: sql.Date, value: day }]))
        .map(row => [pickNumber(row, 'IdEmpleado'), pickString(row, 'Nombre')] as [number, string]), forceRefresh),
    loadLocations(day, day, isCurrent, cutoff, false),
  ]);
  const nameById = new Map(names);
  // Conserva exactamente la última pesada y sus empates, igual que la consulta de todo el rango.
  const rows = [...history, ...current].filter(row => wanted.has(row.id));
  const latest = new Map<number, string>();
  for (const row of rows) if (row.source === 'production') {
    const time = `${row.day}T${row.time}`;
    if (!latest.has(row.id) || time > latest.get(row.id)!) latest.set(row.id, time);
  }
  const seen = new Set<string>();
  return rows
    .filter(row => row.source !== 'production' || `${row.day}T${row.time}` === latest.get(row.id))
    .filter(row => { // Equivale al SELECT DISTINCT de la consulta original.
      const key = [row.id, row.source, row.day, row.time, row.process, row.room, row.line, row.value, row.activity, row.endTime].join('|');
      return !seen.has(key) && !!seen.add(key);
    })
    .map(row => ({ ...row, name: nameById.get(row.id) ?? '' }));
}
