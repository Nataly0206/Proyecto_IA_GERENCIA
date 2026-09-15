import axios, { AxiosError } from 'axios';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { env } from '../config/env';
import { ApiError } from '../middleware/errorHandler';

const POWERBI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const POWERBI_API = 'https://api.powerbi.com/v1.0/myorg';

export interface PowerBIEmbedConfig {
  accessToken: string;
  embedUrl: string;
  reportId: string;
}

function getPowerBIConfig(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string;
  reportId: string;
} {
  const config = {
    tenantId: env.POWERBI_TENANT_ID.trim(),
    clientId: env.POWERBI_CLIENT_ID.trim(),
    clientSecret: env.POWERBI_CLIENT_SECRET.trim(),
    workspaceId: env.POWERBI_WORKSPACE_ID.trim(),
    reportId: env.POWERBI_REPORT_ID.trim(),
  };

  if (Object.values(config).some((value) => !value)) {
    throw new ApiError(503, 'La integración de Power BI todavía no está configurada.');
  }

  const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const invalidIds = Object.entries(config)
    .filter(([key, value]) => key !== 'clientSecret' && !guidPattern.test(value))
    .map(([key]) => key);
  if (invalidIds.length > 0) {
    throw new ApiError(503, `La configuración de Power BI contiene identificadores inválidos: ${invalidIds.join(', ')}. Deben ser GUID sin partes adicionales de la URL.`);
  }
  return config;
}

export async function generatePowerBIEmbedConfig(): Promise<PowerBIEmbedConfig> {
  const config = getPowerBIConfig();
  let stage = 'Autenticación con Microsoft Entra ID';
  const msalClient = new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  });

  try {
    const authResult = await msalClient.acquireTokenByClientCredential({
      scopes: [POWERBI_SCOPE],
    });
    if (!authResult?.accessToken) {
      throw new ApiError(502, 'Microsoft Entra ID no devolvió un token de acceso.');
    }

    const headers = { Authorization: `Bearer ${authResult.accessToken}` };
    const reportUrl = `${POWERBI_API}/groups/${encodeURIComponent(config.workspaceId)}/reports/${encodeURIComponent(config.reportId)}`;
    stage = 'Consulta de metadatos del reporte';
    const reportResponse = await axios.get<{ embedUrl: string }>(reportUrl, { headers, timeout: 15_000 });
    stage = 'Generación del Embed Token';
    const tokenResponse = await axios.post<{ token: string }>(
      `${reportUrl}/GenerateToken`,
      { accessLevel: 'View' },
      { headers, timeout: 15_000 },
    );

    if (!reportResponse.data.embedUrl || !tokenResponse.data.token) {
      throw new ApiError(502, 'Power BI devolvió una respuesta incompleta.');
    }

    return {
      accessToken: tokenResponse.data.token,
      embedUrl: reportResponse.data.embedUrl,
      reportId: config.reportId,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const isAxiosError = error instanceof AxiosError;
    const status = isAxiosError ? error.response?.status : undefined;
    const providerDetails = isAxiosError
      ? error.response?.data ?? error.message
      : error instanceof Error ? error.message : String(error);

    const diagnostic = {
      etapa: stage,
      estadoHttpMicrosoft: status,
      codigo: isAxiosError ? error.code : undefined,
      mensaje: isAxiosError ? error.message : providerDetails,
      respuestaMicrosoft: providerDetails,
    };
    console.error('ERROR POWERBI DETALLADO:', diagnostic);
    throw new ApiError(
      502,
      'No fue posible obtener el reporte de Power BI. Verifica la configuración y los permisos del servicio.',
      diagnostic,
    );
  }
}
