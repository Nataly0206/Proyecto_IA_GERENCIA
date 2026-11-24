import axios from 'axios';
import { env } from '../config/env';
import { ApiError } from '../middleware/errorHandler';

export interface PurchaseOrderLine {
  contractNumber: string; client: string; itemCode: string; product: string; size: string;
  pendingKg: number; pendingMasters: number; delayWeeks: number;
}
export interface PurchaseOrdersResponse {
  generatedAt: string | null; updatedAt: string | null; fetchedAt: string; lines: PurchaseOrderLine[];
}

/** No transforma una respuesta inválida o un error de origen en una lista vacía. */
export function normalizePurchaseOrders(payload: unknown): PurchaseOrdersResponse {
  const invalid = () => new ApiError(502, 'La API de órdenes devolvió datos con un formato no válido.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid();
  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.lineas)) throw invalid();
  const text = (value: unknown) => { if (typeof value !== 'string' || !value.trim()) throw invalid(); return value.trim(); };
  const amount = (value: unknown) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid(); return value; };
  const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const lines = body.lineas.map((value): PurchaseOrderLine => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const line = value as Record<string, unknown>;
    const delayWeeks = amount(line.semanas_atraso);
    if (!Number.isInteger(delayWeeks)) throw invalid();
    return { contractNumber: text(line.numero_contrato), client: text(line.cliente), itemCode: text(line.codigo_item), product: text(line.producto),
      size: typeof line.talla === 'string' ? line.talla.trim() : '', pendingKg: amount(line.kg_pendiente), pendingMasters: amount(line.masters_pendiente), delayWeeks };
  });
  return { generatedAt: timestamp(body.generado), updatedAt: timestamp(body.actualizado), fetchedAt: new Date().toISOString(), lines };
}

export async function getPurchaseOrders(): Promise<PurchaseOrdersResponse> {
  if (!env.PURCHASE_ORDERS_API_URL || !env.PURCHASE_ORDERS_API_KEY) throw new ApiError(503, 'La conexión con la API de órdenes no está configurada.');
  let payload: unknown;
  try {
    const response = await axios.get<unknown>(env.PURCHASE_ORDERS_API_URL, {
      headers: { 'x-api-key': env.PURCHASE_ORDERS_API_KEY, Accept: 'application/json' },
      timeout: 15000, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024,
    });
    payload = response.data;
  } catch (error) {
    // No propagar AxiosError: su configuración contiene la clave de la API.
    if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) throw new ApiError(502, 'La API de órdenes rechazó la autenticación. Revisa la configuración de la conexión.');
    if (axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '')) throw new ApiError(504, 'La API de órdenes tardó demasiado en responder. Intenta actualizar.');
    throw new ApiError(502, 'No se pudo consultar la API de órdenes. Verifica que el servicio esté disponible e intenta actualizar.');
  }
  return normalizePurchaseOrders(payload);
}
