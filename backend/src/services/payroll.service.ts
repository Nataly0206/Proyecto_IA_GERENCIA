import sql from 'mssql';
import { getPayrollPool } from '../config/payrollDb';
import { ProcParam, SqlRow } from './sql.service';

/** Consultas parametrizadas para asistencia e inasistencia en STBPayroll. */
export async function runPayrollQuery(query: string, params: ProcParam[]): Promise<SqlRow[]> {
  const pool = await getPayrollPool();
  const request = pool.request();
  for (const parameter of params) {
    request.input(parameter.name, parameter.type as sql.ISqlType, parameter.value);
  }
  const result = await request.query(query);
  return (result.recordset ?? []) as SqlRow[];
}
