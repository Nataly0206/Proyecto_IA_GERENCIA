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
import { withTtlCache } from '../utils/ttlCache';
import {
  ClasificadoResumen,
  CompraMpResumen,
  DescabezadoResumen,
  ExportacionesResumen,
  RecepcionResumen,
} from '../types/dashboard.types';
import {
  CLASIFICADO_DETALLE_QUERY,
  CLASIFICADO_INVENTARIO_QUERY,
  CLASIFICADO_INVENTARIO_DETALLE_QUERY,
  CLASIFICADO_RESUMEN_QUERY,
  COMPRA_MP_POR_ITEM_QUERY,
  COMPRA_MP_POR_TALLA_QUERY,
  COMPRA_MP_POR_PROVEEDOR_QUERY,
  COMPRA_MP_RESUMEN_QUERY,
  DESCABEZADO_POR_DIA_QUERY,
  DESCABEZADO_POR_MES_QUERY,
  DESCABEZADO_RESUMEN_QUERY,
  EXPORTACIONES_CONTENEDORES_QUERY,
  EXPORTACIONES_RESUMEN_QUERY,
  RECEPCION_REMISIONES_QUERY,
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
    librasRecibidasSemana: round2(pickNumber(r, 'LibrasRecibidasSemana')),
    librasRecibidasMes: round2(pickNumber(r, 'LibrasRecibidasMes')),
    librasPendientesProcesar: round2(pickNumber(r, 'LibrasPendientesProcesar')),
  };
}

/**
 * Detalle de remisiones recibidas (tabla estilo Power BI): una fila por
 * remisión, finca y laguna con libras de remisión, cola, cabeza y basura,
 * más los rendimientos cola/recepción ("finca") y cola/planta. Fuente:
 * vista `RemisionesPlantaPBI`.
 */
export async function getRecepcionRemisiones(f: DashboardFilters): Promise<DataRow[]> {
  const rows = await runStbQuery(RECEPCION_REMISIONES_QUERY, dateParams(f.fechaInicial, f.fechaFinal));
  return rows
    .map((row) => {
      const librasRemision = pickNumber(row, 'LibrasRemision');
      const librasCola = pickNumber(row, 'LibrasCola');
      const librasCabeza = pickNumber(row, 'LibrasCabeza');
      const totalColaCabeza = librasCola + librasCabeza;
      return {
        fecha: pickString(row, 'Fecha').slice(0, 10),
        remision: pickString(row, 'Remision') || '—',
        cliente: pickString(row, 'Cliente') || 'Sin cliente',
        codigoFinca: pickString(row, 'CodigoFinca') || '—',
        laguna: pickString(row, 'Laguna') || '—',
        librasRemision: round2(librasRemision),
        librasBasura: round2(pickNumber(row, 'LibrasBasura')),
        librasCola: round2(librasCola),
        librasCabeza: round2(librasCabeza),
        totalColaCabeza: round2(totalColaCabeza),
        rendimientoFinca: librasRemision > 0 ? round2((librasCola / librasRemision) * 100) : 0,
        rendimientoPlanta: totalColaCabeza > 0 ? round2((librasCola / totalColaCabeza) * 100) : 0,
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.remision.localeCompare(b.remision));
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
    librasDescabezadasDia: round2(pickNumber(r, 'LibrasDescabezadasDia')),
    librasDescabezadasSemana: round2(pickNumber(r, 'LibrasDescabezadasSemana')),
    librasDescabezadasMes: round2(pickNumber(r, 'LibrasDescabezadasMes')),
    personasDia: pickNumber(r, 'PersonasDia'),
  };
}

async function fetchDescabezadoDia(fechaInicial: string, fechaFinal: string) {
  const rows = await runStbQuery(DESCABEZADO_POR_DIA_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    fecha: pickString(row, 'Dia').slice(0, 10),
    personas: pickNumber(row, 'Personas'),
    cola: round2(pickNumber(row, 'Cola')),
    cabezas: round2(pickNumber(row, 'Cabezas')),
    librasPorHora: round2(pickNumber(row, 'LibrasPorHora')),
    total: round2(pickNumber(row, 'Total')),
    horas: pickNumber(row, 'Horas'),
  }));
}

export async function getDescabezadoPorDia(f: DashboardFilters): Promise<DataRow[]> {
  return fetchDescabezadoDia(f.fechaInicial, f.fechaFinal);
}

export async function getDescabezadoPorDiaMes(_f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  const rows = await runStbQuery(DESCABEZADO_POR_MES_QUERY, dateParams(ini, fin));
  return rows.map((row) => ({
    fecha: pickString(row, 'Mes'),
    personas: pickNumber(row, 'Personas'),
    cola: round2(pickNumber(row, 'Cola')),
    cabezas: round2(pickNumber(row, 'Cabezas')),
    librasPorHora: round2(pickNumber(row, 'LibrasPorHora')),
    total: round2(pickNumber(row, 'Total')),
    horas: pickNumber(row, 'Horas'),
  }));
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
    semanaInicio: pickString(r, 'SemanaInicio'),
    semanaFin: pickString(r, 'SemanaFin'),
    librasClasificadasHoy: round2(pickNumber(r, 'LibrasClasificadasHoy')),
    librasClasificadasSemana: round2(pickNumber(r, 'LibrasClasificadasSemana')),
    librasClasificadasMes: round2(pickNumber(r, 'LibrasClasificadasMes')),
  };
}

/**
 * Inventario de clasificado disponible: una fila por talla final con su
 * finca de origen predominante (la de más libras), bins, libras, días que
 * lleva represado el bin más antiguo de esa talla, y porcentaje sobre el
 * total disponible. Snapshot actual — sin filtros de fecha.
 */
export async function getClasificadoInventario(): Promise<DataRow[]> {
  const rows = await runStbQuery(CLASIFICADO_INVENTARIO_QUERY, []);
  const hoy = formatDate(new Date());
  const porTalla = new Map<
    string,
    { talla: string; bins: number; libras: number; fincas: Map<string, number>; fechaMasAntigua: string }
  >();
  for (const row of rows) {
    const talla = pickString(row, 'Talla') || 'Sin talla';
    const finca = pickString(row, 'Finca') || 'Sin finca';
    const bins = pickNumber(row, 'Bins');
    const libras = pickNumber(row, 'Libras');
    const fecha = pickString(row, 'FechaMasAntigua');
    const acc = porTalla.get(talla) ?? { talla, bins: 0, libras: 0, fincas: new Map(), fechaMasAntigua: fecha };
    acc.bins += bins;
    acc.libras += libras;
    acc.fincas.set(finca, (acc.fincas.get(finca) ?? 0) + libras);
    if (fecha && (!acc.fechaMasAntigua || fecha < acc.fechaMasAntigua)) acc.fechaMasAntigua = fecha;
    porTalla.set(talla, acc);
  }
  const total = Array.from(porTalla.values()).reduce((s, t) => s + t.libras, 0);
  return Array.from(porTalla.values())
    .map((t) => ({
      talla: t.talla,
      finca: Array.from(t.fincas.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      bins: t.bins,
      libras: round2(t.libras),
      diasEnInventario: t.fechaMasAntigua
        ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(t.fechaMasAntigua)) / 86400000))
        : 0,
      porcentaje: total > 0 ? round2((t.libras / total) * 100) : 0,
    }))
    .sort((a, b) => b.libras - a.libras);
}

export async function getClasificadoInventarioDetalle(): Promise<DataRow[]> {
  const rows = await runQuery(CLASIFICADO_INVENTARIO_DETALLE_QUERY, []);
  return rows.map((row) => ({
    finca: pickString(row, 'Finca') || 'Sin finca',
    lagunaCiclo: pickString(row, 'LagunaCiclo') || 'Sin laguna/ciclo',
    remision: pickString(row, 'Remision') || 'Sin remisión',
    lote: pickString(row, 'Lote') || 'Sin lote',
    tallaInicio: pickString(row, 'TallaInicio') || 'Sin talla',
    destino: pickString(row, 'Destino') || 'Sin destino',
    libras: round2(pickNumber(row, 'Libras')),
  }));
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

function clasificadoPeriod(
  groups: ClasificadoGroup[],
  field: 'maquina' | 'talla',
  periodOf: (d: string) => string,
  key: string,
) {
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
    librasFrancia: round2(pickNumber(r, 'LibrasFrancia')),
    librasUK: round2(pickNumber(r, 'LibrasUK')),
    librasACHolding: round2(pickNumber(r, 'LibrasACHolding')),
    librasTerceros: round2(pickNumber(r, 'LibrasTerceros')),
    librasTotal: round2(pickNumber(r, 'LibrasTotal')),
  };
}

interface ExportGroup {
  dia: string;
  contenedor: string;
  referencia: string;
  cliente: string;
  estilo: string;
  masteres: number;
  libras: number;
  unidades: number;
}

const EXPORT_GROUPS_CACHE_MS = 5 * 60 * 1000;

/** Varios widgets de Exportaciones comparten el mismo rango de fechas del
 *  filtro; se cachea por rango para no repetir el escaneo de `AV_Envios`
 *  (vista de ~19M filas) una vez por widget. */
async function fetchExportGroups(fechaInicial: string, fechaFinal: string): Promise<ExportGroup[]> {
  return withTtlCache(`exportGroups:${fechaInicial}:${fechaFinal}`, EXPORT_GROUPS_CACHE_MS, async () => {
    const rows = await runQuery(EXPORTACIONES_CONTENEDORES_QUERY, dateParams(fechaInicial, fechaFinal));
    return rows.map((row) => ({
      dia: pickString(row, 'Dia'),
      contenedor: pickString(row, 'Contenedor'),
      referencia: pickString(row, 'Referencia'),
      cliente: pickString(row, 'Cliente') || 'Sin cliente',
      estilo: pickString(row, 'Estilo') || 'Sin estilo',
      masteres: pickNumber(row, 'Masteres'),
      libras: pickNumber(row, 'Libras'),
      unidades: pickNumber(row, 'Unidades'),
    }));
  });
}

export async function getExportacionesPorEstilo(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchExportGroups(f.fechaInicial, f.fechaFinal);
  return aggregateTotal(groups.map((g) => ({ valor: g.estilo, libras: g.libras })))
    .map(({ valor, libras, porcentaje }) => ({ estilo: valor, libras, porcentaje }));
}

/** Detalle por contenedor: una fila por (contenedor, estilo, cliente) con
 *  másteres, anillos por máster y libras. */
export async function getExportacionesContenedores(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchExportGroups(f.fechaInicial, f.fechaFinal);
  return groups
    .map((g) => ({
      fecha: g.dia.slice(0, 10),
      contenedor: g.contenedor,
      referencia: g.referencia,
      cliente: g.cliente,
      estilo: g.estilo,
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

export async function getExportacionesPorClienteMes(_f: DashboardFilters, meses: number): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(meses);
  return exportContainersByPeriod(await fetchExportGroups(ini, fin), (d) => d.slice(0, 7));
}

/* ================================================================== */
/* COMPRA DE MATERIA PRIMA                                             */
/* ================================================================== */

/** Nº de semanas lunes-domingo que toca el mes en curso desde el día 1
 *  hasta hoy (para el promedio "libras por semana" del mes actual). Si se
 *  quiere contar solo semanas completas, cambiar el `Math.ceil` por lógica
 *  de semanas cerradas. */
function semanasDelMesActual(hoy = new Date()): number {
  const primerDiaSemana = (new Date(hoy.getFullYear(), hoy.getMonth(), 1).getDay() + 6) % 7; // 0 = lunes
  return Math.max(1, Math.ceil((hoy.getDate() + primerDiaSemana) / 7));
}

export async function getCompraMpResumen(): Promise<CompraMpResumen> {
  const rows = await runQuery(COMPRA_MP_RESUMEN_QUERY, []);
  const r = rows[0] ?? {};
  const librasRecibidasMes = round2(pickNumber(r, 'LibrasRecibidasMes'));
  const hoyEfectivo = pickString(r, 'HoyEfectivo');
  const anchor = hoyEfectivo ? new Date(`${hoyEfectivo}T00:00:00`) : new Date();
  return {
    actualizado: new Date().toISOString(),
    semanaInicio: pickString(r, 'SemanaInicio'),
    semanaFin: pickString(r, 'SemanaFin'),
    librasRecibidasHoy: round2(pickNumber(r, 'LibrasRecibidasHoy')),
    librasRecibidasSemana: round2(pickNumber(r, 'LibrasRecibidasSemana')),
    librasRecibidasMes,
    librasPromedioSemana: round2(librasRecibidasMes / semanasDelMesActual(anchor)),
  };
}


/** Cantidad de meses con datos que debe mostrar el reporte de materia prima
 *  por proveedor (antes eran 12). Ver `getCompraMpMateriaPrima`: no es una
 *  ventana calendario estricta, se ajusta para siempre mostrar 3 meses con
 *  filas reales. */
const COMPRA_MP_MESES = 3;

interface CompraProveedorGroup {
  dia: string;
  anio: number;
  mes: string;
  gramaje: string;
  valor: string;
  libras: number;
}

async function fetchCompraProveedor(fechaInicial: string, fechaFinal: string): Promise<CompraProveedorGroup[]> {
  const rows = await runQuery(COMPRA_MP_POR_PROVEEDOR_QUERY, dateParams(fechaInicial, fechaFinal));
  return rows.map((row) => ({
    dia: pickString(row, 'Dia'),
    anio: pickNumber(row, 'Anio'),
    mes: pickString(row, 'Mes'),
    gramaje: pickString(row, 'Gramaje') || 'Sin gramaje',
    valor: pickString(row, 'Proveedor') || 'Sin proveedor',
    libras: pickNumber(row, 'Libras'),
  }));
}

export async function getCompraMpPorProveedor(f: DashboardFilters): Promise<DataRow[]> {
  const groups = await fetchCompraProveedor(f.fechaInicial, f.fechaFinal);
  return aggregateTotal(groups).map(({ valor, libras, porcentaje }) => ({ proveedor: valor, libras, porcentaje }));
}

/** Materia prima por tipo, proveedor e item (rango de fechas del filtro):
 *  una fila por combinación, para la tabla agrupada tipo/proveedor/item. */
export async function getCompraMpPorItem(f: DashboardFilters): Promise<DataRow[]> {
  const rows = await runQuery(COMPRA_MP_POR_ITEM_QUERY, dateParams(f.fechaInicial, f.fechaFinal));
  return rows
    .map((row) => ({
      tipo: pickString(row, 'Tipo') || 'Sin tipo',
      proveedor: pickString(row, 'Proveedor') || 'Sin proveedor',
      item: pickString(row, 'Item') || 'Sin item',
      pesoLibras: round2(pickNumber(row, 'PesoLibras')),
      cantidadSerial: pickNumber(row, 'CantidadSerial'),
    }))
    .sort(
      (a, b) =>
        a.tipo.localeCompare(b.tipo) ||
        a.proveedor.localeCompare(b.proveedor) ||
        a.item.localeCompare(b.item),
    );
}

/** Detalle de libras de materia prima por proveedor y talla. */
export async function getCompraMpPorTalla(f: DashboardFilters): Promise<DataRow[]> {
  const rows = await runQuery(COMPRA_MP_POR_TALLA_QUERY, dateParams(f.fechaInicial, f.fechaFinal));
  return rows
    .map((row) => ({
      proveedor: pickString(row, 'Proveedor') || 'Sin proveedor',
      talla: pickString(row, 'Talla') || 'Sin talla',
      total: round2(pickNumber(row, 'Total')),
    }))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor) || a.talla.localeCompare(b.talla));
}

/** Libras de materia prima recibidas por año, mes, gramaje (talla) y
 *  proveedor, en una ventana de los últimos 3 meses **con datos** (no 3
 *  meses calendario a secas). Alimenta el widget con selector de
 *  proveedores; el filtrado por proveedor visible se hace en el front.
 *
 * IMPORTANTE: se pide un mes calendario extra (`COMPRA_MP_MESES + 1`) y
 * luego se recorta a los 3 meses más recientes que realmente tienen filas.
 * Si se pidiera la ventana calendario exacta (hoy − 3 meses → hoy), el mes
 * en curso aparece vacío los primeros días (la recepción se registra con
 * un par de días de rezago) y el widget mostraba solo 2 meses en vez de 3. */
export async function getCompraMpMateriaPrima(): Promise<DataRow[]> {
  const [ini, fin] = monthWindow(COMPRA_MP_MESES + 1);
  const groups = await fetchCompraProveedor(ini, fin);
  const map = new Map<string, { anio: number; mes: string; gramaje: string; proveedor: string; libras: number }>();
  for (const g of groups) {
    if (!g.mes || !g.valor) continue;
    const key = `${g.mes}|${g.gramaje}|${g.valor}`;
    const acc = map.get(key) ?? { anio: g.anio, mes: g.mes, gramaje: g.gramaje, proveedor: g.valor, libras: 0 };
    acc.libras += g.libras;
    map.set(key, acc);
  }
  const mesesConDatos = Array.from(new Set(Array.from(map.values()).map((c) => c.mes)))
    .sort()
    .slice(-COMPRA_MP_MESES);
  const mesesVisibles = new Set(mesesConDatos);
  return Array.from(map.values())
    .filter((c) => mesesVisibles.has(c.mes))
    .map((c) => ({ ...c, libras: round2(c.libras) }))
    .sort(
      (a, b) =>
        a.mes.localeCompare(b.mes) ||
        a.proveedor.localeCompare(b.proveedor) ||
        a.gramaje.localeCompare(b.gramaje),
    );
}
