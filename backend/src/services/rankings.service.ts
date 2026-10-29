import sql from 'mssql';
import { runStbQuery } from './stb.service';
import { pickNumber, pickString } from '../utils/rows';

export type RankingProcess = 'pelado' | 'descabezado';
export function rankingsQuery(process: RankingProcess) {
  const peeled = process === 'pelado';
  const header = peeled ? 'PES_ASIGNACION_LIBRAS_EMPLEADOS' : 'DES_ASIG_LBRS_EMPLEADOS';
  const detail = peeled ? 'PES_ASIGNACION_LIBRAS_EMPLEADOS_DET' : 'DES_ASIG_LBRS_EMPLEADOS_DET';
  const employees = peeled ? 'PES_EMPLEADOS_LINEAS' : 'DES_EMPLEADOS_LINEAS';
  const headerId = peeled ? 'ID_ASIGNACION_LIBRAS_EMPLEADO' : 'ID_ASIG_LBRS_EMPLEADO';
  const employeeLineId = peeled ? 'ID_EMPLEADOS_LINEA' : 'ID_EMPLEADO_LINEA';
  return `;WITH Totales AS (
    SELECT e.ID_EMPLEADO AS IdEmpleado, SUM(d.LIBRAS) AS Libras
    FROM dbo.${header} h
    JOIN dbo.${detail} d ON d.${headerId} = h.${headerId}
    JOIN dbo.${employees} e ON e.${employeeLineId} = d.ID_EMPLEADO_LINEA
    WHERE h.FECHA >= @Desde AND h.FECHA < DATEADD(DAY, 1, @Hasta)
      AND ${peeled ? 'd.ANULADO = 0' : 'ISNULL(d.ANULADO, 0) = 0'}
      AND e.ID_EMPLEADO IS NOT NULL
    GROUP BY e.ID_EMPLEADO
    HAVING SUM(d.LIBRAS) > 0
  ), Mejores AS (
    SELECT TOP (20) IdEmpleado, Libras, COUNT(*) OVER() AS TotalEmpleados,
      ROW_NUMBER() OVER (ORDER BY Libras DESC, IdEmpleado ASC) AS Posicion
    FROM Totales ORDER BY Libras DESC, IdEmpleado ASC
  )
  SELECT m.*, n.NombreEmpleado
  FROM Mejores m
  OUTER APPLY (
    SELECT TOP (1) f.NombreEmpleado
    FROM dbo.DCP_EmpleadosDeptosFechas f
    WHERE f.IdEmpleado = m.IdEmpleado AND f.Fecha < DATEADD(DAY, 1, @Hasta)
      AND NULLIF(LTRIM(RTRIM(f.NombreEmpleado)), '') IS NOT NULL
    ORDER BY f.Fecha DESC, f.IdEmpleadoDepto DESC
  ) n
  ORDER BY m.Posicion;`;
}

export async function getEmployeeRankings(process: RankingProcess, from: string, to: string) {
  const rows = await runStbQuery(rankingsQuery(process), [
    { name: 'Desde', type: sql.Date, value: from },
    { name: 'Hasta', type: sql.Date, value: to },
  ]);
  return { process, from, to, updatedAt: new Date().toISOString(),
    totalEmployees: rows.length ? pickNumber(rows[0], 'TotalEmpleados') : 0,
    employees: rows.map(row => ({ position: pickNumber(row, 'Posicion'),
      employeeId: pickNumber(row, 'IdEmpleado'), name: pickString(row, 'NombreEmpleado') || 'Sin nombre registrado', pounds: pickNumber(row, 'Libras') })),
  };
}
