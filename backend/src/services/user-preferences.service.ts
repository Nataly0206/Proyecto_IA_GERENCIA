import sql from 'mssql';
import { getAuthPool } from '../config/authDb';

export async function getUserPreference<T>(userId: string, key: string): Promise<T | null> {
  const result = await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('key', sql.NVarChar(80), key)
    .query<{ valor: string }>(`
      SELECT valor
      FROM dbo.dashboard_usuarios_preferencias
      WHERE usuario_id = @userId AND clave = @key
    `);
  const value = result.recordset[0]?.valor;
  return value ? JSON.parse(value) as T : null;
}

export async function saveUserPreference(userId: string, key: string, value: unknown): Promise<void> {
  await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('key', sql.NVarChar(80), key)
    .input('value', sql.NVarChar(sql.MAX), JSON.stringify(value))
    .query(`
      MERGE dbo.dashboard_usuarios_preferencias WITH (HOLDLOCK) AS target
      USING (SELECT @userId AS usuario_id, @key AS clave) AS source
        ON target.usuario_id = source.usuario_id AND target.clave = source.clave
      WHEN MATCHED THEN
        UPDATE SET valor = @value, actualizado_en = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (usuario_id, clave, valor) VALUES (@userId, @key, @value);
    `);
}
