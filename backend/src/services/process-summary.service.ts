import sql from 'mssql';
import { runStbQuery } from './stb.service';
import { runQuery } from './sql.service';
import { IQF_DAILY_RATE_QUERY } from './reports.queries';
import { withTtlCache } from '../utils/ttlCache';
import { pickNumber, pickString } from '../utils/rows';
import { PROCESS_NAMES, ProcessSample, summaryPeriods, summarizeSamples, sumEquipmentRates } from '../utils/processSummary';

const DESCABEZADO = `SELECT CONVERT(varchar(10), h.FECHA, 23) AS Dia,
 SUM(d.LIBRAS) AS Libras,
 DATEDIFF(SECOND, MIN(CAST(d.HORA AS time)), MAX(CAST(d.HORA AS time))) / 3600.0 AS Horas
 FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
 JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
 WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ISNULL(d.ANULADO, 0) = 0
 GROUP BY h.FECHA`;
const CLASIFICADO = `SELECT CONVERT(varchar(10), h.FECHA, 23) AS Dia, h.ID_TANQUE AS Maquina,
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

async function loadSamples(from: string, to: string, index: number): Promise<ProcessSample[]> {
  const params = [
    { name: 'Fecha_Inicial', type: sql.Date, value: from },
    { name: 'Fecha_Final', type: sql.Date, value: to },
  ];
  const query = [DESCABEZADO, CLASIFICADO, PELADO, IQF_DAILY_RATE_QUERY][index];
  const rows = index === 3 ? await runQuery(query, params) : await runStbQuery(query, params);
  return rows.map(row => ({
    day: pickString(row, 'Dia').slice(0, 10),
    pounds: pickNumber(row, index === 3 ? 'TotalLibras' : 'Libras'),
    hours: pickNumber(row, index === 3 ? 'TiempoHorasDecimales' : 'Horas'),
    ...(index === 1 ? { machineId: pickNumber(row, 'Maquina') } : {}),
    ...(index === 3 ? { machineId: Number(pickString(row, 'Linea').match(/\bIQF\s*[-#]?\s*(\d+)\b/i)?.[1] ?? 0) } : {}),
  }));
}

// Retain closed-day samples for an hour even when Redis is unavailable.
// Entries also share in-flight work between different users and refreshes.
const historyCache = new Map<string, { expires: number; promise: Promise<ProcessSample[]> }>();
function loadHistory(key: string, loader: () => Promise<ProcessSample[]>) {
  const existing = historyCache.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  for (const [oldKey, entry] of historyCache) if (entry.expires <= Date.now()) historyCache.delete(oldKey);
  const entry = { expires: Date.now() + 60 * 60_000, promise: Promise.resolve([] as ProcessSample[]) };
  entry.promise = withTtlCache(key, 60 * 60_000, loader).then(value => {
    entry.expires = Date.now() + 60 * 60_000;
    return value;
  }).catch(error => { if (historyCache.get(key) === entry) historyCache.delete(key); throw error; });
  historyCache.set(key, entry);
  return entry.promise;
}

export async function getProcessSummary(today: string, refresh = false, process?: string) {
  const periods = summaryPeriods(today);
  const from = periods.map(period => period.from).sort()[0];
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const to = yesterday.toISOString().slice(0, 10);
  const rows = await Promise.all(PROCESS_NAMES.map(async (name, index) => {
    if (process && process !== name) return null;
    const [history, current] = await Promise.all([
      from <= to ? loadHistory(`resumen-procesos:history-v5:${name}:${from}:${to}`,
        () => loadSamples(from, to, index)) : Promise.resolve([] as ProcessSample[]),
      withTtlCache(`resumen-procesos:today-v5:${name}:${today}`, 5 * 60_000,
        () => loadSamples(today, today, index), refresh),
    ]);
    const samples = [...history, ...current];
    return { process: name, method: index === 3 ? 'average' : 'weighted',
      ...(index === 1 || index === 3 ? { sums: Object.fromEntries(periods.map(period => [
        period.key, sumEquipmentRates(samples, period.from, period.to, index === 3),
      ])) } : {}),
      values: Object.fromEntries(periods.map(period => [period.key, summarizeSamples(
        index === 1 && period.key === 'year' ? samples.filter(sample => (sample.machineId ?? 0) > 0) : samples,
        period.from, period.to, index === 3)])) };
  }));
  return { today, updatedAt: new Date().toISOString(), periods, rows: rows.filter(row => row !== null) };
}

export function getCachedProcessSummary(today: string, refresh = false, process?: string) {
  return withTtlCache(`resumen-procesos:v5:${today}:${process ?? 'all'}`, 5 * 60_000,
    () => getProcessSummary(today, refresh, process), refresh);
}

/** Use the same keys as the API, so the first visitor can read Redis directly. */
export async function warmProcessSummary() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const results = await Promise.allSettled(PROCESS_NAMES.map(process => getCachedProcessSummary(today, false, process)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`[productividad] No se pudo preparar ${PROCESS_NAMES[index]}:`, result.reason);
  });
}
