import axios from 'axios';
import { env } from '../config/env';
import { runQuery } from './sql.service';

/* ------------------------------------------------------------------ */
/* Tipos internos del protocolo OpenAI compatible de NVIDIA NIM        */
/* ------------------------------------------------------------------ */

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiResponse {
  choices: Array<{
    message: OpenAiMessage;
    finish_reason: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                       */
/* ------------------------------------------------------------------ */

export interface AiChartConfig {
  id: string;
  type: 'bar' | 'column' | 'line' | 'area' | 'donut' | 'pie';
  title: string;
  subtitle?: string;
  xField: string;
  yField: string | string[];
  seriesField?: string;
  seriesNames?: string[];
  valueFormat?: 'number' | 'decimal' | 'percent';
  sort?: { field: string; direction: 'asc' | 'desc' };
  colors?: string[];
}

export interface AiChartResult {
  config: AiChartConfig;
  rows: Record<string, unknown>[];
}

export interface AiResponse {
  message: string;
  charts: AiChartResult[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ------------------------------------------------------------------ */
/* Prompt del sistema                                                   */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Eres un asistente BI para análisis de producción de una planta camaronera. Respondes SIEMPRE en español.

## Base de datos: PlantaEmpacadora (SQL Server — usa T-SQL, NUNCA sintaxis PostgreSQL)
Funciones de fecha: GETDATE(), DATEADD(DAY,-N,CAST(GETDATE() AS DATE)), CAST(x AS DATE), FORMAT(x,'yyyy-MM')

### VISTA PRINCIPAL: dbo.AV_Produccion_Diaria
Columnas EXACTAS disponibles:
  FechaProduccion  (DATE)     — fecha de producción
  EstiloFinal      (NVARCHAR) — tipo de producto: 'PPV-UK', 'ANILLOS', 'PD', 'COOK', 'PPV-FR', etc.
  PesoLibras       (DECIMAL)  — libras de esta caja/serial
  fkTipo           (INT)      — 0=producción RECEPCION, 1=reproceso, 2=reempaque, 4=Fresh Tail
  TipoOP           (NVARCHAR) — texto del tipo: 'RECEPCION', 'REPROCESO', 'REEMPAQUE'
  Item             (NVARCHAR) — nombre completo del producto
  OrdenProduccion  (NVARCHAR) — número de orden
  NoRemision       (NVARCHAR) — número de remisión de materia prima
  Empresa          (NVARCHAR) — empresa/cliente

FILTRO ESTÁNDAR producción (fkTipo=0 es producción normal):
  WHERE fkTipo = 0 AND CAST(FechaProduccion AS DATE) BETWEEN @FechaInicio AND @FechaFin

QUERIES DE EJEMPLO:

-- Libras por tipo de producto (EstiloFinal), últimos 30 días:
SELECT EstiloFinal AS proceso, SUM(PesoLibras) AS libras, COUNT(*) AS cajas
FROM dbo.AV_Produccion_Diaria
WHERE CAST(FechaProduccion AS DATE) BETWEEN DATEADD(DAY,-30,CAST(GETDATE() AS DATE)) AND CAST(GETDATE() AS DATE)
  AND fkTipo = 0
GROUP BY EstiloFinal ORDER BY libras DESC

-- Tendencia diaria última semana:
SELECT CAST(FechaProduccion AS DATE) AS dia, SUM(PesoLibras) AS libras
FROM dbo.AV_Produccion_Diaria
WHERE CAST(FechaProduccion AS DATE) >= DATEADD(DAY,-7,CAST(GETDATE() AS DATE)) AND fkTipo=0
GROUP BY CAST(FechaProduccion AS DATE) ORDER BY dia

-- Tendencia mensual últimos 6 meses:
SELECT FORMAT(FechaProduccion,'yyyy-MM') AS mes, SUM(PesoLibras) AS libras
FROM dbo.AV_Produccion_Diaria
WHERE FechaProduccion >= DATEADD(MONTH,-6,CAST(GETDATE() AS DATE)) AND fkTipo=0
GROUP BY FORMAT(FechaProduccion,'yyyy-MM') ORDER BY mes

-- Por empresa/cliente:
SELECT Empresa, SUM(PesoLibras) AS libras
FROM dbo.AV_Produccion_Diaria
WHERE CAST(FechaProduccion AS DATE) >= DATEADD(DAY,-30,CAST(GETDATE() AS DATE)) AND fkTipo=0
GROUP BY Empresa ORDER BY libras DESC

### Otras vistas disponibles (funcionando):
- dbo.AV_Facturas_Resumen — NoFactura, FechaFactura, fkCliente, Empresa, etc.
- dbo.AV_Facturas — datos de facturación detallada
- dbo.AV_RecepcionLibras — recepción de materia prima
- dbo.AV_LotesRemision — lotes de remisión de camarón crudo
- dbo.AV_Items — catálogo de productos
- dbo.EquiposIQF — IDequipo, NombreIQF

## Reglas de herramienta
Usa query_database para ejecutar consultas SELECT. Las queries de ejemplo son las más rápidas — úsalas.
NO uses las vistas AV_Produccion_Diaria_Resumen ni AV_Produccion_Diaria_2020 (están fuera de servicio).

## Formato de respuesta OBLIGATORIO — sin texto fuera del JSON:
{"message":"Texto con los números directamente.","charts":[]}

### Reglas de gráficas (MUY IMPORTANTE):
- Por DEFECTO usa "charts":[] y escribe los datos como TEXTO en "message" con los números formateados.
- Solo incluye una gráfica cuando el usuario la pida explícitamente ("muéstrame una gráfica", "grafícame", "quiero ver una chart") O cuando la pregunta sea sobre tendencias a lo largo del tiempo con muchos puntos (más de 7 días/meses).
- Para totales, rankings, comparaciones simples: siempre texto puro, sin gráfica.

### Formato del campo "message":
Incluye los datos como lista legible. Ejemplo para totales:
  "IQF PEELED: 139,643 lbs (73.9%)\nAROS: 36,498 lbs (19.3%)\n..."
Para una sola cifra: responde directo, sin rodeos.
Siempre termina con una observación breve del dato más relevante.

### Cuando SÍ uses gráfica:
Tipos disponibles: bar=barras horizontales, column=barras verticales, line=línea temporal, donut/pie=circular.
Máximo 2 gráficas por respuesta. Usa "number" para libras enteras, "decimal" para decimales.
Estructura: {"config":{"id":"ai-1","type":"line","title":"Título","xField":"campo_x","yField":"campo_y","valueFormat":"number"},"rows":[...]}`;

/* ------------------------------------------------------------------ */
/* Definición de herramientas                                          */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'query_database',
      description:
        'Ejecuta una consulta SELECT de solo lectura en SQL Server (PlantaEmpacadora) y devuelve los resultados como JSON. Úsala para obtener los datos que necesitas graficar o analizar.',
      parameters: {
        type: 'object' as const,
        properties: {
          sql: {
            type: 'string',
            description:
              'Consulta SQL SELECT válida. Solo lectura — no uses INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, EXEC ni xp_.',
          },
        },
        required: ['sql'],
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/* Seguridad SQL                                                        */
/* ------------------------------------------------------------------ */

const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|KILL|DBCC|WAITFOR|BULK|OPENROWSET|OPENQUERY|OPENDATASOURCE|OPENXML|xp_\w*|sp_\w*)\b/i;

/**
 * Defensa en profundidad a nivel de aplicación. NO es el control de
 * seguridad principal: el login de BD usado por este servicio debe tener
 * permisos de solo SELECT sobre las vistas necesarias (ver
 * backend/sql/create_readonly_user.sql). Aun si esta función tuviera un
 * bypass, los permisos de BD deben impedir cualquier escritura.
 */
function isSafeQuery(sql: string): boolean {
  // Elimina comentarios antes de analizar: evitan que texto útil para el
  // filtro (o inyectado para "romper" el parseo humano) quede oculto.
  const withoutComments = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const trimmed = withoutComments.trim();
  if (!trimmed) return false;

  // Solo una sentencia: se permite como mucho un ';' final, no dentro.
  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) return false;

  if (!/^SELECT\b/i.test(withoutTrailingSemicolon)) return false;
  if (FORBIDDEN_PATTERN.test(withoutTrailingSemicolon)) return false;

  // "SELECT ... INTO tabla FROM ..." crea una tabla nueva — no es DDL
  // detectable por palabra clave, se bloquea aparte.
  if (/\bSELECT\b[\s\S]*?\bINTO\b/i.test(withoutTrailingSemicolon)) return false;

  return true;
}

/* ------------------------------------------------------------------ */
/* Extracción de JSON del texto del modelo                             */
/* ------------------------------------------------------------------ */

interface AiJsonPayload {
  message: string;
  charts: AiChartResult[];
}

function extractJson(text: string): AiJsonPayload | null {
  // Intento directo
  try {
    const parsed = JSON.parse(text) as AiJsonPayload;
    if (typeof parsed?.message === 'string') return parsed;
  } catch { /* no-op */ }

  // Bloque ```json ... ```
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1]) as AiJsonPayload;
      if (typeof parsed?.message === 'string') return parsed;
    } catch { /* no-op */ }
  }

  // Mayor bloque { ... }
  const braceMatch = text.match(/\{[\s\S]+\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]) as AiJsonPayload;
      if (typeof parsed?.message === 'string') return parsed;
    } catch { /* no-op */ }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Loop agéntico principal                                             */
/* ------------------------------------------------------------------ */

const MAX_TOOL_ITERATIONS = 8;
const AI_TIMEOUT_MS = 120_000;

export async function runAiChat(messages: ConversationMessage[]): Promise<AiResponse> {
  if (!env.AI_API_KEY) {
    return { message: 'El asistente IA no está configurado (AI_API_KEY faltante).', charts: [] };
  }

  const openAiMessages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m): OpenAiMessage => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { data: response } = await axios.post<OpenAiResponse>(
      `${env.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`,
      {
        model: env.AI_MODEL,
        max_tokens: 4096,
        temperature: 0.2,
        stream: false,
        messages: openAiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
      },
      {
        headers: {
          Authorization: `Bearer ${env.AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: AI_TIMEOUT_MS,
      },
    );

    const assistantMessage = response.choices?.[0]?.message;
    if (!assistantMessage) {
      return { message: 'NVIDIA no devolvió una respuesta válida.', charts: [] };
    }
    const toolCalls = assistantMessage.tool_calls ?? [];

    // Sin herramientas → respuesta final
    if (toolCalls.length === 0) {
      const rawText = assistantMessage.content ?? '';

      const parsed = extractJson(rawText);
      if (parsed) {
        return {
          message: parsed.message,
          charts: Array.isArray(parsed.charts) ? parsed.charts : [],
        };
      }

      return { message: rawText || 'Sin respuesta del asistente.', charts: [] };
    }

    // Añadir turno del asistente con las llamadas a herramienta
    openAiMessages.push({
      role: 'assistant',
      content: assistantMessage.content,
      tool_calls: toolCalls,
    });

    // Ejecutar todas las herramientas en paralelo
    const toolResults: OpenAiMessage[] = await Promise.all(
      toolCalls.map(async (tc): Promise<OpenAiMessage> => {
        let content: string;
        try {
          const args = JSON.parse(tc.function.arguments || '{}') as { sql?: unknown };
          const sql = String(args.sql ?? '').trim();
          if (!sql) {
            content = JSON.stringify({ error: 'La consulta SQL está vacía.' });
          } else if (!isSafeQuery(sql)) {
            content = JSON.stringify({
              error: 'Solo se permiten consultas SELECT de solo lectura.',
            });
          } else {
            const rows = await runQuery(sql, []);
            const limited = rows.slice(0, 500);
            content = JSON.stringify({ rows: limited, total: rows.length });
          }
        } catch (err) {
          content = JSON.stringify({
            error: err instanceof Error ? err.message : 'Error de base de datos.',
          });
        }
        return { role: 'tool', tool_call_id: tc.id, content };
      }),
    );

    openAiMessages.push(...toolResults);
  }

  return {
    message: 'Se alcanzó el límite de iteraciones del agente. Intenta una consulta más específica.',
    charts: [],
  };
}
