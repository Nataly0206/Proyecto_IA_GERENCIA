/**
 * Servicio de los módulos de proceso (Recepción, Descabezado, Clasificado,
 * Exportaciones y Compra de Materia Prima). Misma arquitectura que
 * `dashboard.service.ts`: el SQL agrega a granularidad mínima y aquí se
 * consolida por período (día / mes) y se filtra por turno.
 */
import sql from 'mssql';
import { runQuery } from './sql.service';
import { runStbQuery } from './stb.service';
import { matchesTurno, pickNumber, pickString } from '../utils/rows';
import {
  ClasificadoResumen,
  CompraMpResumen,
  DescabezadoResumen,
  ExportacionesResumen,
  RecepcionResumen,
} from '../types/dashboard.types';
import {
  CLASIFICADO_DETALLE_QUERY,
  CLASIFICADO_RESUMEN_QUERY,
  COMPRA_MP_ORDENES_QUERY,
  COMPRA_MP_POR_PROVEEDOR_QUERY,
  COMPRA_MP_RESUMEN_QUERY,
  DESCABEZADO_POR_DIA_QUERY,
  DESCABEZADO_RESUMEN_QUERY,
  EXPORTACIONES_CONTENEDORES_QUERY,
  EXPORTACIONES_RESUMEN_QUERY,
  RECEPCION_POR_FINCA_QUERY,
  RECEPCION_RESUMEN_QUERY,
} from './procesos.queries';

export interface DashboardFilters {
  fechaInicial: string;
  fechaFinal: string;
  turno?: string;
}
type DataRow = Record<string, unknown>;

const round2 = (n: number): number => Number(n.toFixed(2));
const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dateParams(fechaInicial: string, fechaFinal: string) {
  return [
    { name: 'Fecha_Inicial', type: sql.Date, value: fechaInicial },
    { name: 'Fecha_Final', type: sql.Date, value: fechaFinal },
  ];
}

/** Ventana de N meses calendario que termina hoy (los reportes mensuales
 *  son independientes del filtro de fechas, igual que en el dashboard). */
function monthWindow(meses: number): [string, string] {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  return [formatDate(inicio), formatDate(hoy)];
}

const turnoNombre = (idTurno: number): string => (idTurno === 2 ? 'Turno B' : 'Turno A');

/** Suma `libras` por (período, dimensión) y ordena. Reutilizado por
 *  todas las tablas pivote de estos módulos. */
function aggregateByPeriod(
  groups: { dia: string; valor: string; libras: number }[],
  periodOf: (dia: string) => string,
): { periodo: string; valor: string; libras: number }[] {
  const map = new Map<string, { periodo: string; valor: string; libras: number }>();
  for (const g of groups) {
    if (!g.dia || !g.valor) continue;
    const periodo = periodOf(g.dia);
    const key = `${periodo}|${g.valor}`;
    const acc = map.get(key) ?? { periodo, valor: g.valor, libras: 0 };
    acc.libras += g.libras;
    map.set(key, acc);
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, libras: round2(c.libras) }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.valor.localeCompare(b.valor));
}

/** Totaliza `libras` por dimensión sobre todo el rango, con porcentaje. */
function aggregateTotal(
  groups: { valor: string; libras: number }[],
): { valor: string; libras: number; porcentaje: number }[] {
  const map = new Map<string, number>();
  for (const g of groups) {
    if (!g.valor) continue;
    map.set(g.valor, (map.get(g.valor) ?? 0) + g.libras);
  }
  const total = Array.from(map.values()).reduce((a, v) => a + v, 0);
  return Array.from(map.entries())
    .map(([valor, libras]) => ({
      valor,
      libras: round2(libras),
      porcentaje: total > 0 ? round2((libras / total) * 100) : 0,
    }))
    .sort((a, b) => b.libras - a.libras);
}

/* ================================================================== */
/* RECEPCIÓN                                                           */
/* ================================================================== */

export async function getRecepcionResumen(): Promise<RecepcionResumen> {
  const rows = await runStbQuery(RECEPCION_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  return {
    dia: formatDate(new Date()),
    actualizado: new Date().toISOString(),
    librasRecibidasHoy: round2(pickNumber(r, 'LibrasRecibidasHoy')),
    remisionesHoy: pickNumber(r, 'RemisionesHoy'),
    librasPendientesProcesar: round2(pickNumber(r, 'LibrasPendientesProcesar')),
    fincasActivasHoy: pickNumber(r, 'FincasActivasHoy'),
  };
}

async function fetchRecepcionFinca(fechaInicial: string, fechaFinal: string) {
  const rows = await runStbQuery(RECEPCION_POR_FINCA_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    dia: pickString(row, 'Dia'),
    valor: pickString(row, 'Finca') || 'Sin finca',
    libras: pickNumber(row, 'Libras'),
  }));
}

export async function getRecepcionPorFinca(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchRecepcionFinca(f.fechaInicial, f.fechaFinal);
  return aggregateTotal(groups).map(({ valor, libras, porcentaje }) => ({ finca: valor, libras, porcentaje }));
}

export async function getRecepcionPorFincaDia(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchRecepcionFinca(f.fechaInicial, f.fechaFinal);
  return aggregateByPeriod(groups, (d) => d).map(({ periodo, valor, libras }) => ({ periodo, finca: valor, libras }));
}

export async function getRecepcionPorFincaMes(_f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  const groups = await fetchRecepcionFinca(ini, fin);
  return aggregateByPeriod(groups, (d) => d.slice(0, 7)).map(({ periodo, valor, libras }) => ({ periodo, finca: valor, libras }));
}

/* ================================================================== */
/* DESCABEZADO                                                         */
/* ================================================================== */

export async function getDescabezadoResumen(): Promise<DescabezadoResumen> {
  const rows = await runStbQuery(DESCABEZADO_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  return {
    dia: formatDate(new Date()),
    actualizado: new Date().toISOString(),
    librasDescabezadasHoy: round2(pickNumber(r, 'LibrasDescabezadasHoy')),
    pagoHoy: round2(pickNumber(r, 'PagoHoy')),
    empleadosHoy: pickNumber(r, 'EmpleadosHoy'),
    librasPendientesDescabezar: round2(pickNumber(r, 'LibrasPendientesDescabezar')),
  };
}

async function fetchDescabezadoDia(fechaInicial: string, fechaFinal: string, turno?: string) {
  const rows = await runStbQuery(DESCABEZADO_POR_DIA_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows
    .map((row) => ({
      dia: pickString(row, 'Dia'),
      turno: turnoNombre(pickNumber(row, 'IdTurno')),
      libras: pickNumber(row, 'Libras'),
      valor: pickNumber(row, 'Valor'),
    }))
    .filter((g) => !turno || matchesTurno(g.turno, turno));
}

export async function getDescabezadoPorDia(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchDescabezadoDia(f.fechaInicial, f.fechaFinal, f.turno);
  return aggregateByPeriod(
    groups.map((g) => ({ dia: g.dia, valor: g.turno, libras: g.libras })),
    (d) => d,
  ).map(({ periodo, valor, libras }) => ({ periodo, turno: valor, libras }));
}

export async function getDescabezadoPorDiaMes(f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  const groups = await fetchDescabezadoDia(ini, fin, f.turno);
  return aggregateByPeriod(
    groups.map((g) => ({ dia: g.dia, valor: g.turno, libras: g.libras })),
    (d) => d.slice(0, 7),
  ).map(({ periodo, valor, libras }) => ({ periodo, turno: valor, libras }));
}

/* ================================================================== */
/* CLASIFICADO                                                         */
/* ================================================================== */

export async function getClasificadoResumen(): Promise<ClasificadoResumen> {
  const rows = await runStbQuery(CLASIFICADO_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  return {
    dia: formatDate(new Date()),
    actualizado: new Date().toISOString(),
    librasClasificadasHoy: round2(pickNumber(r, 'LibrasClasificadasHoy')),
    binsHoy: pickNumber(r, 'BinsHoy'),
    inventarioLibras: round2(pickNumber(r, 'InventarioLibras')),
    inventarioBins: pickNumber(r, 'InventarioBins'),
  };
}

interface ClasificadoGroup {
  dia: string;
  turno: string;
  maquina: string;
  talla: string;
  libras: number;
}

async function fetchClasificado(fechaInicial: string, fechaFinal: string, turno?: string): Promise<ClasificadoGroup[]> {
  const rows = await runStbQuery(CLASIFICADO_DETALLE_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows
    .map((row) => ({
      dia: pickString(row, 'Dia'),
      turno: turnoNombre(pickNumber(row, 'IdTurno')),
      maquina: pickString(row, 'Maquina') || 'Sin responsable',
      talla: pickString(row, 'Talla') || 'Sin talla',
      libras: pickNumber(row, 'Libras'),
    }))
    .filter((g) => !turno || matchesTurno(g.turno, turno));
}

export async function getClasificadoPorMaquina(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchClasificado(f.fechaInicial, f.fechaFinal, f.turno);
  return aggregateTotal(groups.map((g) => ({ valor: g.maquina, libras: g.libras })))
    .map(({ valor, libras, porcentaje }) => ({ maquina: valor, libras, porcentaje }));
}

export async function getClasificadoPorTalla(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchClasificado(f.fechaInicial, f.fechaFinal, f.turno);
  return aggregateTotal(groups.map((g) => ({ valor: g.talla, libras: g.libras })))
    .map(({ valor, libras, porcentaje }) => ({ talla: valor, libras, porcentaje }));
}

function clasificadoPeriod(groups: ClasificadoGroup[], field: 'maquina' | 'talla', periodOf: (d: string) => string, key: string) {
  return aggregateByPeriod(groups.map((g) => ({ dia: g.dia, valor: g[field], libras: g.libras })), periodOf)
    .map(({ periodo, valor, libras }) => ({ periodo, [key]: valor, libras }));
}

export async function getClasificadoPorTallaDia(f: DashboardFilters): Promise<DataRow[]> {
  return clasificadoPeriod(await fetchClasificado(f.fechaInicial, f.fechaFinal, f.turno), 'talla', (d) => d, 'talla');
}
export async function getClasificadoPorTallaMes(f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  return clasificadoPeriod(await fetchClasificado(ini, fin, f.turno), 'talla', (d) => d.slice(0, 7), 'talla');
}
export async function getClasificadoPorMaquinaDia(f: DashboardFilters): Promise<DataRow[]> {
  return clasificadoPeriod(await fetchClasificado(f.fechaInicial, f.fechaFinal, f.turno), 'maquina', (d) => d, 'maquina');
}
export async function getClasificadoPorMaquinaMes(f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  return clasificadoPeriod(await fetchClasificado(ini, fin, f.turno), 'maquina', (d) => d.slice(0, 7), 'maquina');
}

/* ================================================================== */
/* EXPORTACIONES                                                       */
/* ================================================================== */

export async function getExportacionesResumen(): Promise<ExportacionesResumen> {
  const rows = await runQuery(EXPORTACIONES_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  return {
    semanaInicio: pickString(r, 'SemanaInicio'),
    semanaFin: pickString(r, 'SemanaFin'),
    actualizado: new Date().toISOString(),
    contenedoresSemana: pickNumber(r, 'ContenedoresSemana'),
    contenedoresFrancia: pickNumber(r, 'ContenedoresFrancia'),
    contenedoresUK: pickNumber(r, 'ContenedoresUK'),
    librasSemana: round2(pickNumber(r, 'LibrasSemana')),
  };
}

interface ExportGroup {
  dia: string;
  contenedor: string;
  referencia: string;
  cliente: string;
  estilo: string;
  codigoExportacion: string;
  item: string;
  masteres: number;
  libras: number;
  unidades: number;
}

async function fetchExportGroups(fechaInicial: string, fechaFinal: string): Promise<ExportGroup[]> {
  const rows = await runQuery(EXPORTACIONES_CONTENEDORES_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    dia: pickString(row, 'Dia'),
    contenedor: pickString(row, 'Contenedor'),
    referencia: pickString(row, 'Referencia'),
    cliente: pickString(row, 'Cliente') || 'Sin cliente',
    estilo: pickString(row, 'Estilo') || 'Sin estilo',
    codigoExportacion: pickString(row, 'CodigoExportacion'),
    item: pickString(row, 'Item'),
    masteres: pickNumber(row, 'Masteres'),
    libras: pickNumber(row, 'Libras'),
    unidades: pickNumber(row, 'Unidades'),
  }));
}

export async function getExportacionesPorEstilo(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchExportGroups(f.fechaInicial, f.fechaFinal);
  return aggregateTotal(groups.map((g) => ({ valor: g.estilo, libras: g.libras })))
    .map(({ valor, libras, porcentaje }) => ({ estilo: valor, libras, porcentaje }));
}

/** Detalle por contenedor: una fila por (contenedor, estilo, código de
 *  exportación, item) con másteres, anillos por máster y libras. */
export async function getExportacionesContenedores(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchExportGroups(f.fechaInicial, f.fechaFinal);
  return groups
    .map((g) => ({
      fecha: g.dia.slice(0, 10),
      contenedor: g.contenedor,
      referencia: g.referencia,
      cliente: g.cliente,
      estilo: g.estilo,
      codigoExportacion: g.codigoExportacion || '—',
      item: g.item || '—',
      masteres: g.masteres,
      anillosXMaster: g.masteres > 0 ? round2(g.unidades / g.masteres) : 0,
      libras: round2(g.libras),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.contenedor.localeCompare(b.contenedor));
}

/** Contenedores exportados por período y cliente (para tabla pivote). */
function exportContainersByPeriod(groups: ExportGroup[], periodOf: (d: string) => string): DataRow[] {
  const map = new Map<string, { periodo: string; cliente: string; contenedores: Set<string> }>();
  for (const g of groups) {
    if (!g.dia || !g.contenedor) continue;
    const periodo = periodOf(g.dia);
    const key = `${periodo}|${g.cliente}`;
    const acc = map.get(key) ?? { periodo, cliente: g.cliente, contenedores: new Set<string>() };
    acc.contenedores.add(g.contenedor);
    map.set(key, acc);
  }
  return Array.from(map.values())
    .map((c) => ({ periodo: c.periodo, cliente: c.cliente, contenedores: c.contenedores.size }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.cliente.localeCompare(b.cliente));
}

export async function getExportacionesPorClienteDia(f: DashboardFilters): Promise<DataRow[]> {
  return exportContainersByPeriod(await fetchExportGroups(f.fechaInicial, f.fechaFinal), (d) => d.slice(0, 10));
}
export async function getExportacionesPorClienteMes(_f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  return exportContainersByPeriod(await fetchExportGroups(ini, fin), (d) => d.slice(0, 7));
}

/* ================================================================== */
/* COMPRA DE MATERIA PRIMA                                             */
/* ================================================================== */

export async function getCompraMpResumen(): Promise<CompraMpResumen> {
  const rows = await runQuery(COMPRA_MP_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  return {
    actualizado: new Date().toISOString(),
    ordenesPendientes: pickNumber(r, 'OrdenesPendientes'),
    ordenesTotales: pickNumber(r, 'OrdenesTotales'),
    kgFaltantes: round2(pickNumber(r, 'KgFaltantes')),
    masteresFaltantes: pickNumber(r, 'MasteresFaltantes'),
  };
}

/** Órdenes de compra pendientes de exportación por cliente. */
export async function getCompraMpOrdenes(): Promise<DataRow[]> {
  const rows = await runQuery(COMPRA_MP_ORDENES_QUERY, []);
  return rows
    .map((row) => ({
      noOrden: pickString(row, 'NoOrden'),
      fecha: pickString(row, 'Fecha'),
      cliente: pickString(row, 'Cliente') || 'Sin cliente',
      producto: pickString(row, 'Producto') || 'Sin producto',
      codigoExportacion: pickString(row, 'CodigoExportacion') || '—',
      estilo: pickString(row, 'Estilo') || 'Sin estilo',
      anillosXMaster: pickNumber(row, 'AnillosXMaster'),
      semanaETD: pickString(row, 'SemanaETD') || '—',
      kg: round2(pickNumber(row, 'Kg')),
      kgProducidos: round2(pickNumber(row, 'KgProducidos')),
      kgFaltantes: round2(pickNumber(row, 'KgFaltantes')),
      masteresFaltantes: pickNumber(row, 'MasteresFaltantes'),
      estado: pickString(row, 'Estado') || 'SIN ESTADO',
    }))
    .sort((a, b) => b.kgFaltantes - a.kgFaltantes);
}

async function fetchCompraProveedor(fechaInicial: string, fechaFinal: string) {
  const rows = await runQuery(COMPRA_MP_POR_PROVEEDOR_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    dia: pickString(row, 'Dia'),
    valor: pickString(row, 'Proveedor') || 'Sin proveedor',
    libras: pickNumber(row, 'Libras'),
  }));
}

export async function getCompraMpPorProveedor(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchCompraProveedor(f.fechaInicial, f.fechaFinal);
  return aggregateTotal(groups).map(({ valor, libras, porcentaje }) => ({ proveedor: valor, libras, porcentaje }));
}

export async function getCompraMpPorProveedorMes(_f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  const groups = await fetchCompraProveedor(ini, fin);
  return aggregateByPeriod(groups, (d) => d.slice(0, 7)).map(({ periodo, valor, libras }) => ({ periodo, proveedor: valor, libras }));
}
