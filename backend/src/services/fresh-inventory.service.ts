import { runStbQuery } from './stb.service';
import { pickNumber, pickString } from '../utils/rows';
import { SqlRow } from './sql.service';

/** These are current stocks. No date/shift restriction: old pending stock matters. */
export const FRESH_RECEPTION_QUERY = `
SELECT FechaRemision AS Fecha, IdRemisionPlanta AS Remision, Nombre AS Cliente,
  CodigoFinca, Finca, Laguna, NUM_BIN AS Bin, LIBRAS AS Libras, DiferenciaTiempo AS Tiempo
FROM dbo.RemisionesPlantaPBIInventario
WHERE LIBRAS > 0`;
export const FRESH_TAIL_QUERY = `
SELECT Fecha, Cliente, VodFinca AS CodigoFinca, Finca, Laguna, Bin, LibrasNetas AS Libras
FROM dbo.VInventarioProductoColaPBI
WHERE Enviado = 0 AND LibrasNetas > 0`;
export const FRESH_CLASSIFIED_QUERY = `
SELECT ic.Fecha,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  COALESCE(NULLIF(LTRIM(RTRIM(ic.Destino)), ''), NULLIF(LTRIM(RTRIM(fd.DestinoFinal)), ''), 'Sin destino') AS Destino,
  COALESCE(NULLIF(LTRIM(RTRIM(ic.FincaPBI)), ''), NULLIF(LTRIM(RTRIM(h.FincaPBI)), ''), 'Sin finca') AS Finca,
  COALESCE(NULLIF(LTRIM(RTRIM(ic.LagunaPBI)), ''), NULLIF(LTRIM(RTRIM(h.LagunaPBI)), ''), 'Sin laguna') AS Laguna,
  h.Remision, ic.BIN AS Bin, ic.LibrasNetas AS Libras
FROM dbo.CL_InventarioClasificado ic
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA = ic.IdTallaFinal
LEFT JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE_D = ic.IdLLenadoRecipienteD
LEFT JOIN dbo.CL_LLENADO_RECIPIENTES h ON h.ID_LLENADO_RECIPIENTE = d.ID_LLENADO_RECIPIENTE
LEFT JOIN dbo.CL_DESTINOS_FINAL fd ON fd.IdDestinoFinal = d.IdDestinoFinal
WHERE ic.EnInventario = 1 AND ic.Transferido = 0 AND ic.Procesado = 0
  AND ic.Enviado = 0 AND ISNULL(ic.Reproceso, 0) = 0 AND ic.LibrasNetas > 0`;
export const FRESH_PEELED_QUERY = `
SELECT CAST(FECHA AS date) AS Fecha, NOMBRE_CLIENTE AS Cliente, NOMBRE_DESTINO AS Destino,
  NOMBRE_TALLA AS Talla, NOMBRE AS Estilo, finca AS Finca, laguna AS Laguna,
  [#RECIPIENTE] AS Bin, LOTE AS Lote, LIBRAS AS Libras
FROM dbo.PES_V_LLENADO_RECIPIENTES
WHERE Procesado = 0 AND LIBRAS > 0`;

export type FreshInventoryStage = 'recepcion' | 'cola' | 'clasificado' | 'pelado';
const queries: Record<FreshInventoryStage, string> = {
  recepcion: FRESH_RECEPTION_QUERY, cola: FRESH_TAIL_QUERY,
  clasificado: FRESH_CLASSIFIED_QUERY, pelado: FRESH_PEELED_QUERY,
};
export interface FreshInventoryRow {
  fecha: string; remision: string; cliente: string; codigoFinca: string; finca: string;
  laguna: string; talla: string; destino: string; estilo: string; tallaDestino: string;
  bins: number; libras: number; tiempo: string; minutosEspera: number;
}
export function inventoryAgeMinutes(value: string): number {
  const match = value.match(/(\d+)\s*D\s*,?\s*(\d+)\s*H\s*,?\s*(\d+)\s*M/i);
  return match ? Number(match[1]) * 1440 + Number(match[2]) * 60 + Number(match[3]) : 0;
}
/** Count source rows, as in the operational report. Container numbers can be
 * reused: COUNT(DISTINCT Bin) would hide stock fills that share a container. */
export function aggregateFreshInventory(rows: SqlRow[]): FreshInventoryRow[] {
  const cells = new Map<string, FreshInventoryRow>();
  for (const raw of rows) {
    const value = pickNumber(raw, 'Libras');
    if (value <= 0) continue;
    const dims = {
      fecha: pickString(raw, 'Fecha').slice(0, 10), remision: pickString(raw, 'Remision') || 'Sin remisión',
      cliente: pickString(raw, 'Cliente') || 'Sin cliente', codigoFinca: pickString(raw, 'CodigoFinca') || '—',
      finca: pickString(raw, 'Finca') || 'Sin finca', laguna: pickString(raw, 'Laguna') || 'Sin laguna',
      talla: pickString(raw, 'Talla') || 'Sin talla', destino: pickString(raw, 'Destino') || 'Sin destino',
      estilo: pickString(raw, 'Estilo') || 'Sin estilo',
    };
    const key = JSON.stringify(dims), time = pickString(raw, 'Tiempo'), minutes = inventoryAgeMinutes(time);
    const current = cells.get(key);
    if (current) {
      current.bins += 1; current.libras += value;
      if (minutes > current.minutosEspera) { current.minutosEspera = minutes; current.tiempo = time; }
    } else cells.set(key, { ...dims, tallaDestino: `${dims.talla} · ${dims.destino}`, bins: 1, libras: value, tiempo: time || '—', minutosEspera: minutes });
  }
  // Preserve source precision in grouped values. Round only for presentation.
  return [...cells.values()].map(row => ({ ...row, libras: Number(row.libras.toFixed(6)) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cliente.localeCompare(b.cliente) || a.talla.localeCompare(b.talla) || a.destino.localeCompare(b.destino));
}
export async function getFreshInventory(stage: FreshInventoryStage) {
  return aggregateFreshInventory(await runStbQuery(queries[stage], []));
}
