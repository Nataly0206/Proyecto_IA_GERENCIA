import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { DashboardFilters } from '../types/dashboard.types';
import { ApiError } from '../middleware/errorHandler';
import { withTtlCache } from '../utils/ttlCache';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_CACHE_MS = 5 * 60 * 1000;
const LIVE_CACHE_MS = 30 * 60 * 1000;

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Lee y valida los filtros globales desde el query string.
 * Por defecto: últimos 30 días y todos los turnos.
 */
export function parseFilters(req: Request): DashboardFilters {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fechaInicial = String(req.query.fechaInicial ?? formatDate(thirtyDaysAgo));
  const fechaFinal = String(req.query.fechaFinal ?? formatDate(today));

  if (!DATE_REGEX.test(fechaInicial) || !DATE_REGEX.test(fechaFinal)) {
    throw new ApiError(400, 'fechaInicial y fechaFinal deben tener formato YYYY-MM-DD');
  }
  if (fechaInicial > fechaFinal) {
    throw new ApiError(400, 'fechaInicial no puede ser mayor que fechaFinal');
  }

  const turno = req.query.turno ? String(req.query.turno) : undefined;

  return { fechaInicial, fechaFinal, turno };
}

export async function getLibrasNetasPorProceso(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  res.json(
    await withTtlCache(
      JSON.stringify(['libras-netas-proceso', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getLibrasNetasPorProceso(filters),
    ),
  );
}

export async function getIqfLibrasHoraDia(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  res.json(
    await withTtlCache(
      JSON.stringify(['iqf-libras-hora-dia', filters]),
      REPORT_CACHE_MS,
      () => dashboardService.getIqfLibrasHoraDia(filters),
    ),
  );
}

export async function getIqfLibrasHoraMes(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req);
  const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
  res.json(
    await withTtlCache(
      JSON.stringify(['iqf-libras-hora-mes', filters.turno ?? '', meses]),
      REPORT_CACHE_MS,
      () => dashboardService.getIqfLibrasHoraMes(filters, meses),
    ),
  );
}

export async function getIqfTiempoReal(req: Request, res: Response): Promise<void> {
  const turno = req.query.turno ? String(req.query.turno) : undefined;
  res.json(
    await withTtlCache(
      JSON.stringify(['iqf-tiempo-real', turno ?? '']),
      LIVE_CACHE_MS,
      () => dashboardService.getIqfTiempoReal(turno),
    ),
  );
}
