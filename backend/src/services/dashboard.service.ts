import sql from 'mssql';
import { runQuery } from './sql.service';
import {
  IQF_DAILY_RATE_QUERY,
  IQF_LIVE_DAY_QUERY,
  IQF_LIVE_LINES_QUERY,
  IQF_LIVE_QUERY,
  NET_FROZEN_BY_PROCESS_DAILY_QUERY,
  NET_FROZEN_BY_PROCESS_QUERY,
} from './reports.queries';
import { matchesTurno, pickNumber, pickString } from '../utils/rows';
import {
  DashboardFilters,
  IqfLiveResponse,
  IqfRateRow,
  NetProcessPeriodRow,
  NetProcessRow,
} from '../types/dashboard.types';

function dateParams(fechaInicial: string, fechaFinal: string) {
  return [
    { name: 'Fecha_Inicial', type: sql.Date, value: fechaInicial },
    { name: 'Fecha_Final', type: sql.Date, value: fechaFinal },
  ];
}

const round2 = (n: number): number => Number(n.toFixed(2));

/* ------------------------------------------------------------------ */
/* Reporte 1: libras congeladas netas por tipo de proceso              */
/* (sin FRESH TAIL ni reempaque — exclusión hecha en el SQL)           */
/* ------------------------------------------------------------------ */

export async function getLibrasNetasPorProceso(
  filters: DashboardFilters,
): Promise<NetProcessRow[]> {
  const rows = await runQuery(
    NET_FROZEN_BY_PROCESS_QUERY,
    dateParams(filters.fechaInicial, filters.fechaFinal),
  );

  const porProceso = new Map<string, number>();
  for (const row of rows) {
    const proceso = pickString(row, 'Proceso');
    if (proceso === '') continue;
    if (filters.turno && !matchesTurno(pickString(row, 'Turno'), filters.turno)) continue;
    porProceso.set(proceso, (porProceso.get(proceso) ?? 0) + pickNumber(row, 'Libras'));
  }

  const total = Array.from(porProceso.values()).reduce((acc, v) => acc + v, 0);
  return Array.from(porProceso.entries())
    .map(([proceso, libras]) => ({
      proceso,
      libras: round2(libras),
      porcentaje: total > 0 ? round2((libras / total) * 100) : 0,
    }))
    .sort((a, b) => b.libras - a.libras);
}

/**
 * Libras netas por proceso, agrupadas por período (día o mes) además de
 * por tipo de proceso — alimenta la vista "Día" / "Mensual" del mismo
 * reporte, sin alterar la consulta ni el agregado "Total" original.
 */
async function fetchNetProcessGroups(
  fechaInicial: string,
  fechaFinal: string,
  turno?: string,
): Promise<{ dia: string; proceso: string; libras: number }[]> {
  const rows = await runQuery(
    NET_FROZEN_BY_PROCESS_DAILY_QUERY,
    dateParams(fechaInicial, fechaFinal),
  );
  return rows
    .filter((row) => !turno || matchesTurno(pickString(row, 'Turno'), turno))
    .map((row) => ({
      dia: pickString(row, 'Dia'),
      proceso: pickString(row, 'Proceso'),
      libras: pickNumber(row, 'Libras'),
    }))
    .filter((g) => g.dia !== '' && g.proceso !== '');
}

function aggregateNetProcessByPeriod(
  groups: { dia: string; proceso: string; libras: number }[],
  periodOf: (dia: string) => string,
): NetProcessPeriodRow[] {
  const map = new Map<string, { periodo: string; proceso: string; libras: number }>();
  for (const g of groups) {
    const periodo = periodOf(g.dia);
    const key = `${periodo}|${g.proceso}`;
    const acc = map.get(key) ?? { periodo, proceso: g.proceso, libras: 0 };
    acc.libras += g.libras;
    map.set(key, acc);
  }
  return Array.from(map.values())
    .map((c) => ({ periodo: c.periodo, proceso: c.proceso, libras: round2(c.libras) }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.proceso.localeCompare(b.proceso));
}

/** Libras netas por proceso, por día, dentro del rango de fechas filtrado. */
export async function getLibrasNetasPorProcesoDia(
  filters: DashboardFilters,
): Promise<NetProcessPeriodRow[]> {
  const groups = await fetchNetProcessGroups(filters.fechaInicial, filters.fechaFinal, filters.turno);
  return aggregateNetProcessByPeriod(groups, (dia) => dia);
}

/**
 * Libras netas por proceso, por mes. Usa una ventana de meses calendario
 * que termina hoy (independiente del filtro de fechas, que es para la
 * vista diaria), igual que el reporte mensual de rendimientos IQF.
 */
export async function getLibrasNetasPorProcesoMes(
  filters: DashboardFilters,
  meses: number,
): Promise<NetProcessPeriodRow[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const groups = await fetchNetProcessGroups(formatDate(inicio), formatDate(hoy), filters.turno);
  return aggregateNetProcessByPeriod(groups, (dia) => dia.slice(0, 7));
}

/* ------------------------------------------------------------------ */
/* Reportes 2 y 3: libras por hora IQF por día y por mes               */
/* ------------------------------------------------------------------ */

interface IqfGroup {
  dia: string;
  linea: string;
  libras: number;
  horas: number;
  /** Rendimiento del grupo (libras/horas), la unidad que promedia el reporte oficial */
  rate: number;
}

async function fetchIqfGroups(
  fechaInicial: string,
  fechaFinal: string,
  turno?: string,
): Promise<IqfGroup[]> {
  const rows = await runQuery(IQF_DAILY_RATE_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows
    .filter((row) => !turno || matchesTurno(pickString(row, 'Turno'), turno))
    .map((row) => {
      const libras = pickNumber(row, 'TotalLibras');
      const horas = pickNumber(row, 'TiempoHorasDecimales');
      return {
        dia: pickString(row, 'Dia'),
        linea: pickString(row, 'Linea'),
        libras,
        horas,
        rate: horas > 0 ? libras / horas : 0,
      };
    })
    .filter((g) => g.dia !== '' && g.linea !== '' && g.horas > 0);
}

/**
 * Consolida los grupos en celdas (período × línea IQF). El valor de cada
 * celda es el promedio simple de los rendimientos por grupo — misma
 * fórmula del reporte "RENDIMIENTOS IQF X HORA" de la planta (verificada
 * contra sus números).
 */
function aggregateCells(
  groups: IqfGroup[],
  periodOf: (dia: string) => string,
): IqfRateRow[] {
  const map = new Map<
    string,
    { periodo: string; linea: string; libras: number; horas: number; rateSum: number; grupos: number }
  >();
  for (const g of groups) {
    const periodo = periodOf(g.dia);
    const key = `${periodo}|${g.linea}`;
    const acc =
      map.get(key) ?? { periodo, linea: g.linea, libras: 0, horas: 0, rateSum: 0, grupos: 0 };
    acc.libras += g.libras;
    acc.horas += g.horas;
    acc.rateSum += g.rate;
    acc.grupos += 1;
    map.set(key, acc);
  }
  return Array.from(map.values())
    .map((c) => ({
      periodo: c.periodo,
      linea: c.linea,
      libras: round2(c.libras),
      horas: round2(c.horas),
      grupos: c.grupos,
      librasPorHora: round2(c.rateSum / c.grupos),
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.linea.localeCompare(b.linea));
}

/** Libras por hora IQF por día y línea, dentro del rango de fechas filtrado. */
export async function getIqfLibrasHoraDia(filters: DashboardFilters): Promise<IqfRateRow[]> {
  const groups = await fetchIqfGroups(filters.fechaInicial, filters.fechaFinal, filters.turno);
  return aggregateCells(groups, (dia) => dia);
}

const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Libras por hora IQF por mes. Usa una ventana de meses calendario que
 * termina hoy (independiente del filtro de fechas, que es para la vista
 * diaria); el turno sí se respeta.
 */
export async function getIqfLibrasHoraMes(
  filters: DashboardFilters,
  meses: number,
): Promise<IqfRateRow[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const groups = await fetchIqfGroups(formatDate(inicio), formatDate(hoy), filters.turno);
  return aggregateCells(groups, (dia) => dia.slice(0, 7));
}

/* ------------------------------------------------------------------ */
/* Contadores IQF en tiempo real (acumulado del día de producción)     */
/* ------------------------------------------------------------------ */

/** "A" / "Turno A" → "Turno A" (formato almacenado en la base) */
function normalizeTurnoDb(turno?: string): string | null {
  if (!turno) return null;
  const limpio = turno.trim();
  return /^turno/i.test(limpio) ? limpio : `Turno ${limpio.toUpperCase()}`;
}

/** Tarjeta en cero para líneas del catálogo sin producción en el día */
const lineaSinActividad = (linea: string) => ({
  linea,
  libras: 0,
  cajas: 0,
  librasUltimaHora: 0,
  librasPorHora: 0,
  primeraCaja: '',
  ultimaCaja: '',
  minutosDesdeUltima: -1,
  activa: false,
});

export async function getIqfTiempoReal(turno?: string): Promise<IqfLiveResponse> {
  const diaRows = await runQuery(IQF_LIVE_DAY_QUERY, []);
  const dia = diaRows.length > 0 ? pickString(diaRows[0], 'Dia') : '';
  if (dia === '') {
    return { dia: '', actualizado: new Date().toISOString(), lineas: [] };
  }

  const [catalogoRows, rows] = await Promise.all([
    runQuery(IQF_LIVE_LINES_QUERY, []),
    runQuery(IQF_LIVE_QUERY, [
      { name: 'Dia', type: sql.Date, value: dia },
      { name: 'Turno', type: sql.VarChar, value: normalizeTurnoDb(turno) },
    ]),
  ]);

  const conDatos = new Map(
    rows.map((row) => {
      const libras = pickNumber(row, 'Libras');
      const minutosTrabajados = pickNumber(row, 'MinutosTrabajados');
      const minutosDesdeUltima = pickNumber(row, 'MinutosDesdeUltima');
      const linea = pickString(row, 'Linea');
      return [
        linea,
        {
          linea,
          libras: round2(libras),
          cajas: pickNumber(row, 'Cajas'),
          librasUltimaHora: round2(pickNumber(row, 'LibrasUltimaHora')),
          // Con menos de 10 minutos de ventana la extrapolación a lbs/hora
          // no es representativa; se reporta 0 y el frontend muestra "—".
          librasPorHora:
            minutosTrabajados >= 10 ? round2(libras / (minutosTrabajados / 60)) : 0,
          primeraCaja: pickString(row, 'PrimeraCaja'),
          ultimaCaja: pickString(row, 'UltimaCaja'),
          minutosDesdeUltima,
          activa: minutosDesdeUltima <= 15,
        },
      ] as const;
    }),
  );

  // Catálogo (últimos 60 días) + cualquier línea con datos hoy que no
  // esté en el catálogo: siempre se muestran todas, en cero si no produjeron.
  const nombres = new Set<string>(
    catalogoRows.map((r) => pickString(r, 'Linea')).filter((n) => n !== ''),
  );
  for (const linea of conDatos.keys()) nombres.add(linea);

  const lineas = Array.from(nombres)
    .sort()
    .map((nombre) => conDatos.get(nombre) ?? lineaSinActividad(nombre));

  return { dia, actualizado: new Date().toISOString(), lineas };
}
