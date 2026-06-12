import { apiClient } from './client';
import { DashboardEndpoint, DashboardFilters, DataRow, IqfLiveResponse } from '../types';

function toParams(filters: DashboardFilters): Record<string, string> {
  const params: Record<string, string> = {
    fechaInicial: filters.fechaInicial,
    fechaFinal: filters.fechaFinal,
  };
  if (filters.turno) params.turno = filters.turno;
  return params;
}

export async function fetchIqfLive(turno: string): Promise<IqfLiveResponse> {
  const { data } = await apiClient.get<IqfLiveResponse>('/dashboard/iqf-tiempo-real', {
    params: turno ? { turno } : {},
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
