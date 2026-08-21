import { pickNumber, pickString } from '../utils/rows';
import { runQuery } from './sql.service';

export interface InventoryItem {
  nombreCliente: string;
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
  pesoKilos: number;
  cantidadSerial: number;
}

export async function getInventory(): Promise<InventoryItem[]> {
  const rows = await runQuery(`
    WITH inventario AS (
      SELECT
        lr.Empresa AS NombreCliente,
        op.NoOrdenCompra,
        op.CodigoExterno,
        op.FechaProduccion,
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
      INNER JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
      INNER JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
      INNER JOIN dbo.Masteres m ON m.IdMaster = s.FkMaster
      INNER JOIN dbo.Localidades l ON l.IdLocalidad = m.FkLocalidad
      WHERE m.FkEnvio IS NULL
        AND op.FechaProduccion > CAST('2017-07-27' AS DATE)
        AND op.FkTipo < 4
        AND op.NoOrdenCompra <> ''

      UNION ALL

      SELECT
        lr.Empresa AS NombreCliente,
        op.NoOrdenCompra,
        op.CodigoExterno,
        op.FechaProduccion,
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
      INNER JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
      INNER JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
      INNER JOIN dbo.Freezers f ON f.IdFreezer = s.FkFreezer
      INNER JOIN dbo.Torres t ON t.IdTorre = s.FkTorre
      WHERE s.FkMaster IS NULL
        AND op.NoOrdenCompra <> ''
    )
    SELECT NombreCliente, NoOrdenCompra, CodigoExterno, CAST(FechaProduccion AS date) AS FechaProduccion,
      CodigoItem, EstiloFinal, NombreItem, Marca, Talla, Empaque, TipoItem, Disponibilidad,
      SUM(PesoKilos) AS PesoKilos,
      SUM(CantidadSerial) AS CantidadSerial
    FROM inventario
    GROUP BY NombreCliente, NoOrdenCompra, CodigoExterno, CAST(FechaProduccion AS date),
      CodigoItem, EstiloFinal, NombreItem, Marca, Talla, Empaque, TipoItem, Disponibilidad
    ORDER BY NombreCliente, NombreItem;
  `, []);

  return rows.map((row) => ({
    nombreCliente: pickString(row, 'NombreCliente') || 'Sin cliente',
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
    pesoKilos: pickNumber(row, 'PesoKilos'),
    cantidadSerial: pickNumber(row, 'CantidadSerial'),
  }));
}
