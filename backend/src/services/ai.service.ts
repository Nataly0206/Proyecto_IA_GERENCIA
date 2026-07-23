import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { env } from '../config/env';
import { runQuery, runStoredProcedure } from './sql.service';
import { IQF_DAILY_RATE_QUERY } from './reports.queries';

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

const BASE_SYSTEM_PROMPT = `Eres un asistente BI experto en las bases de datos de STB, una empresa camaronera hondureña. Respondes SIEMPRE en español.

## Fuente de verdad
El bloque <documentacion_bd> contiene el contenido completo del archivo
docs/Documentacion_Completa_BD_STB.md. Úsalo como fuente principal para decidir:
- qué base, tabla, vista o procedimiento consultar;
- qué columnas y relaciones usar;
- cómo interpretar fechas, turnos, libras, tallas, clientes y procesos.

No inventes tablas, columnas ni relaciones que no estén documentadas. Si la
documentación no alcanza para responder con seguridad, dilo claramente.

## Reglas de herramientas
- Usa query_database para consultas T-SQL SELECT de solo lectura.
- Usa run_production_report para los procedimientos de producción permitidos
  cuando la documentación indique que son la fuente canónica.
- Nunca intentes escribir, alterar o eliminar datos.
- Antes de responder cifras actuales, consulta la base. No presentes como dato
  real un ejemplo incluido en la documentación.
- Prefiere agregados en SQL y rangos de fecha acotados; evita devolver miles de filas.

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
El contenido de "message" debe ser texto plano: no uses Markdown, asteriscos
para negrita, encabezados Markdown ni bloques de código.

### Cuando SÍ uses gráfica:
Tipos disponibles: bar=barras horizontales, column=barras verticales, line=línea temporal, donut/pie=circular.
Máximo 2 gráficas por respuesta, sin excepción. Cada gráfica debe contener
como máximo 40 filas. Usa "number" para libras enteras, "decimal" para decimales.
Cuando varias filas comparten el mismo valor de xField y se distinguen por otra
columna (por ejemplo Turno A/Turno B), incluye esa columna como seriesField.
Estructura: {"config":{"id":"ai-1","type":"line","title":"Título","xField":"campo_x","yField":"campo_y","valueFormat":"number"},"rows":[...]}`;

const CONTEXT_FILENAME = 'Documentacion_Completa_BD_STB.md';
let databaseContextCache: string | null = null;
let databaseSectionsCache: { title: string; content: string }[] | null = null;

function loadDatabaseContext(): string {
  if (databaseContextCache !== null) return databaseContextCache;

  const candidates = [
    env.AI_CONTEXT_PATH,
    path.resolve(process.cwd(), 'docs', CONTEXT_FILENAME),
    path.resolve(process.cwd(), '..', 'docs', CONTEXT_FILENAME),
    path.resolve(__dirname, '..', '..', 'docs', CONTEXT_FILENAME),
    path.resolve(__dirname, '..', '..', '..', 'docs', CONTEXT_FILENAME),
  ].filter(Boolean);

  const contextPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!contextPath) {
    throw new Error(
      `No se encontró ${CONTEXT_FILENAME}. Rutas revisadas: ${candidates.join(', ')}`,
    );
  }

  databaseContextCache = fs.readFileSync(contextPath, 'utf8').trim();
  if (!databaseContextCache) {
    throw new Error(`El archivo de contexto ${contextPath} está vacío.`);
  }

  console.log(
    `[ai] Contexto BD cargado desde ${contextPath} (${databaseContextCache.length} caracteres)`,
  );
  return databaseContextCache;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getDatabaseSections(): { title: string; content: string }[] {
  if (databaseSectionsCache) return databaseSectionsCache;

  const document = loadDatabaseContext();
  const starts = Array.from(document.matchAll(/^#{2,4}\s+.+$/gm));
  databaseSectionsCache = starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? document.length;
    return {
      title: match[0].replace(/^#{2,4}\s+/, '').trim(),
      content: document.slice(start, end).trim(),
    };
  });
  return databaseSectionsCache;
}

/**
 * Selecciona fragmentos relevantes del documento completo. El documento es
 * la única fuente del contexto, pero no se reenvían sus 115 KB en cada
 * iteración: eso hacía que NVIDIA agotara el timeout al interpretar resultados.
 */
function selectDatabaseContext(query: string): string {
  const sections = getDatabaseSections();
  const stopWords = new Set([
    'para', 'como', 'cual', 'cuales', 'donde', 'desde', 'hasta', 'entre',
    'sobre', 'este', 'esta', 'estos', 'estas', 'quiero', 'dime', 'muestra',
    'consulta', 'base', 'datos', 'segun', 'documentacion',
  ]);
  const terms = Array.from(
    new Set(
      normalizeSearchText(query)
        .split(/[^a-z0-9_]+/)
        .filter((term) => term.length >= 4 && !stopWords.has(term)),
    ),
  );

  const mandatoryTitles = [
    'reglas fundamentales',
    'que base de datos usar',
    'que procedimiento almacenado usar para consultas de produccion',
  ];
  const mandatory = sections.filter((section) =>
    mandatoryTitles.includes(normalizeSearchText(section.title)),
  );

  const scored = sections
    .filter((section) => !mandatory.includes(section))
    .map((section) => {
      const title = normalizeSearchText(section.title);
      const content = normalizeSearchText(section.content);
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 12 : 0) +
          Math.min(content.split(term).length - 1, 8),
        0,
      );
      return { section, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [...mandatory];
  let totalChars = selected.reduce((total, section) => total + section.content.length, 0);
  const maxChars = 32_000;

  for (const { section } of scored) {
    if (selected.includes(section)) continue;
    if (totalChars + section.content.length > maxChars && selected.length >= 5) continue;
    selected.push(section);
    totalChars += section.content.length;
    if (selected.length >= 12 || totalChars >= maxChars) break;
  }

  return selected.map((section) => section.content).join('\n\n---\n\n');
}

function buildSystemPrompt(messages: ConversationMessage[]): string {
  const recentQuestions = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join('\n');

  return `${BASE_SYSTEM_PROMPT}

<documentacion_bd>
${selectDatabaseContext(recentQuestions)}
</documentacion_bd>`;
}

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
  {
    type: 'function' as const,
    function: {
      name: 'run_production_report',
      description:
        'Ejecuta uno de los procedimientos almacenados canónicos de producción documentados, con modos de solo lectura expresamente permitidos.',
      parameters: {
        type: 'object' as const,
        properties: {
          procedure: {
            type: 'string',
            enum: [
              'a_Fill_Produccion_Diaria_lectura',
              'a_Fill_Produccion_Diaria_lectura_dos',
            ],
          },
          resumen: {
            type: 'integer',
            description: 'Modo @Resumen documentado para el procedimiento.',
          },
          fechaInicial: {
            type: 'string',
            description: 'Fecha inicial en formato YYYY-MM-DD.',
          },
          fechaFinal: {
            type: 'string',
            description: 'Fecha final en formato YYYY-MM-DD.',
          },
        },
        required: ['procedure', 'resumen', 'fechaInicial', 'fechaFinal'],
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

function normalizePayload(value: unknown): AiJsonPayload | null {
  // Algunos modelos codifican el JSON dos veces y devuelven todo el objeto
  // como un string JSON. Se desenvuelve hasta dos niveles.
  let candidate = value;
  for (let level = 0; level < 2 && typeof candidate === 'string'; level++) {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const payload = candidate as Partial<AiJsonPayload>;
  if (typeof payload.message !== 'string') return null;

  return {
    message: payload.message,
    charts: Array.isArray(payload.charts) ? payload.charts.slice(0, 2) : [],
  };
}

/**
 * Recupera `message` aun cuando el modelo haya agotado sus tokens a mitad
 * del arreglo `charts` y el objeto JSON completo ya no sea parseable.
 */
function extractMessageFromTruncatedJson(text: string): string | null {
  const match = text.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
}

function extractJson(text: string): AiJsonPayload | null {
  // Intento directo
  try {
    const parsed = normalizePayload(JSON.parse(text));
    if (parsed) return parsed;
  } catch { /* no-op */ }

  // Bloque ```json ... ```
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeMatch) {
    try {
      const parsed = normalizePayload(JSON.parse(codeMatch[1]));
      if (parsed) return parsed;
    } catch { /* no-op */ }
  }

  // Mayor bloque { ... }
  const braceMatch = text.match(/\{[\s\S]+\}/);
  if (braceMatch) {
    try {
      const parsed = normalizePayload(JSON.parse(braceMatch[0]));
      if (parsed) return parsed;
    } catch { /* no-op */ }
  }

  const recoveredMessage = extractMessageFromTruncatedJson(text);
  if (recoveredMessage) return { message: recoveredMessage, charts: [] };

  return null;
}

/* ------------------------------------------------------------------ */
/* Loop agéntico principal                                             */
/* ------------------------------------------------------------------ */

const MAX_TOOL_ITERATIONS = 8;
const AI_TIMEOUT_MS = 120_000;
const MAX_TOOL_ROWS = 200;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_REPORT_MODES: Record<string, ReadonlySet<number>> = {
  a_Fill_Produccion_Diaria_lectura: new Set([1, 3]),
  a_Fill_Produccion_Diaria_lectura_dos: new Set([23, 24, 25, 27, 28, 30]),
};

async function executeToolCall(toolCall: OpenAiToolCall): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: 'Los argumentos de la herramienta no son JSON válido.' });
  }

  try {
    if (toolCall.function.name === 'query_database') {
      const query = String(args.sql ?? '').trim();
      if (!query) return JSON.stringify({ error: 'La consulta SQL está vacía.' });
      if (!isSafeQuery(query)) {
        return JSON.stringify({ error: 'Solo se permiten consultas SELECT de solo lectura.' });
      }

      const rows = await runQuery(query, []);
      return JSON.stringify({
        rows: rows.slice(0, MAX_TOOL_ROWS),
        total: rows.length,
        truncated: rows.length > MAX_TOOL_ROWS,
      });
    }

    if (toolCall.function.name === 'run_production_report') {
      const procedure = String(args.procedure ?? '');
      const resumen = Number(args.resumen);
      const fechaInicial = String(args.fechaInicial ?? '');
      const fechaFinal = String(args.fechaFinal ?? '');
      const allowedModes = ALLOWED_REPORT_MODES[procedure];

      if (!allowedModes?.has(resumen)) {
        return JSON.stringify({
          error: `Procedimiento o modo no permitido: ${procedure} @Resumen=${resumen}.`,
        });
      }
      if (
        !DATE_REGEX.test(fechaInicial) ||
        !DATE_REGEX.test(fechaFinal) ||
        fechaInicial > fechaFinal
      ) {
        return JSON.stringify({
          error: 'Las fechas deben usar YYYY-MM-DD y fechaInicial no puede superar fechaFinal.',
        });
      }

      let rows;
      let source = `dbo.${procedure}`;
      let warning: string | undefined;
      try {
        rows = await runStoredProcedure(`dbo.${procedure}`, [
          { name: 'Resumen', type: sql.Int, value: resumen },
          { name: 'Fecha_Inicial', type: sql.Date, value: fechaInicial },
          { name: 'Fecha_Final', type: sql.Date, value: fechaFinal },
        ]);
      } catch (procedureError) {
        // Este SP actualmente no compila en la BD por la referencia a
        // AV_LotesRemision.ClaseClienteTexto. Para los modos IQF que el
        // dashboard ya replica y valida, se usa la misma consulta directa
        // de reports.queries.ts como respaldo controlado.
        const canUseIqfFallback =
          procedure === 'a_Fill_Produccion_Diaria_lectura_dos' &&
          (resumen === 23 || resumen === 27);
        if (!canUseIqfFallback) throw procedureError;

        rows = await runQuery(IQF_DAILY_RATE_QUERY, [
          { name: 'Fecha_Inicial', type: sql.Date, value: fechaInicial },
          { name: 'Fecha_Final', type: sql.Date, value: fechaFinal },
        ]);
        source = 'IQF_DAILY_RATE_QUERY';
        warning =
          'Se usó la consulta IQF validada del dashboard porque el procedimiento canónico no compila actualmente por ClaseClienteTexto.';
      }
      return JSON.stringify({
        rows: rows.slice(0, MAX_TOOL_ROWS),
        total: rows.length,
        truncated: rows.length > MAX_TOOL_ROWS,
        source,
        ...(warning ? { warning } : {}),
      });
    }

    return JSON.stringify({ error: `Herramienta desconocida: ${toolCall.function.name}.` });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Error al ejecutar la herramienta.',
    });
  }
}

export async function runAiChat(messages: ConversationMessage[]): Promise<AiResponse> {
  if (!env.AI_API_KEY) {
    return { message: 'El asistente IA no está configurado (AI_API_KEY faltante).', charts: [] };
  }

  const openAiMessages: OpenAiMessage[] = [
    { role: 'system', content: buildSystemPrompt(messages) },
    ...messages.map((m): OpenAiMessage => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response: OpenAiResponse;
    try {
      const result = await axios.post<OpenAiResponse>(
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
      response = result.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        return {
          message:
            'NVIDIA tardó demasiado en responder. Intenta reducir el rango de fechas o solicitar una sola comparación.',
          charts: [],
        };
      }
      throw err;
    }

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

      // Nunca mostrar JSON crudo en la burbuja. Si parecía una respuesta
      // estructurada pero no pudo recuperarse, se devuelve un mensaje claro.
      if (/^\s*(?:```json\s*)?\{/.test(rawText)) {
        return {
          message:
            'La respuesta del asistente fue demasiado extensa y quedó incompleta. Intenta pedir un rango menor o una sola gráfica.',
          charts: [],
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
        const content = await executeToolCall(tc);
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
