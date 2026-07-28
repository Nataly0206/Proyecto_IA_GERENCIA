import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import {
  AuthUser,
  createSession,
  deleteSession,
  findSessionUser,
} from '../services/auth.service';

const COOKIE_NAME = 'dashboard_session';

export function readSessionCookie(req: Request): string {
  const cookies = req.header('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(value.join('='));
  }
  return '';
}

export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  return findSessionUser(readSessionCookie(req));
}

export async function sessionAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sesión no válida. Inicia sesión nuevamente.' });
      return;
    }
    res.locals.authUser = user;
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  } catch (error) {
    next(error);
  }
}

export function adminAuth(_req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.authUser as AuthUser | undefined;
  if (!user?.esAdministrador) {
    res.status(403).json({ error: 'No tienes permiso para administrar usuarios.' });
    return;
  }
  next();
}

export function changedPasswordAuth(_req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.authUser as AuthUser | undefined;
  if (user?.debeCambiarPassword) {
    res.status(403).json({
      error: 'Debes cambiar tu contraseña temporal antes de continuar.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return;
  }
  next();
}

export async function setSessionCookie(res: Response, userId: string): Promise<void> {
  const token = await createSession(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
    path: '/',
  });
}

export async function clearSession(req: Request, res: Response): Promise<void> {
  await deleteSession(readSessionCookie(req));
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
  });
}
