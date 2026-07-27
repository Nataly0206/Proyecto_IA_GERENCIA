import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

const COOKIE_NAME = 'dashboard_session';

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(value: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
}

function readCookie(req: Request): string {
  const cookies = req.header('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(value.join('='));
  }
  return '';
}

export function hasValidSession(req: Request): boolean {
  const [expiresAt, signature] = readCookie(req).split('.');
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Date.now()) return false;
  return timingSafeEqual(signature, sign(expiresAt));
}

export function sessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (!hasValidSession(req)) {
    res.status(401).json({ error: 'Sesión no válida. Inicia sesión nuevamente.' });
    return;
  }
  // Los reportes contienen información gerencial y no deben persistir en
  // cachés compartidos, historial intermedio de proxies ni disco del navegador.
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

export function passwordMatches(password: string): boolean {
  return Boolean(password) && timingSafeEqual(password, env.LOGIN_PASSWORD);
}

export function setSessionCookie(res: Response): void {
  const expiresAt = String(Date.now() + env.SESSION_HOURS * 60 * 60 * 1000);
  res.cookie(COOKIE_NAME, `${expiresAt}.${sign(expiresAt)}`, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
  });
}
