import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { REFRESH_INTERVAL_MS } from '../../hooks/useDashboardData';
import PeladoMetaDiaria from './PeladoMetaDiaria';

export default function PeladoMetaMensual({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pelado', 'libras-mes'],
    queryFn: async () => (await apiClient.get<{ mes: string; total: number }>('/dashboard/pelado-libras-mes')).data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  return <PeladoMetaDiaria period="mensual" canEdit={canEdit} total={data?.total ?? 0} loading={isLoading} unavailable={isError || !data} />;
}
