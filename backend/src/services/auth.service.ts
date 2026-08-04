import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { env } from '../config/env';
import { Permiso, esPermisoValido } from '../types/permissions';

export interface AuthUser {
  id: string;
  usuario: string;
  nombre: string;
  correo: string;
  esAdministrador: boolean;
  debeCambiarPassword: boolean;
  /** Vistas a las que tiene acceso; ignorado si esAdministrador = true (acceso total). */
  permisos: Permiso[];
  activo: boolean;
}

const userColumns = `
  id, usuario, nombre, correo,
  es_administrador AS esAdministrador,
  debe_cambiar_password AS debeCambiarPassword,
  activo
`;

export async function assertAuthDatabaseReady(): Promise<void> {
  const pool = await getAuthPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.dashboard_usuarios', 'U') IS NULL
       OR OBJECT_ID('dbo.dashboard_usuarios_permisos', 'U') IS NULL
      THROW 51000, 'La base de autenticación no está migrada. Ejecuta npm run migrate.', 1;
  `);
}

async function fetchPermisos(userId: string): Promise<Permiso[]> {
  const result = await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ permiso: string }>(`
      SELECT permiso FROM dbo.dashboard_usuarios_permisos WHERE usuario_id = @userId
    `);
  return result.recordset.map((r) => r.permiso).filter(esPermisoValido);
}

/** Permisos de varios usuarios en una sola consulta, agrupados por id. */
async function fetchPermisosMap(userIds: string[]): Promise<Map<string, Permiso[]>> {
  const map = new Map<string, Permiso[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return map;

  const result = await (await getAuthPool()).request().query<{ usuario_id: string; permiso: string }>(`
    SELECT usuario_id, permiso FROM dbo.dashboard_usuarios_permisos
  `);
  for (const row of result.recordset) {
    if (!esPermisoValido(row.permiso)) continue;
    const lista = map.get(row.usuario_id);
    if (lista) lista.push(row.permiso);
  }
  return map;
}

async function insertPermisos(userId: string, permisos: Permiso[]): Promise<void> {
  for (const permiso of permisos) {
    await (await getAuthPool()).request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('permiso', sql.NVarChar(50), permiso)
      .query(`
        INSERT INTO dbo.dashboard_usuarios_permisos (usuario_id, permiso)
        VALUES (@userId, @permiso)
      `);
  }
}

export async function authenticate(usuario: string, password: string): Promise<AuthUser | null> {
  const result = await (await getAuthPool()).request()
    .input('usuario', sql.NVarChar(254), usuario.trim().toLowerCase())
    .query<Omit<AuthUser, 'permisos'> & { password_hash: string }>(`
      SELECT ${userColumns}, password_hash
      FROM dbo.dashboard_usuarios
      WHERE activo = 1 AND (LOWER(usuario) = @usuario OR LOWER(correo) = @usuario)
    `);
  const user = result.recordset[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  const { password_hash: _, ...safeUser } = user;
  return { ...safeUser, permisos: await fetchPermisos(safeUser.id) };
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
    .query<Omit<AuthUser, 'permisos'>>(`
      SELECT u.id, u.usuario, u.nombre, u.correo,
        u.es_administrador AS esAdministrador,
        u.debe_cambiar_password AS debeCambiarPassword,
        u.activo
      FROM dbo.dashboard_sesiones s
      JOIN dbo.dashboard_usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = @tokenHash AND s.expira_en > SYSUTCDATETIME() AND u.activo = 1
    `);
  const user = result.recordset[0];
  if (!user) return null;
  return { ...user, permisos: await fetchPermisos(user.id) };
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
  const result = await (await getAuthPool()).request().query<Omit<AuthUser, 'permisos'>>(`
    SELECT ${userColumns}
    FROM dbo.dashboard_usuarios
    ORDER BY nombre
  `);
  const permisosMap = await fetchPermisosMap(result.recordset.map((u) => u.id));
  return result.recordset.map((u) => ({ ...u, permisos: permisosMap.get(u.id) ?? [] }));
}

export async function createUser(
  data: { usuario: string; nombre: string; correo: string },
  temporaryPassword: string,
  permisos: Permiso[],
): Promise<AuthUser> {
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const result = await (await getAuthPool()).request()
    .input('usuario', sql.NVarChar(60), data.usuario.trim().toLowerCase())
    .input('nombre', sql.NVarChar(150), data.nombre.trim())
    .input('correo', sql.NVarChar(254), data.correo.trim().toLowerCase())
    .input('hash', sql.NVarChar(100), hash)
    .query<Omit<AuthUser, 'permisos'>>(`
      INSERT INTO dbo.dashboard_usuarios (usuario, nombre, correo, password_hash)
      OUTPUT inserted.id, inserted.usuario, inserted.nombre, inserted.correo,
        inserted.es_administrador AS esAdministrador,
        inserted.debe_cambiar_password AS debeCambiarPassword,
        inserted.activo
      VALUES (@usuario, @nombre, @correo, @hash)
    `);
  const user = result.recordset[0];
  await insertPermisos(user.id, permisos);
  return { ...user, permisos };
}

export async function deleteUser(userId: string): Promise<void> {
  await (await getAuthPool()).request()
    .input('id', sql.UniqueIdentifier, userId)
    .query('DELETE FROM dbo.dashboard_usuarios WHERE id = @id AND es_administrador = 0');
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const result = await (await getAuthPool()).request()
    .input('id', sql.UniqueIdentifier, userId)
    .query<Omit<AuthUser, 'permisos'>>(`
      SELECT ${userColumns} FROM dbo.dashboard_usuarios WHERE id = @id
    `);
  const user = result.recordset[0];
  if (!user) return null;
  return { ...user, permisos: await fetchPermisos(user.id) };
}

/** Reemplaza por completo el conjunto de permisos de un usuario. */
export async function updatePermisos(userId: string, permisos: Permiso[]): Promise<void> {
  await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query('DELETE FROM dbo.dashboard_usuarios_permisos WHERE usuario_id = @userId');
  await insertPermisos(userId, permisos);
}

/**
 * Activa/inactiva un usuario (nunca a un administrador). Devuelve false
 * si no se afectó ninguna fila (usuario inexistente o administrador),
 * para que la ruta pueda responder con el error apropiado.
 */
export async function setActivo(userId: string, activo: boolean): Promise<boolean> {
  const result = await (await getAuthPool()).request()
    .input('id', sql.UniqueIdentifier, userId)
    .input('activo', sql.Bit, activo)
    .query(`
      UPDATE dbo.dashboard_usuarios
      SET activo = @activo, actualizado_en = SYSUTCDATETIME()
      WHERE id = @id AND es_administrador = 0
    `);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from(crypto.randomBytes(16), (byte) => chars[byte % chars.length]).join('');
}
