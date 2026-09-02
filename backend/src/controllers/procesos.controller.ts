/**
 * Controladores de los módulos de proceso (Recepción, Descabezado,
 * Clasificado, Exportaciones, Compra de Materia Prima). Mismo patrón que
 * `dashboard.controller.ts`: TTL-cache por clave de filtros, 5 min para
 * reportes y 60 s para contadores en vivo.
 */
import { Request, Response } from 'express';
import { parseFilters } from './dashboard.controller';
import * as procesos from '../services/procesos.service';
import { withTtlCache } from '../utils/ttlCache';

const REPORT_CACHE_MS = 5 * 60 * 1000;
const LIVE_CACHE_MS = 60 * 1000;

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
function live(key: string, handler: () => Promise<unknown>) {
  return async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === 'true';
    res.json(await withTtlCache(`${key}:current`, LIVE_CACHE_MS, handler, forceRefresh));
  };
}

/* Recepción */
export const getRecepcionResumen = live('recepcion-resumen', procesos.getRecepcionResumen);
export const getRecepcionPorFinca = report('recepcion-por-finca', procesos.getRecepcionPorFinca);
export const getRecepcionRemisiones = report('recepcion-remisiones', procesos.getRecepcionRemisiones);

/* Descabezado */
export const getDescabezadoResumen = live('descabezado-resumen', procesos.getDescabezadoResumen);
export const getDescabezadoPorDia = report('descabezado-por-dia', procesos.getDescabezadoPorDia);
export const getDescabezadoPorDiaMes = monthlyReport('descabezado-por-dia-mes', procesos.getDescabezadoPorDiaMes);

/* Clasificado */
export const getClasificadoResumen = live('clasificado-resumen', procesos.getClasificadoResumen);
export const getClasificadoInventario = live('clasificado-inventario', procesos.getClasificadoInventario);
export const getClasificadoPorMaquina = report('clasificado-por-maquina', procesos.getClasificadoPorMaquina);
export const getClasificadoPorTalla = report('clasificado-por-talla', procesos.getClasificadoPorTalla);
export const getClasificadoPorTallaDia = report('clasificado-por-talla-dia', procesos.getClasificadoPorTallaDia);
export const getClasificadoPorTallaMes = monthlyReport('clasificado-por-talla-mes', procesos.getClasificadoPorTallaMes);

/* Exportaciones */
export const getExportacionesResumen = live('exportaciones-resumen', procesos.getExportacionesResumen);
export const getExportacionesPorEstilo = report('exportaciones-por-estilo', procesos.getExportacionesPorEstilo);
export const getExportacionesContenedores = report('exportaciones-contenedores', procesos.getExportacionesContenedores);
export const getExportacionesPorClienteMes = monthlyReport('exportaciones-por-cliente-mes', procesos.getExportacionesPorClienteMes, 6);

/* Compra de materia prima */
export const getCompraMpResumen = live('compra-mp-resumen', procesos.getCompraMpResumen);
export const getCompraMpPorProveedor = report('compra-mp-por-proveedor', procesos.getCompraMpPorProveedor);
export const getCompraMpMateriaPrima = monthlyReport('compra-mp-materia-prima', procesos.getCompraMpMateriaPrima);
