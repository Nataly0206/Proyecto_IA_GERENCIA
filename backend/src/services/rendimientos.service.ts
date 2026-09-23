import sql from 'mssql';
import { pickNumber, pickString } from '../utils/rows';
import { runQuery } from './sql.service';

export interface RendimientoProduccion {
  fechaDescongelado: string;
  tipoEstilo: string;
  salida: string;
  totalLibrasDescongeladas: number;
  librasProgramaProducidas: number;
  promedioPrograma: number;
  librasRechazoProducidas: number;
  promedioRechazo: number;
  totalLibrasProducidas: number;
  promedioGeneral: number;
}

export async function getRendimientosProduccion(
  fechaInicial: string,
  fechaFinal: string,
): Promise<RendimientoProduccion[]> {
  // Equivale al modo 28 de a_Fill_Produccion_Diaria_lectura_dos. Se mantiene
  // aquí porque el SP instalado conserva dos nombres de columna/vista obsoletos.
  const rows = await runQuery(`
    WITH LibrasReferencia AS (
      SELECT e.ReferenciaEnvio, SUM(op.TotalLibras) AS TotalLibrasReferencia
      FROM dbo.AV_Ship_TotalLibras e
      INNER JOIN dbo.OPship p ON e.ReferenciaEnvio = p.ReferenciaEnvio
      INNER JOIN dbo.AV_OrdenesProduccion_TotalLibras op ON p.OrdenProduccion = op.OrdenProduccion
      WHERE e.FechaCarga BETWEEN @fechaInicial AND @fechaFinal AND e.TipoDestino = 2
      GROUP BY e.ReferenciaEnvio
      UNION ALL
      SELECT e.ReferenciaEnvio, SUM(op.TotalLibras) AS TotalLibrasReferencia
      FROM dbo.AV_Ship_TotalLibras_fresco e
      INNER JOIN dbo.OPship p ON e.ReferenciaEnvio = p.ReferenciaEnvio
      INNER JOIN dbo.AV_OrdenesProduccion_TotalLibras op ON p.OrdenProduccion = op.OrdenProduccion
      WHERE e.FechaCarga BETWEEN @fechaInicial AND @fechaFinal AND e.TipoDestino = 4
      GROUP BY e.ReferenciaEnvio
    ), Base AS (
      SELECT e.FechaCarga, e.TipoDestinoTexto, e.TipoEstiloTexto,
        op.TotalLibras, lr.ClienteTipoTexto,
        CASE WHEN ref.TotalLibrasReferencia > 0
          THEN (op.TotalLibras * e.TotalLibras) / ref.TotalLibrasReferencia ELSE 0 END AS LibrasDescongeladas
      FROM dbo.AV_Ship_TotalLibras e
      INNER JOIN dbo.OPship p ON e.ReferenciaEnvio = p.ReferenciaEnvio
      INNER JOIN dbo.AV_OrdenesProduccion_TotalLibras op ON p.OrdenProduccion = op.OrdenProduccion
      INNER JOIN dbo.AV_LotesRemision lr ON op.FkLoteRemision = lr.IdLoteRemision
      INNER JOIN LibrasReferencia ref ON e.ReferenciaEnvio = ref.ReferenciaEnvio
      WHERE e.FechaCarga BETWEEN @fechaInicial AND @fechaFinal AND e.TipoDestino = 2
      UNION ALL
      SELECT e.FechaCarga, e.TipoDestinoTexto, e.TipoEstiloTexto,
        op.TotalLibras, lr.ClienteTipoTexto,
        CASE WHEN ref.TotalLibrasReferencia > 0
          THEN (op.TotalLibras * e.TotalLibras) / ref.TotalLibrasReferencia ELSE 0 END AS LibrasDescongeladas
      FROM dbo.AV_Ship_TotalLibras_fresco e
      INNER JOIN dbo.OPship p ON e.ReferenciaEnvio = p.ReferenciaEnvio
      INNER JOIN dbo.AV_OrdenesProduccion_TotalLibras op ON p.OrdenProduccion = op.OrdenProduccion
      INNER JOIN dbo.AV_LotesRemision lr ON op.FkLoteRemision = lr.IdLoteRemision
      INNER JOIN LibrasReferencia ref ON e.ReferenciaEnvio = ref.ReferenciaEnvio
      WHERE e.FechaCarga BETWEEN @fechaInicial AND @fechaFinal AND e.TipoDestino = 4
    )
    SELECT CAST(FechaCarga AS date) AS FechaCarga, TipoDestinoTexto, TipoEstiloTexto,
      SUM(CASE WHEN ClienteTipoTexto = 'PROGRAMA' THEN TotalLibras ELSE 0 END) AS TotalLibrasPrograma,
      SUM(CASE WHEN ClienteTipoTexto = 'RECHAZO' THEN TotalLibras ELSE 0 END) AS TotalLibrasRechazo,
      SUM(LibrasDescongeladas) AS TotalLibrasDescongeladas
    FROM Base
    GROUP BY CAST(FechaCarga AS date), TipoDestinoTexto, TipoEstiloTexto
    ORDER BY FechaCarga, TipoDestinoTexto, TipoEstiloTexto;
  `, [
    { name: 'fechaInicial', type: sql.Date, value: fechaInicial },
    { name: 'fechaFinal', type: sql.Date, value: fechaFinal },
  ]);

  return rows.map((row) => {
    const descongeladas = pickNumber(row, 'TotalLibrasDescongeladas');
    const programa = pickNumber(row, 'TotalLibrasPrograma');
    const rechazo = pickNumber(row, 'TotalLibrasRechazo');
    const producidas = programa + rechazo;
    return {
      fechaDescongelado: pickString(row, 'FechaCarga'),
      tipoEstilo: pickString(row, 'TipoEstiloTexto') || 'NO APLICA',
      salida: pickString(row, 'TipoDestinoTexto') || 'SIN SALIDA',
      totalLibrasDescongeladas: descongeladas,
      librasProgramaProducidas: programa,
      promedioPrograma: descongeladas > 0 ? programa / descongeladas : 0,
      librasRechazoProducidas: rechazo,
      promedioRechazo: descongeladas > 0 ? rechazo / descongeladas : 0,
      totalLibrasProducidas: producidas,
      promedioGeneral: descongeladas > 0 ? producidas / descongeladas : 0,
    };
  });
}
