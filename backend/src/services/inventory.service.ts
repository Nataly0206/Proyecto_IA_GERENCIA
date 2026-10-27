import { pickNumber, pickString } from '../utils/rows';
import { runQuery } from './sql.service';

export interface InventoryItem {
  nombreCliente: string;
  nombreClientePrincipal: string;
  noOrdenCompra: string;
  codigoExterno: string;
  fechaProduccion: string;
  codigoItem: string;
  estiloFinal: string;
  nombreItem: string;
  marca: string;
  talla: string;
  empaque: string;
  tipoItem: string;
  disponibilidad: string;
  nombreFinca?: string;
  laguna?: string;
  color?: string;
  codigoProduccion?: string;
  pesoKilos: number;
  cantidadSerial: number;
  availableSerial?: number;
  parcial?: boolean;
}

export async function getInventory(): Promise<InventoryItem[]> {
  // La orden puede destinar producto de un lote genérico a otro cliente.
  // Resolver cliente y principal desde el mismo destino evita ocultar existencias.
  const rows = await runQuery(`
    WITH inventario AS (
      SELECT
        COALESCE(NULLIF(destino.Empresa, ''), lr.Empresa) AS NombreCliente,
        COALESCE(NULLIF(cp.NombreCliente, ''), NULLIF(destino.Empresa, ''), lr.Empresa) AS NombreClientePrincipal,
        op.NoOrdenCompra,
        op.CodigoExterno,
        op.FechaProduccion,
        lr.Finca AS NombreFinca, lr.laguna AS Laguna, color.CodigoColor AS Color, op.OrdenProduccion AS CodigoProduccion,
        i.CodigoItem,
        i.EstiloFinal,
        i.Item AS NombreItem,
        i.Marca,
        i.TallaExport AS Talla,
        i.Empaque,
        i.TipoItem,
        CASE op.FkStatus WHEN 1 THEN 'DISPONIBLE' WHEN 2 THEN 'PENDIENTE'
          WHEN 3 THEN 'RETENIDO' WHEN 4 THEN 'CUARENTENADO' ELSE 'DESCONOCIDO' END AS Disponibilidad,
        i.PesoKilos,
        s.Cantidad AS CantidadSerial
      FROM dbo.Seriales s
      INNER JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
      LEFT JOIN dbo.Colores color ON color.PKcolor = op.fkColor
      INNER JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
      INNER JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
      INNER JOIN dbo.Masteres m ON m.IdMaster = s.FkMaster
      INNER JOIN dbo.Localidades l ON l.IdLocalidad = m.FkLocalidad
      INNER JOIN dbo.Empresas e ON e.IDEmpresa = lr.IDEmpresa
      LEFT JOIN dbo.Empresas destino ON destino.IDEmpresa = NULLIF(op.fkClienteDestinoOP, 0)
      LEFT JOIN dbo.ClientesProduccion cp ON cp.IDCliente = CASE
        WHEN NULLIF(destino.Empresa, '') IS NOT NULL THEN destino.fkClienteProduccion
        ELSE e.fkClienteProduccion END
      WHERE m.FkEnvio IS NULL
        AND op.FechaProduccion > CAST('2017-07-27' AS DATE)
        AND op.FkTipo < 4

      UNION ALL

      SELECT
        COALESCE(NULLIF(destino.Empresa, ''), lr.Empresa) AS NombreCliente,
        COALESCE(NULLIF(cp.NombreCliente, ''), NULLIF(destino.Empresa, ''), lr.Empresa) AS NombreClientePrincipal,
        op.NoOrdenCompra,
        op.CodigoExterno,
        op.FechaProduccion,
        lr.Finca AS NombreFinca, lr.laguna AS Laguna, color.CodigoColor AS Color, op.OrdenProduccion AS CodigoProduccion,
        i.CodigoItem,
        i.EstiloFinal,
        i.Item AS NombreItem,
        i.Marca,
        i.TallaExport AS Talla,
        i.Empaque,
        i.TipoItem,
        CASE op.FkStatus WHEN 1 THEN 'DISPONIBLE' WHEN 2 THEN 'PENDIENTE'
          WHEN 3 THEN 'RETENIDO' WHEN 4 THEN 'CUARENTENADO' ELSE 'DESCONOCIDO' END AS Disponibilidad,
        i.PesoKilos,
        1 AS CantidadSerial
      FROM dbo.Seriales s
      INNER JOIN dbo.SerialesSobrantes ss ON ss.FkSerial = s.IdSerial
      INNER JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
      LEFT JOIN dbo.Colores color ON color.PKcolor = op.fkColor
      INNER JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
      INNER JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
      INNER JOIN dbo.Freezers f ON f.IdFreezer = s.FkFreezer
      INNER JOIN dbo.Torres t ON t.IdTorre = s.FkTorre
      INNER JOIN dbo.Empresas e ON e.IDEmpresa = lr.IDEmpresa
      LEFT JOIN dbo.Empresas destino ON destino.IDEmpresa = NULLIF(op.fkClienteDestinoOP, 0)
      LEFT JOIN dbo.ClientesProduccion cp ON cp.IDCliente = CASE
        WHEN NULLIF(destino.Empresa, '') IS NOT NULL THEN destino.fkClienteProduccion
        ELSE e.fkClienteProduccion END
      WHERE s.FkMaster IS NULL
    )
    SELECT NombreCliente, NombreClientePrincipal, NoOrdenCompra, CodigoExterno, CAST(FechaProduccion AS date) AS FechaProduccion,
      CodigoItem, EstiloFinal, NombreItem, Marca, Talla, Empaque, TipoItem, Disponibilidad, NombreFinca, Laguna, Color, CodigoProduccion,
      SUM(PesoKilos) AS PesoKilos,
      SUM(CantidadSerial) AS CantidadSerial
    FROM inventario
    GROUP BY NombreCliente, NombreClientePrincipal, NoOrdenCompra, CodigoExterno, CAST(FechaProduccion AS date),
      CodigoItem, EstiloFinal, NombreItem, Marca, Talla, Empaque, TipoItem, Disponibilidad, NombreFinca, Laguna, Color, CodigoProduccion
    ORDER BY NombreCliente, NombreItem;
  `, []);

  return rows.map((row) => ({
    nombreCliente: pickString(row, 'NombreCliente') || 'Sin cliente',
    nombreClientePrincipal: pickString(row, 'NombreClientePrincipal') || 'Sin cliente principal',
    noOrdenCompra: pickString(row, 'NoOrdenCompra') || 'Sin orden',
    codigoExterno: pickString(row, 'CodigoExterno') || 'Sin código externo',
    fechaProduccion: pickString(row, 'FechaProduccion') || 'Sin fecha',
    codigoItem: pickString(row, 'CodigoItem') || 'Sin código',
    estiloFinal: pickString(row, 'EstiloFinal') || 'Sin estilo',
    nombreItem: pickString(row, 'NombreItem') || 'Sin nombre',
    marca: pickString(row, 'Marca') || 'Sin marca',
    talla: pickString(row, 'Talla') || 'Sin talla',
    empaque: pickString(row, 'Empaque') || 'Sin empaque',
    tipoItem: pickString(row, 'TipoItem') || 'Sin tipo',
    disponibilidad: pickString(row, 'Disponibilidad') || 'Desconocido',
    nombreFinca: pickString(row, 'NombreFinca'),
    laguna: pickString(row, 'Laguna'),
    color: pickString(row, 'Color'),
    codigoProduccion: pickString(row, 'CodigoProduccion'),
    pesoKilos: pickNumber(row, 'PesoKilos'),
    cantidadSerial: pickNumber(row, 'CantidadSerial'),
  }));
}
