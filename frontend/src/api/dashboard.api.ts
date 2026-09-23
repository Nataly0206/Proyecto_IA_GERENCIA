import { apiClient } from './client';
import {
  AiChatResponse,
  AiMessage,
  ClasificadoPorMaquinaHoyResponse,
  DashboardEndpoint,
  DashboardFilters,
  DataRow,
  IqfLiveResponse,
  PeladoLibrasHoyResponse,
  PeladoLibrasHoyTallaResponse,
  PeladoPorSalaResponse,
} from '../types';

function toParams(filters: DashboardFilters): Record<string, string> {
  const params: Record<string, string> = {
    fechaInicial: filters.fechaInicial,
    fechaFinal: filters.fechaFinal,
  };
  if (filters.turno) params.turno = filters.turno;
  return params;
}

export async function fetchIqfLive(refresh = false): Promise<IqfLiveResponse> {
  const { data } = await apiClient.get<IqfLiveResponse>('/dashboard/iqf-tiempo-real', {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return data;
}

export async function fetchPeladoLibrasHoy(refresh = false): Promise<PeladoLibrasHoyResponse> {
  const { data } = await apiClient.get<PeladoLibrasHoyResponse>('/dashboard/pelado-libras-hoy', {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return data;
}

export async function fetchPeladoLibrasHoyTalla(
  refresh = false,
): Promise<PeladoLibrasHoyTallaResponse> {
  const { data } = await apiClient.get<PeladoLibrasHoyTallaResponse>(
    '/dashboard/pelado-libras-hoy-talla',
    { params: refresh ? { refresh: 'true' } : undefined },
  );
  return data;
}

export async function fetchPeladoPorSala(refresh = false): Promise<PeladoPorSalaResponse> {
  const { data } = await apiClient.get<PeladoPorSalaResponse>('/dashboard/pelado-por-sala', {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return data;
}

export async function fetchClasificadoPorMaquinaHoy(refresh = false): Promise<ClasificadoPorMaquinaHoyResponse> {
  const { data } = await apiClient.get<ClasificadoPorMaquinaHoyResponse>('/dashboard/clasificado-por-maquina-hoy', {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return data;
}

/** Endpoints "en vivo" de los módulos de proceso (contadores del día o
 *  la semana en curso, sin filtros). */
export type ProcesoResumenEndpoint =
  | 'recepcion-resumen'
  | 'descabezado-resumen'
  | 'clasificado-resumen'
  | 'exportaciones-resumen'
  | 'compra-mp-resumen';

export async function fetchProcesoResumen<T>(
  endpoint: ProcesoResumenEndpoint,
  refresh = false,
  extraParams?: Record<string, string>,
): Promise<T> {
  const { data } = await apiClient.get<T>(`/dashboard/${endpoint}`, {
    params: { ...extraParams, ...(refresh ? { refresh: 'true' } : {}) },
  });
  return data;
}

export async function fetchWidgetData(
  endpoint: DashboardEndpoint,
  filters: DashboardFilters,
  refresh = false,
  extraParams?: Record<string, string>,
): Promise<DataRow[]> {
  const { data } = await apiClient.get<DataRow[]>(`/dashboard/${endpoint}`, {
    params: {
      ...toParams(filters),
      ...extraParams,
      ...(refresh ? { refresh: 'true' } : {}),
    },
  });
  return data;
}

/**
 * Envía un mensaje al Asistente IA y recibe texto + gráficas opcionales.
 * `history` contiene todos los mensajes previos (usuario y asistente)
 * para mantener contexto de conversación.
 */
export async function sendAiChat(history: AiMessage[]): Promise<AiChatResponse> {
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const { data } = await apiClient.post<AiChatResponse>('/ai/chat', { messages }, {
    // Una respuesta con herramientas necesita al menos dos llamadas al
    // modelo (decidir consulta + interpretar resultados).
    timeout: 300_000,
  });
  return data;
}
