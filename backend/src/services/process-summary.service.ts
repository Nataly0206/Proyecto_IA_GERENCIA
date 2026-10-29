import sql from 'mssql';
import { runStbQuery } from './stb.service';
import { runQuery } from './sql.service';
import { IQF_DAILY_RATE_QUERY } from './reports.queries';
import { pickNumber, pickString } from '../utils/rows';
import { PROCESS_NAMES, ProcessSample, summaryPeriods, summarizeSamples } from '../utils/processSummary';

const DESCABEZADO = `SELECT CONVERT(varchar(10), h.FECHA, 23) AS Dia,
 SUM(d.LIBRAS) AS Libras,
 DATEDIFF(SECOND, MIN(CAST(d.HORA AS time)), MAX(CAST(d.HORA AS time))) / 3600.0 AS Horas
 FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
 JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
 WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ISNULL(d.ANULADO, 0) = 0
 GROUP BY h.FECHA`;
const CLASIFICADO = `SELECT CONVERT(varchar(10), h.FECHA, 23) AS Dia,
 SUM(d.LIBRAS_NETA) AS Libras,
 DATEDIFF(SECOND, MIN(d.HORA_INICIO), MAX(d.HORA_FINAL)) / 3600.0 AS Horas
 FROM dbo.CL_LLENADO_RECIPIENTES h
 JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
 WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0
 GROUP BY h.FECHA, h.ID_TANQUE, d.IdTurno`;
// Same detail and daily time window as the existing peeling style reports.
const PELADO = `SELECT CONVERT(varchar(10), h.FECHA, 23) AS Dia,
 SUM(d.LIBRAS) AS Libras,
 DATEDIFF(SECOND, MIN(d.HORA), MAX(d.HORA)) / 3600.0 AS Horas
 FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
 JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO = h.ID_ASIGNACION_LIBRAS_EMPLEADO
 WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
 GROUP BY h.FECHA`;

export async function getProcessSummary(today: string) {
  const periods = summaryPeriods(today);
  const from = periods.map(period => period.from).sort()[0];
  const params = () => [
    { name: 'Fecha_Inicial', type: sql.Date, value: from },
    { name: 'Fecha_Final', type: sql.Date, value: today },
  ];
  const results = await Promise.all([
    runStbQuery(DESCABEZADO, params()), runStbQuery(CLASIFICADO, params()),
    runStbQuery(PELADO, params()), runQuery(IQF_DAILY_RATE_QUERY, params()),
  ]);
  return { today, updatedAt: new Date().toISOString(), periods,
    rows: PROCESS_NAMES.map((process, index) => {
      const samples: ProcessSample[] = results[index].map(row => ({
        day: pickString(row, 'Dia').slice(0, 10),
        pounds: pickNumber(row, index === 3 ? 'TotalLibras' : 'Libras'),
        hours: pickNumber(row, index === 3 ? 'TiempoHorasDecimales' : 'Horas'),
      }));
      return { process, method: index === 3 ? 'average' : 'weighted',
        values: Object.fromEntries(periods.map(period => [period.key, summarizeSamples(samples, period.from, period.to, index === 3)])) };
    }),
  };
}
