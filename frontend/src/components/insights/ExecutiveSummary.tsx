import { Alert, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useWidgetData } from '../../hooks/useDashboardData';
import { buildInsights } from '../../utils/insights';
import { IqfRateRow, NetProcessRow } from '../../types';

/**
 * Panel "Resumen Ejecutivo": observaciones calculadas automáticamente
 * a partir de los mismos datos que alimentan los 3 reportes.
 */
export default function ExecutiveSummary() {
  const procesosQuery = useWidgetData('libras-netas-proceso');
  const diarioQuery = useWidgetData('iqf-libras-hora-dia');
  const mensualQuery = useWidgetData('iqf-libras-hora-mes');

  const loading =
    procesosQuery.isLoading || diarioQuery.isLoading || mensualQuery.isLoading;

  const insights = buildInsights({
    procesos: procesosQuery.data as NetProcessRow[] | undefined,
    diario: diarioQuery.data as IqfRateRow[] | undefined,
    mensual: mensualQuery.data as IqfRateRow[] | undefined,
  });

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.25}>
          <InsightsOutlinedIcon color="primary" sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2" fontWeight={800}>Resumen Ejecutivo</Typography>
        </Stack>

        {loading && (
          <Stack spacing={1}>
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Stack>
        )}

        {!loading && insights.length === 0 && (
          <Alert severity="info" sx={{ py: 0.75, '& .MuiAlert-message': { py: 0, fontSize: 12 } }}>
            Sin datos para observaciones
          </Alert>
        )}

        {!loading && (
          <Stack spacing={1}>
            {insights.map((insight) => (
              <Alert key={insight.text} severity={insight.severity} variant="outlined" sx={{ py: 0.75, '& .MuiAlert-icon': { py: 0.25, fontSize: 17 }, '& .MuiAlert-message': { py: 0 } }}>
                <Typography variant="body2" fontSize={12}>{insight.text}</Typography>
              </Alert>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
