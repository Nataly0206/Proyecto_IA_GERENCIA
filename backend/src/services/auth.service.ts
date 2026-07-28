import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { env } from '../config/env';

export interface AuthUser {
  id: string;
  usuario: string;
  nombre: string;
  correo: string;
  esAdministrador: boolean;
  debeCambiarPassword: boolean;
}

const userColumns = `
  id, usuario, nombre, correo,
  es_administrador AS esAdministrador,
  debe_cambiar_password AS debeCambiarPassword
`;

export async function assertAuthDatabaseReady(): Promise<void> {
  const pool = await getAuthPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.dashboard_usuarios', 'U') IS NULL
      THROW 51000, 'La base de autenticación no está migrada. Ejecuta npm run migrate.', 1;
  `);
}

export async function authenticate(usuario: string, password: string): Promise<AuthUser | null> {
  const result = await (await getAuthPool()).request()
    .input('usuario', sql.NVarChar(254), usuario.trim().toLowerCase())
    .query<AuthUser & { password_hash: string }>(`
      SELECT ${userColumns}, password_hash
      FROM dbo.dashboard_usuarios
      WHERE activo = 1 AND (LOWER(usuario) = @usuario OR LOWER(correo) = @usuario)
    `);
  const user = result.recordset[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  const { password_hash: _, ...safeUser } = user;
  return safeUser;
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + env.SESSION_HOURS * 60 * 60 * 1000);
  const pool = await getAuthPool();
  await pool.request().query('DELETE FROM dbo.dashboard_sesiones WHERE expira_en <= SYSUTCDATETIME()');
  await pool.request()
    .input('tokenHash', sql.Char(64), tokenHash)
    .input('userId', sql.UniqueIdentifier, userId)
    .input('expires', sql.DateTime2, expires)
    .query(`
      INSERT INTO dbo.dashboard_sesiones (token_hash, usuario_id, expira_en)
      VALUES (@tokenHash, @userId, @expires)
    `);
  return token;
}

export async function findSessionUser(token: string): Promise<AuthUser | null> {
  if (!token || token.length > 100) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await (await getAuthPool()).request()
    .input('tokenHash', sql.Char(64), tokenHash)
    .query<AuthUser>(`
      SELECT u.id, u.usuario, u.nombre, u.correo,
        u.es_administrador AS esAdministrador,
        u.debe_cambiar_password AS debeCambiarPassword
      FROM dbo.dashboard_sesiones s
      JOIN dbo.dashboard_usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = @tokenHash AND s.expira_en > SYSUTCDATETIME() AND u.activo = 1
    `);
  return result.recordset[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token || token.length > 100) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await (await getAuthPool()).request()
    .input('tokenHash', sql.Char(64), tokenHash)
    .query('DELETE FROM dbo.dashboard_sesiones WHERE token_hash = @tokenHash');
}

export async function changePassword(userId: string, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 12);
  await (await getAuthPool()).request()
    .input('id', sql.UniqueIdentifier, userId)
    .input('hash', sql.NVarChar(100), hash)
    .query(`
      UPDATE dbo.dashboard_usuarios
      SET password_hash = @hash, debe_cambiar_password = 0, actualizado_en = SYSUTCDATETIME()
      WHERE id = @id
    `);
}

export async function listUsers(): Promise<AuthUser[]> {
  const result = await (await getAuthPool()).request().query<AuthUser>(`
    SELECT ${userColumns}
    FROM dbo.dashboard_usuarios
    ORDER BY nombre
  `);
  return result.recordset;
}

export async function createUser(
  data: { usuario: string; nombre: string; correo: string },
  temporaryPassword: string,
): Promise<AuthUser> {
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const result = await (await getAuthPool()).request()
    .input('usuario', sql.NVarChar(60), data.usuario.trim().toLowerCase())
    .input('nombre', sql.NVarChar(150), data.nombre.trim())
    .input('correo', sql.NVarChar(254), data.correo.trim().toLowerCase())
    .input('hash', sql.NVarChar(100), hash)
    .query<AuthUser>(`
      INSERT INTO dbo.dashboard_usuarios (usuario, nombre, correo, password_hash)
      OUTPUT inserted.id, inserted.usuario, inserted.nombre, inserted.correo,
        inserted.es_administrador AS esAdministrador,
        inserted.debe_cambiar_password AS debeCambiarPassword
      VALUES (@usuario, @nombre, @correo, @hash)
    `);
  return result.recordset[0];
}

export async function deleteUser(userId: string): Promise<void> {
  await (await getAuthPool()).request()
    .input('id', sql.UniqueIdentifier, userId)
    .query('DELETE FROM dbo.dashboard_usuarios WHERE id = @id AND es_administrador = 0');
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from(crypto.randomBytes(16), (byte) => chars[byte % chars.length]).join('');
}
