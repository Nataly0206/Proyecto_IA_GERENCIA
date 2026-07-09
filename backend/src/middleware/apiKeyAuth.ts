import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Autenticación mínima por API key compartida entre el frontend (proxy
 * nginx, mismo origen) y el backend. No sustituye un sistema de usuarios
 * con roles, pero cierra el acceso anónimo a la API antes de producción.
 * En producción es obligatoria: si falta API_KEY el servidor no arranca
 * (ver index.ts). En desarrollo, si no está configurada, se deja pasar
 * con un aviso en consola para no bloquear el flujo local.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }

  const provided = req.header('x-api-key') ?? '';
  if (!provided || !timingSafeEqual(provided, env.API_KEY)) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  next();
}
