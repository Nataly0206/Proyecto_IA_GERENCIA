/**
 * Controladores de los módulos de proceso (Recepción, Descabezado,
 * Clasificado, Exportaciones, Compra de Materia Prima). Mismo patrón que
 * `dashboard.controller.ts`: TTL-cache por clave de filtros, 5 min para
 * reportes y 60 s para contadores en vivo.
 */
import { Request, Response } from 'express';
import { parseFilters } from './dashboard.controller';
import * as procesos from '../services/procesos.service';
import { buildTrazabilidadExcel } from '../services/trazabilidad.excel';
import { withTtlCache } from '../utils/ttlCache';

const REPORT_CACHE_MS = 5 * 60 * 1000;
const LIVE_CACHE_MS = 60 * 1000;
const EXPORT_CACHE_MS = 15 * 60 * 1000;

type FilterHandler = (f: ReturnType<typeof parseFilters>) => Promise<unknown>;
type MonthHandler = (f: ReturnType<typeof parseFilters>, meses: number) => Promise<unknown>;

/** Reporte filtrable por fecha/turno. */
function report(key: string, handler: FilterHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    const filters = parseFilters(req);
    const forceRefresh = req.query.refresh === 'true';
    res.json(
      await withTtlCache(
        JSON.stringify([key, filters]),
        REPORT_CACHE_MS,
        () => handler(filters),
        forceRefresh,
      ),
    );
  };
}

/** Reporte mensual: ventana de N meses independiente del filtro de fechas. */
function monthlyReport(key: string, handler: MonthHandler, defaultMeses = 12) {
  return async (req: Request, res: Response): Promise<void> => {
    const filters = parseFilters(req);
    const meses = Math.min(Math.max(Number(req.query.meses) || defaultMeses, 1), 36);
    const forceRefresh = req.query.refresh === 'true';
    res.json(
      await withTtlCache(
        JSON.stringify([key, filters.turno ?? '', meses]),
        REPORT_CACHE_MS,
        () => handler(filters, meses),
        forceRefresh,
      ),
    );
  };
}

/** Contador en vivo sin filtros. */
function live(key: string, handler: () => Promise<unknown>, ttlMs = LIVE_CACHE_MS) {
  return async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === 'true';
    res.json(await withTtlCache(`${key}:current`, ttlMs, handler, forceRefresh));
  };
}

function parseExcludedClients(req: Request): string[] {
  const raw = req.query.excludedClients;
  if (typeof raw !== 'string' || raw.length > 50_000) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 500) return [];
    return Array.from(new Set(parsed.filter(
      (client): client is string => typeof client === 'string' && client.length > 0 && client.length <= 500,
    ))).sort();
  } catch {
    return [];
  }
}

/* Recepción */
export const getRecepcionResumen = live('recepcion-resumen:balance-diario-v2', procesos.getRecepcionResumen);
export const getRecepcionRemisiones = report('recepcion-remisiones', procesos.getRecepcionRemisiones);

/* Descabezado */
export const getDescabezadoResumen = live('descabezado-resumen:cabezas-hora-v2', procesos.getDescabezadoResumen);
export const getDescabezadoPorDia = report('descabezado-por-dia:pesos-v3', procesos.getDescabezadoPorDia);
export const getDescabezadoPorDiaMes = monthlyReport('descabezado-por-dia-mes:pesos-v3', procesos.getDescabezadoPorDiaMes);

/* Clasificado */
export const getClasificadoResumen = live('clasificado-resumen', procesos.getClasificadoResumen);
export const getClasificadoPorMaquinaHoy = live('clasificado-por-maquina-hoy', procesos.getClasificadoPorMaquinaHoy);
export const getClasificadoInventario = live('clasificado-inventario', procesos.getClasificadoInventario);
export const getClasificadoInventarioDetalle = live('clasificado-inventario-detalle', procesos.getClasificadoInventarioDetalle);
export const getClasificadoPorMaquina = report('clasificado-por-maquina', procesos.getClasificadoPorMaquina);
export const getClasificadoPorTalla = report('clasificado-por-talla', procesos.getClasificadoPorTalla);
export const getClasificadoPorTallaDia = report('clasificado-por-talla-dia', procesos.getClasificadoPorTallaDia);
export const getClasificadoPorTallaMes = monthlyReport('clasificado-por-talla-mes', procesos.getClasificadoPorTallaMes);

/* Exportaciones */
export const getExportacionesResumen = async (req: Request, res: Response): Promise<void> => {
  const excludedClients = parseExcludedClients(req);
  res.json(await withTtlCache(
    JSON.stringify(['exportaciones-resumen', excludedClients]),
    EXPORT_CACHE_MS,
    () => procesos.getExportacionesResumen(excludedClients),
    req.query.refresh === 'true',
  ));
};
export const getExportacionesPorEstilo = async (req: Request, res: Response): Promise<void> => {
  const filters = parseFilters(req);
  const excludedClients = parseExcludedClients(req);
  res.json(await withTtlCache(
    JSON.stringify(['exportaciones-por-estilo', filters, excludedClients]),
    REPORT_CACHE_MS,
    () => procesos.getExportacionesPorEstilo(filters, excludedClients),
    req.query.refresh === 'true',
  ));
};
export const getExportacionesContenedores = async (req: Request, res: Response): Promise<void> => {
  const filters = parseFilters(req);
  const excludedClients = parseExcludedClients(req);
  res.json(await withTtlCache(
    JSON.stringify(['exportaciones-contenedores', filters, excludedClients]),
    REPORT_CACHE_MS,
    () => procesos.getExportacionesContenedores(filters, excludedClients),
    req.query.refresh === 'true',
  ));
};
export const getExportacionesContenedorDetalle = async (req: Request, res: Response): Promise<void> => {
  const fecha = String(req.query.fecha ?? '');
  const contenedor = String(req.query.contenedor ?? '');
  const referencia = String(req.query.referencia ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !contenedor || contenedor.length > 100 || referencia.length > 200) {
    res.status(400).json({ error: 'Los datos del contenedor no son válidos.' });
    return;
  }
  res.json(await withTtlCache(
    JSON.stringify(['exportaciones-contenedor-detalle', fecha, contenedor, referencia]),
    EXPORT_CACHE_MS,
    () => procesos.getExportacionesContenedorDetalle(fecha, contenedor, referencia),
    req.query.refresh === 'true',
  ));
};
export const descargarExportacionesTrazabilidad = async (req: Request, res: Response): Promise<void> => {
  const fecha = String(req.query.fecha ?? '');
  const contenedor = String(req.query.contenedor ?? '');
  const referencia = String(req.query.referencia ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !contenedor || contenedor.length > 100 || referencia.length > 200) {
    res.status(400).json({ error: 'Los datos del contenedor no son válidos.' });
    return;
  }
  const rows = await procesos.getExportacionesTrazabilidad(fecha, contenedor, referencia);
  if (!rows.length) {
    res.status(404).json({ error: 'No hay trazabilidad para este contenedor.' });
    return;
  }
  const uk = rows.some((row) => /\bUK\b/i.test(String(row.cliente ?? '')));
  const buffer = await buildTrazabilidadExcel(rows, uk);
  const codigoEmbarque = String(rows[0].codigoEmbarque ?? '');
  const filename = `Trazabilidad_${codigoEmbarque.replace(/[^a-zA-Z0-9_-]/g, '_')}_${fecha}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
};
export const getExportacionesPorClienteMes = async (req: Request, res: Response): Promise<void> => {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 6, 1), 36);
  const excludedClients = parseExcludedClients(req);
  res.json(await withTtlCache(
    JSON.stringify(['exportaciones-por-cliente-mes', meses, excludedClients]),
    REPORT_CACHE_MS,
    () => procesos.getExportacionesPorClienteMes(filters, meses, excludedClients),
    req.query.refresh === 'true',
  ));
};

/* Compra de materia prima */
export const getCompraMpResumen = async (req: Request, res: Response): Promise<void> => {
  const excludedRaw = req.query.excluded;
  const excluded = Array.isArray(excludedRaw)
    ? excludedRaw.map(String)
    : typeof excludedRaw === 'string' && excludedRaw !== ''
      ? excludedRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const forceRefresh = req.query.refresh === 'true';
  res.json(await withTtlCache(
    JSON.stringify(['compra-mp-resumen', [...excluded].sort()]),
    LIVE_CACHE_MS,
    () => procesos.getCompraMpResumen(excluded),
    forceRefresh,
  ));
};
export const getCompraMpPorProveedor = report('compra-mp-por-proveedor', procesos.getCompraMpPorProveedor);
export const getCompraMpPorItem = report('compra-mp-por-item', procesos.getCompraMpPorItem);
export const getCompraMpPorTalla = report('compra-mp-por-talla', procesos.getCompraMpPorTalla);
export const getCompraMpMateriaPrima = monthlyReport('compra-mp-materia-prima', procesos.getCompraMpMateriaPrima);
