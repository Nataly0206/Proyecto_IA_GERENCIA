import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { PlannedItem } from './preload-planner';

// All writes use the dashboard/gerencia pool, never the plant or STB pools.
export async function listPreloads(from?: string, to?: string) {
  const result = await (await getAuthPool()).request()
    .input('from', sql.DateTime2, from ? new Date(`${from}T06:00:00.000Z`) : null)
    .input('to', sql.DateTime2, to ? new Date(`${to}T06:00:00.000Z`) : null)
    .query(`SELECT c.id, c.revision, c.creado_en AS createdAt, c.contenido, u.nombre AS createdBy
      FROM dbo.dashboard_precargas c LEFT JOIN dbo.dashboard_usuarios u ON u.id = c.usuario_id
      WHERE (@from IS NULL OR c.creado_en >= @from)
        AND (@to IS NULL OR c.creado_en < DATEADD(day, 1, @to))
      ORDER BY c.creado_en DESC, c.id DESC`);
  return result.recordset.map(row => {
    const content = JSON.parse(row.contenido);
    // Older saved proposals have no assigned/missing fields.
    content.items = content.items.map((item: PlannedItem) => {
      const assigned = item.allocations.reduce((sum, allocation) => sum + allocation.cantidadSerial, 0);
      return { ...item, assigned, missing: Math.max(0, item.requested - assigned) };
    });
    return { id: row.id, revision: row.revision, createdAt: row.createdAt, createdBy: row.createdBy, ...content };
  });
}

export async function savePreload(userId: string, content: { notes: string; filters: Record<string, string[]>; items: PlannedItem[] }) {
  const result = await (await getAuthPool()).request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('content', sql.NVarChar(sql.MAX), JSON.stringify(content))
    .query(`INSERT dbo.dashboard_precargas(usuario_id, contenido) OUTPUT INSERTED.id, INSERTED.creado_en AS createdAt VALUES(@userId, @content)`);
  return { ...result.recordset[0], ...content };
}

export async function getPreload(id: number) {
  const result = await (await getAuthPool()).request().input('id', sql.Int, id)
    .query('SELECT id, revision, creado_en AS createdAt, contenido FROM dbo.dashboard_precargas WHERE id = @id');
  const row = result.recordset[0];
  return row ? { id: row.id, revision: row.revision, createdAt: row.createdAt, ...JSON.parse(row.contenido) } : null;
}

export async function updatePreload(id: number, revision: number, userId: string, reason: string, content: unknown) {
  const result = await (await getAuthPool()).request()
    .input('id', sql.Int, id).input('revision', sql.Int, revision)
    .input('userId', sql.UniqueIdentifier, userId).input('reason', sql.NVarChar(2000), reason)
    .input('content', sql.NVarChar(sql.MAX), JSON.stringify(content))
    .query(`SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @changed TABLE(anterior NVARCHAR(MAX), revision INT);
      UPDATE dbo.dashboard_precargas SET contenido=@content, revision=revision+1
        OUTPUT deleted.contenido, inserted.revision INTO @changed
        WHERE id=@id AND revision=@revision;
      INSERT dbo.dashboard_cargas_ediciones(carga_id,revision,usuario_id,motivo,anterior,nuevo)
        SELECT @id,revision,@userId,@reason,anterior,@content FROM @changed;
      SELECT revision FROM @changed;
      COMMIT TRANSACTION;`);
  return result.recordset[0]?.revision as number | undefined;
}

export async function listLoadEdits(id: number) {
  const result = await (await getAuthPool()).request().input('id', sql.Int, id).query(`
    SELECT e.revision, e.creado_en AS createdAt, u.nombre AS createdBy, e.motivo AS reason
    FROM dbo.dashboard_cargas_ediciones e JOIN dbo.dashboard_usuarios u ON u.id=e.usuario_id
    WHERE e.carga_id=@id ORDER BY e.revision DESC`);
  return result.recordset;
}
