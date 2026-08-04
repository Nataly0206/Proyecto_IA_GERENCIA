import sql from 'mssql';
import { getStbPool } from '../config/stbDb';
import { ProcParam, SqlRow } from './sql.service';

/**
 * Ejecuta una consulta SQL parametrizada contra STB_data (segundo pool,
 * misma instancia SQL Server que PlantaEmpacadora). Espejo de
 * `runQuery` en `sql.service.ts`, que apunta al pool de PlantaEmpacadora.
 */
export async function runStbQuery(query: string, params: ProcParam[]): Promise<SqlRow[]> {
  const pool = await getStbPool();
  const request = pool.request();
  for (const p of params) {
    request.input(p.name, p.type as sql.ISqlType, p.value);
  }
  const result = await request.query(query);
  return (result.recordset ?? []) as SqlRow[];
}
