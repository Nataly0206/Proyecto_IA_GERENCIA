import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { PowerBIEmbed } from 'powerbi-client-react';
import { models } from 'powerbi-client';
import { apiClient } from '../../api/client';
import axios from 'axios';

interface EmbedConfigResponse {
  accessToken: string;
  embedUrl: string;
  reportId: string;
}

export default function PowerBIReportContainer() {
  const [config, setConfig] = useState<EmbedConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get<EmbedConfigResponse>('/powerbi/embed-token');
      setConfig(data);
    } catch (requestError) {
      setConfig(null);
      const response = axios.isAxiosError(requestError)
        ? requestError.response?.data as { error?: string; details?: unknown } | undefined
        : undefined;
      const detail = response?.details ? `\n\nDetalle técnico:\n${JSON.stringify(response.details, null, 2)}` : '';
      setError(`${response?.error ?? 'No se pudo conectar con Power BI. Verifica la configuración o intenta nuevamente.'}${detail}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReport(); }, [loadReport]);

  if (loading) {
    return (
      <Stack sx={{ height: '100%', minHeight: 360 }} alignItems="center" justifyContent="center" spacing={1.5}>
        <CircularProgress size={34} />
        <Typography color="text.secondary">Cargando reporte de Power BI…</Typography>
      </Stack>
    );
  }

  if (error || !config) {
    return (
      <Stack sx={{ height: '100%', minHeight: 360 }} alignItems="center" justifyContent="center">
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshOutlinedIcon />} onClick={() => void loadReport()}>Reintentar</Button>}
          sx={{ maxWidth: 720, whiteSpace: 'pre-wrap' }}
        >
          {error}
        </Alert>
      </Stack>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 500, '& .powerbi-report-container, & iframe': { width: '100% !important', height: '100% !important', border: 0 } }}>
      <PowerBIEmbed
        embedConfig={{
          type: 'report',
          id: config.reportId,
          embedUrl: config.embedUrl,
          accessToken: config.accessToken,
          tokenType: models.TokenType.Embed,
          settings: {
            panes: {
              filters: { expanded: false, visible: true },
              pageNavigation: { visible: true },
            },
            background: models.BackgroundType.Transparent,
          },
        }}
        cssClassName="powerbi-report-container"
      />
    </Box>
  );
}
