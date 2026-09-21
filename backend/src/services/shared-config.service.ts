import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { getStbPool } from '../config/stbDb';

const CLASSIFIED_SIZE_ORDER = 'clasificado.orden-tallas';

export async function getClassifiedSizes(): Promise<string[]> {
  const result = await (await getStbPool()).request().query<{ talla: string }>(`
    SELECT DISTINCT LTRIM(RTRIM(NOMBRE_TALLA)) AS talla
    FROM dbo.DCP_TALLAS
    WHERE NULLIF(LTRIM(RTRIM(NOMBRE_TALLA)), '') IS NOT NULL
    ORDER BY talla
  `);
  return Array.from(new Set([...result.recordset.map((row) => row.talla), 'Sin talla']));
}

export async function getClassifiedSizeOrder(): Promise<string[]> {
  const result = await (await getAuthPool()).request()
    .input('key', sql.NVarChar(80), CLASSIFIED_SIZE_ORDER)
    .query<{ valor: string }>(`
      SELECT valor FROM dbo.dashboard_configuracion_compartida WHERE clave = @key
    `);
  const value: unknown = result.recordset[0]?.valor ? JSON.parse(result.recordset[0].valor) : [];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

export async function saveClassifiedSizeOrder(order: string[]): Promise<void> {
  await (await getAuthPool()).request()
    .input('key', sql.NVarChar(80), CLASSIFIED_SIZE_ORDER)
    .input('value', sql.NVarChar(sql.MAX), JSON.stringify(order))
    .query(`
      MERGE dbo.dashboard_configuracion_compartida WITH (HOLDLOCK) AS target
      USING (SELECT @key AS clave) AS source ON target.clave = source.clave
      WHEN MATCHED THEN UPDATE SET valor = @value, actualizado_en = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (clave, valor) VALUES (@key, @value);
    `);
}
