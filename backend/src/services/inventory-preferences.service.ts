import sql from 'mssql';
import { getAuthPool } from '../config/authDb';

export interface InventoryPreferences {
  rowFields: string[];
  filters: Record<string, string[]>;
}

export async function getInventoryPreferences(userId: string): Promise<InventoryPreferences | null> {
  const result = await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ preferencias: string }>(`
      SELECT preferencias
      FROM dbo.dashboard_inventario_preferencias
      WHERE usuario_id = @userId
    `);

  const stored = result.recordset[0]?.preferencias;
  return stored ? JSON.parse(stored) as InventoryPreferences : null;
}

export async function saveInventoryPreferences(
  userId: string,
  preferences: InventoryPreferences,
): Promise<void> {
  await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('preferences', sql.NVarChar(sql.MAX), JSON.stringify(preferences))
    .query(`
      MERGE dbo.dashboard_inventario_preferencias WITH (HOLDLOCK) AS target
      USING (SELECT @userId AS usuario_id) AS source
        ON target.usuario_id = source.usuario_id
      WHEN MATCHED THEN
        UPDATE SET preferencias = @preferences, actualizado_en = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (usuario_id, preferencias) VALUES (@userId, @preferences);
    `);
}
