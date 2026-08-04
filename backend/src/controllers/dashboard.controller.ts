import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { DashboardFilters } from '../types/dashboard.types';
import { ApiError } from '../middleware/errorHandler';
import { withTtlCache } from '../utils/ttlCache';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TURN_REGEX = /^(?:A|B|Turno A|Turno B)$/i;
const REPORT_CACHE_MS = 5 * 60 * 1000;
const LIVE_CACHE_MS = 60 * 1000;

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Lee y valida los filtros globales desde el query string.
 * Por defecto: últimos 30 días y todos los turnos.
 */
export function parseFilters(req: Request): DashboardFilters {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fechaInicial = String(req.query.fechaInicial ?? formatDate(thirtyDaysAgo));
  const fechaFinal = String(req.query.fechaFinal ?? formatDate(today));

  if (!isValidDate(fechaInicial) || !isValidDate(fechaFinal)) {
    throw new ApiError(400, 'fechaInicial y fechaFinal deben ser fechas válidas en formato YYYY-MM-DD');
  }
  if (fechaInicial > fechaFinal) {
    throw new ApiError(400, 'fechaInicial no puede ser mayor que fechaFinal');
  }

  const turno = req.query.turno ? String(req.query.turno) : undefined;
  if (turno && !TURN_REGEX.test(turno)) {
    throw new ApiError(400, 'turno debe ser A, B, Turno A o Turno B');
  }

  return { fechaInicial, fechaFinal, turno };
}

export async function getLibrasNetasPorProceso(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['libras-netas-proceso', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getLibrasNetasPorProceso(filters),
      forceRefresh,
    ),
  );
}

export async function getLibrasNetasPorProcesoDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['libras-netas-proceso-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getLibrasNetasPorProcesoDia(filters),
      forceRefresh,
    ),
  );
}

export async function getLibrasNetasPorProcesoMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['libras-netas-proceso-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getLibrasNetasPorProcesoMes(filters, meses),
      forceRefresh,
    ),
  );
}

export async function getIqfLibrasHoraDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['iqf-libras-hora-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getIqfLibrasHoraDia(filters),
      forceRefresh,
    ),
  );
}

export async function getIqfLibrasHoraMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['iqf-libras-hora-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getIqfLibrasHoraMes(filters, meses),
      forceRefresh,
    ),
  );
}

export async function getIqfTiempoReal(req: Request, res: Response): Promise<void> {
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      'iqf-tiempo-real:current',
      LIVE_CACHE_MS,
      () => dashboardService.getIqfTiempoReal(),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorEstilo(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-estilo', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorEstilo(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorEstiloDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-estilo-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorEstiloDia(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorEstiloMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-estilo-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorEstiloMes(filters, meses),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorTalla(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-talla', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorTalla(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorTallaDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-talla-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorTallaDia(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPorTallaMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-por-talla-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPorTallaMes(filters, meses),
      forceRefresh,
    ),
  );
}

export async function getPeladoTiempoReal(req: Request, res: Response): Promise<void> {
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      'pelado-tiempo-real:current',
      LIVE_CACHE_MS,
      () => dashboardService.getPeladoTiempoReal(),
      forceRefresh,
    ),
  );
}

export async function getPeladoPersonal(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-personal', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPersonal(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPersonalDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-personal-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPersonalDia(filters),
      forceRefresh,
    ),
  );
}

export async function getPeladoPersonalMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  const forceRefresh = req.query.refresh === 'true';
  res.json(
    await withTtlCache(
      JSON.stringify(['pelado-personal-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getPeladoPersonalMes(filters, meses),
      forceRefresh,
    ),
  );
}
