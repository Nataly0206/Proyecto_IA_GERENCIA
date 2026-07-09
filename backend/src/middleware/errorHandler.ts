import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err instanceof ApiError ? err.statusCode : 500;
  console.error(`[api] ${err.name}: ${err.message}`);
  res.status(status).json({
    error: status === 500 ? 'Error interno del servidor' : err.message,
    // El detalle crudo (posibles nombres de tabla/columna, mensajes de
    // driver SQL) solo se expone fuera de producción, nunca al cliente real.
    detail: status === 500 && env.NODE_ENV !== 'production' ? err.message : undefined,
  });
}
