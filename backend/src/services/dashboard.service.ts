import sql from 'mssql';
import { runQuery } from './sql.service';
import { runStbQuery } from './stb.service';
import {
  IQF_DAILY_RATE_QUERY,
  IQF_LIVE_LINES_QUERY,
  IQF_LIVE_QUERY,
  NET_FROZEN_BY_PROCESS_DAILY_QUERY,
  NET_FROZEN_BY_PROCESS_QUERY,
  PELADO_LIVE_ORDENES_ACTIVAS_QUERY,
  PELADO_LIVE_QUERY,
  PELADO_LIVE_STYLES_QUERY,
} from './reports.queries';
import {
  PELADO_BY_DIMENSION_DAILY_QUERY,
  PELADO_BY_DIMENSION_QUERY,
  PELADO_PERSONAL_DAILY_QUERY,
} from './stb.queries';
import { matchesTurno, pickNumber, pickString } from '../utils/rows';
import {
  DashboardFilters,
  IqfLiveResponse,
  IqfRateRow,
  NetProcessPeriodRow,
  NetProcessRow,
  PeladoLiveResponse,
  PeladoPersonalPeriodRow,
  PeladoPersonalRow,
  PeladoStylePeriodRow,
  PeladoStyleRow,
  PeladoTallaPeriodRow,
  PeladoTallaRow,
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

export async function getIqfTiempoReal(): Promise<IqfLiveResponse> {
  const [catalogoRows, rows] = await Promise.all([
    runQuery(IQF_LIVE_LINES_QUERY, []),
    runQuery(IQF_LIVE_QUERY, []),
  ]);
  const dia = pickString(catalogoRows[0] ?? rows[0] ?? {}, 'Dia') || formatDate(new Date());
  const conDatos = new Map(
    rows.map((row) => {
      const linea = pickString(row, 'Linea');
      const minutosDesdeUltima = pickNumber(row, 'MinutosDesdeUltima');
      return [
        linea,
        {
          linea,
          libras: round2(pickNumber(row, 'Libras')),
          cajas: 0,
          librasUltimaHora: 0,
          librasPorHora: 0,
          primeraCaja: '',
          ultimaCaja: pickString(row, 'UltimaCaja'),
          minutosDesdeUltima,
          activa: minutosDesdeUltima >= 0 && minutosDesdeUltima <= 15,
        },
      ] as const;
    }),
  );
  const nombres = new Set(
    catalogoRows.map((row) => pickString(row, 'Linea')).filter(Boolean),
  );
  for (const linea of conDatos.keys()) {
    if (linea) nombres.add(linea);
  }
  const lineas = Array.from(nombres)
    .sort()
    .map((linea) => conDatos.get(linea) ?? {
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

  return { dia, actualizado: new Date().toISOString(), lineas };
}

/* ------------------------------------------------------------------ */
/* Reporte de pelado: libras por Estilo o por Talla (fuente STB_data,   */
/* vista V_PagosxPeladoIndividualPBI — datos reales de asignación de   */
/* libras, no producción). Un mismo fetch trae ambas dimensiones; cada  */
/* endpoint agrega por la que le corresponde, sumando la otra.          */
/* ------------------------------------------------------------------ */

interface PeladoDimensionGroup {
  turno: string;
  estilo: string;
  talla: string;
  libras: number;
}

async function fetchPeladoDimensionGroups(
  fechaInicial: string,
  fechaFinal: string,
): Promise<PeladoDimensionGroup[]> {
  const rows = await runStbQuery(PELADO_BY_DIMENSION_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    turno: pickString(row, 'Turno'),
    estilo: pickString(row, 'Estilo'),
    talla: pickString(row, 'Talla'),
    libras: pickNumber(row, 'Libras'),
  }));
}

function aggregateDimensionTotal(
  groups: PeladoDimensionGroup[],
  turno: string | undefined,
  field: 'estilo' | 'talla',
): { valor: string; libras: number; porcentaje: number }[] {
  const porValor = new Map<string, number>();
  for (const g of groups) {
    if (turno && !matchesTurno(g.turno, turno)) continue;
    const valor = g[field];
    if (valor === '') continue;
    porValor.set(valor, (porValor.get(valor) ?? 0) + g.libras);
  }
  const total = Array.from(porValor.values()).reduce((acc, v) => acc + v, 0);
  return Array.from(porValor.entries())
    .map(([valor, libras]) => ({
      valor,
      libras: round2(libras),
      porcentaje: total > 0 ? round2((libras / total) * 100) : 0,
    }))
    .sort((a, b) => b.libras - a.libras);
}

/** Libras peladas por estilo, totalizadas sobre el rango de fechas filtrado. */
export async function getPeladoPorEstilo(filters: DashboardFilters): Promise<PeladoStyleRow[]> {
  const groups = await fetchPeladoDimensionGroups(filters.fechaInicial, filters.fechaFinal);
  return aggregateDimensionTotal(groups, filters.turno, 'estilo')
    .map(({ valor, libras, porcentaje }) => ({ estilo: valor, libras, porcentaje }));
}

/** Libras peladas por talla, totalizadas sobre el rango de fechas filtrado. */
export async function getPeladoPorTalla(filters: DashboardFilters): Promise<PeladoTallaRow[]> {
  const groups = await fetchPeladoDimensionGroups(filters.fechaInicial, filters.fechaFinal);
  return aggregateDimensionTotal(groups, filters.turno, 'talla')
    .map(({ valor, libras, porcentaje }) => ({ talla: valor, libras, porcentaje }));
}

interface PeladoDimensionDailyGroup extends PeladoDimensionGroup {
  dia: string;
}

async function fetchPeladoDimensionDailyGroups(
  fechaInicial: string,
  fechaFinal: string,
): Promise<PeladoDimensionDailyGroup[]> {
  const rows = await runStbQuery(
    PELADO_BY_DIMENSION_DAILY_QUERY,
    dateParams(fechaInicial, fechaFinal),
  );
  return rows
    .map((row) => ({
      dia: pickString(row, 'Dia'),
      turno: pickString(row, 'Turno'),
      estilo: pickString(row, 'Estilo'),
      talla: pickString(row, 'Talla'),
      libras: pickNumber(row, 'Libras'),
    }))
    .filter((g) => g.dia !== '');
}

function aggregateDimensionByPeriod(
  groups: PeladoDimensionDailyGroup[],
  turno: string | undefined,
  field: 'estilo' | 'talla',
  periodOf: (dia: string) => string,
): { periodo: string; valor: string; libras: number }[] {
  const map = new Map<string, { periodo: string; valor: string; libras: number }>();
  for (const g of groups) {
    if (turno && !matchesTurno(g.turno, turno)) continue;
    const valor = g[field];
    if (valor === '') continue;
    const periodo = periodOf(g.dia);
    const key = `${periodo}|${valor}`;
    const acc = map.get(key) ?? { periodo, valor, libras: 0 };
    acc.libras += g.libras;
    map.set(key, acc);
  }
  return Array.from(map.values())
    .map((c) => ({ periodo: c.periodo, valor: c.valor, libras: round2(c.libras) }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.valor.localeCompare(b.valor));
}

/** Libras peladas por estilo, por día, dentro del rango de fechas filtrado. */
export async function getPeladoPorEstiloDia(
  filters: DashboardFilters,
): Promise<PeladoStylePeriodRow[]> {
  const groups = await fetchPeladoDimensionDailyGroups(filters.fechaInicial, filters.fechaFinal);
  return aggregateDimensionByPeriod(groups, filters.turno, 'estilo', (dia) => dia)
    .map(({ periodo, valor, libras }) => ({ periodo, estilo: valor, libras }));
}

/**
 * Libras peladas por estilo, por mes. Usa una ventana de meses calendario
 * que termina hoy (independiente del filtro de fechas), igual que el
 * resto de los reportes mensuales del dashboard.
 */
export async function getPeladoPorEstiloMes(
  filters: DashboardFilters,
  meses: number,
): Promise<PeladoStylePeriodRow[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const groups = await fetchPeladoDimensionDailyGroups(formatDate(inicio), formatDate(hoy));
  return aggregateDimensionByPeriod(groups, filters.turno, 'estilo', (dia) => dia.slice(0, 7))
    .map(({ periodo, valor, libras }) => ({ periodo, estilo: valor, libras }));
}

/** Libras peladas por talla, por día, dentro del rango de fechas filtrado. */
export async function getPeladoPorTallaDia(
  filters: DashboardFilters,
): Promise<PeladoTallaPeriodRow[]> {
  const groups = await fetchPeladoDimensionDailyGroups(filters.fechaInicial, filters.fechaFinal);
  return aggregateDimensionByPeriod(groups, filters.turno, 'talla', (dia) => dia)
    .map(({ periodo, valor, libras }) => ({ periodo, talla: valor, libras }));
}

/** Libras peladas por talla, por mes (misma ventana que getPeladoPorEstiloMes). */
export async function getPeladoPorTallaMes(
  filters: DashboardFilters,
  meses: number,
): Promise<PeladoTallaPeriodRow[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const groups = await fetchPeladoDimensionDailyGroups(formatDate(inicio), formatDate(hoy));
  return aggregateDimensionByPeriod(groups, filters.turno, 'talla', (dia) => dia.slice(0, 7))
    .map(({ periodo, valor, libras }) => ({ periodo, talla: valor, libras }));
}

/* ------------------------------------------------------------------ */
/* Contadores de pelado en tiempo real (acumulado del día de           */
/* producción). No hay conteo real de personal en planta en la base    */
/* de datos (el módulo legado CodigosBin/MovimientosInvProceso está    */
/* vacío); `ordenesActivas` se usa como aproximación indirecta.        */
/* ------------------------------------------------------------------ */

export async function getPeladoTiempoReal(): Promise<PeladoLiveResponse> {
  const [catalogoRows, rows, ordenesRows] = await Promise.all([
    runQuery(PELADO_LIVE_STYLES_QUERY, []),
    runQuery(PELADO_LIVE_QUERY, []),
    runQuery(PELADO_LIVE_ORDENES_ACTIVAS_QUERY, []),
  ]);
  const dia = pickString(catalogoRows[0] ?? rows[0] ?? {}, 'Dia') || formatDate(new Date());
  const conDatos = new Map(
    rows.map((row) => {
      const estilo = pickString(row, 'Estilo');
      const minutosDesdeUltima = pickNumber(row, 'MinutosDesdeUltima');
      return [
        estilo,
        {
          estilo,
          libras: round2(pickNumber(row, 'Libras')),
          ultimaCaja: pickString(row, 'UltimaCaja'),
          minutosDesdeUltima,
          activo: minutosDesdeUltima >= 0 && minutosDesdeUltima <= 15,
        },
      ] as const;
    }),
  );
  const nombres = new Set(
    catalogoRows.map((row) => pickString(row, 'Estilo')).filter(Boolean),
  );
  for (const estilo of conDatos.keys()) {
    if (estilo) nombres.add(estilo);
  }
  const estilos = Array.from(nombres)
    .sort()
    .map((estilo) => conDatos.get(estilo) ?? {
      estilo,
      libras: 0,
      ultimaCaja: '',
      minutosDesdeUltima: -1,
      activo: false,
    });

  const ordenesActivas = pickNumber(ordenesRows[0] ?? {}, 'OrdenesActivas');

  return { dia, actualizado: new Date().toISOString(), estilos, ordenesActivas };
}

/* ------------------------------------------------------------------ */
/* Personal de pelado: headcount y pago reales (fuente STB_data,       */
/* vista V_PagosxPeladoIndividualPBI) — distinto de ordenesActivas,    */
/* que es un proxy de actividad sobre PlantaEmpacadora.                */
/* ------------------------------------------------------------------ */

interface PeladoPersonalGroup {
  dia: string;
  turno: string;
  idEmpleado: number;
  libras: number;
  valor: number;
}

async function fetchPeladoPersonalGroups(
  fechaInicial: string,
  fechaFinal: string,
): Promise<PeladoPersonalGroup[]> {
  const rows = await runStbQuery(
    PELADO_PERSONAL_DAILY_QUERY,
    dateParams(fechaInicial, fechaFinal),
  );
  return rows
    .map((row) => ({
      dia: pickString(row, 'Dia'),
      turno: pickString(row, 'Turno'),
      idEmpleado: pickNumber(row, 'IdEmpleado'),
      libras: pickNumber(row, 'Libras'),
      valor: pickNumber(row, 'Valor'),
    }))
    .filter((g) => g.dia !== '' && g.idEmpleado > 0);
}

function aggregatePeladoPersonalByPeriod(
  groups: PeladoPersonalGroup[],
  turno: string | undefined,
  periodOf: (dia: string) => string,
): PeladoPersonalPeriodRow[] {
  const map = new Map<
    string,
    { periodo: string; libras: number; valor: number; empleados: Set<number> }
  >();
  for (const g of groups) {
    if (turno && !matchesTurno(g.turno, turno)) continue;
    const periodo = periodOf(g.dia);
    const acc = map.get(periodo) ?? { periodo, libras: 0, valor: 0, empleados: new Set<number>() };
    acc.libras += g.libras;
    acc.valor += g.valor;
    acc.empleados.add(g.idEmpleado);
    map.set(periodo, acc);
  }
  return Array.from(map.values())
    .map((c) => ({
      periodo: c.periodo,
      empleados: c.empleados.size,
      libras: round2(c.libras),
      valor: round2(c.valor),
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/**
 * Headcount, libras y pago de pelado, totalizados sobre el rango de fechas
 * filtrado. Devuelve un arreglo de 0 o 1 filas (igual convención `DataRow[]`
 * que el resto de los endpoints de reporte) en vez de un objeto suelto.
 */
export async function getPeladoPersonal(filters: DashboardFilters): Promise<PeladoPersonalRow[]> {
  const groups = await fetchPeladoPersonalGroups(filters.fechaInicial, filters.fechaFinal);
  const filtered = groups.filter((g) => !filters.turno || matchesTurno(g.turno, filters.turno));
  if (filtered.length === 0) return [];
  const empleados = new Set(filtered.map((g) => g.idEmpleado));
  const libras = filtered.reduce((acc, g) => acc + g.libras, 0);
  const valor = filtered.reduce((acc, g) => acc + g.valor, 0);
  return [{ empleados: empleados.size, libras: round2(libras), valor: round2(valor) }];
}

/** Headcount, libras y pago de pelado, por día, dentro del rango de fechas filtrado. */
export async function getPeladoPersonalDia(
  filters: DashboardFilters,
): Promise<PeladoPersonalPeriodRow[]> {
  const groups = await fetchPeladoPersonalGroups(filters.fechaInicial, filters.fechaFinal);
  return aggregatePeladoPersonalByPeriod(groups, filters.turno, (dia) => dia);
}

/**
 * Headcount, libras y pago de pelado, por mes. Usa una ventana de meses
 * calendario que termina hoy (independiente del filtro de fechas), igual
 * que el resto de los reportes mensuales del dashboard.
 */
export async function getPeladoPersonalMes(
  filters: DashboardFilters,
  meses: number,
): Promise<PeladoPersonalPeriodRow[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const groups = await fetchPeladoPersonalGroups(formatDate(inicio), formatDate(hoy));
  return aggregatePeladoPersonalByPeriod(groups, filters.turno, (dia) => dia.slice(0, 7));
}
