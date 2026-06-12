import sql from 'mssql';
import { getPool } from '../config/db';

export interface ProcParam {
  name: string;
  type: sql.ISqlTypeFactoryWithNoParams | sql.ISqlType;
  value: unknown;
}

export type SqlRow = Record<string, unknown>;

/**
 * Ejecuta un procedimiento almacenado y devuelve el primer recordset.
 */
export async function runStoredProcedure(
  procedure: string,
  params: ProcParam[],
): Promise<SqlRow[]> {
  const pool = await getPool();
  const request = pool.request();
  for (const p of params) {
    request.input(p.name, p.type as sql.ISqlType, p.value);
  }
  try {
    const result = await request.execute(procedure);
    return (result.recordset ?? []) as SqlRow[];
  } catch (err) {
    // mssql a veces lanza RequestError con message vacío y el detalle real
    // en precedingErrors (p.ej. errores de compilación dentro del SP).
    const preceding = (err as { precedingErrors?: Error[] }).precedingErrors ?? [];
    const detail = [...new Set(preceding.map((e) => e.message))].join('; ');
    if (detail && err instanceof Error && !err.message) {
      err.message = `${procedure}: ${detail}`;
    }
    throw err;
  }
}

/**
 * Ejecuta una consulta SQL parametrizada y devuelve el primer recordset.
 */
export async function runQuery(query: string, params: ProcParam[]): Promise<SqlRow[]> {
  const pool = await getPool();
  const request = pool.request();
  for (const p of params) {
    request.input(p.name, p.type as sql.ISqlType, p.value);
  }
  const result = await request.query(query);
  return (result.recordset ?? []) as SqlRow[];
}
