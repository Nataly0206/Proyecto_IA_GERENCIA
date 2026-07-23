import { apiClient } from './client';
import {
  AiChatResponse,
  AiMessage,
  DashboardEndpoint,
  DashboardFilters,
  DataRow,
  IqfLiveResponse,
} from '../types';

function toParams(filters: DashboardFilters): Record<string, string> {
  const params: Record<string, string> = {
    fechaInicial: filters.fechaInicial,
    fechaFinal: filters.fechaFinal,
  };
  if (filters.turno) params.turno = filters.turno;
  return params;
}

export async function fetchIqfLive(turno: string, refresh = false): Promise<IqfLiveResponse> {
  const params: Record<string, string> = {};
  if (turno) params.turno = turno;
  if (refresh) params.refresh = 'true';

  const { data } = await apiClient.get<IqfLiveResponse>('/dashboard/iqf-tiempo-real', {
    params,
  });
  return data;
}

export async function fetchWidgetData(
  endpoint: DashboardEndpoint,
  filters: DashboardFilters,
): Promise<DataRow[]> {
  const { data } = await apiClient.get<DataRow[]>(`/dashboard/${endpoint}`, {
    params: toParams(filters),
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
