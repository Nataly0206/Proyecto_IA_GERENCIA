# Dashboard Gerencial · Producción Camaronera

Dashboard ejecutivo para una planta empacadora de camarón, con actualización
automática cada 5 minutos. Muestra exactamente 3 reportes:

1. **Libras congeladas netas por tipo de proceso** (gráfico de barras +
   Resumen Ejecutivo) — excluye FRESH TAIL (compra de materia prima) y reempaque.
2. **Rendimientos IQF x Hora — diario** (tabla pivote: fechas × líneas IQF,
   rango de fechas filtrable).
3. **Rendimientos IQF x Hora — mensual** (tabla pivote, últimos 12 meses).

Las tablas IQF replican el reporte oficial "RENDIMIENTOS IQF X HORA" de la
planta: cada celda es el **promedio simple** de los rendimientos
(libras/hora) por grupo línea/estilo/ejecutivo/turno, y los Grand Total son
el promedio sobre todos los grupos de la fila/columna (fórmula verificada
contra los números del reporte original).

## Arquitectura

```
Dashboard Gerencial/
├── backend/                  # API Node.js + Express + TypeScript + mssql
│   └── src/
│       ├── config/           # Variables de entorno y pool de SQL Server
│       ├── controllers/      # Parseo de filtros y respuestas HTTP
│       ├── middleware/       # Manejo de errores
│       ├── routes/           # /api/dashboard/*
│       ├── services/         # Ejecución de SPs y mapeo de resultados
│       ├── types/            # Tipado compartido
│       └── utils/            # Normalización de columnas de los SPs
├── frontend/                 # React + Vite + TypeScript + MUI + ApexCharts
│   └── src/
│       ├── api/              # Cliente Axios
│       ├── components/
│       │   ├── ai/           # Panel "Asistente IA" (Fase 2)
│       │   ├── charts/       # DynamicChart (motor JSON) + ChartWidget
│       │   ├── filters/      # Filtros globales
│       │   ├── insights/     # Resumen Ejecutivo automático
│       │   └── layout/       # AppBar + contenedor
│       ├── config/           # dashboardConfig.ts (widgets declarados en JSON)
│       ├── context/          # FiltersContext (filtros globales)
│       ├── hooks/            # React Query (refresco cada 5 min)
│       ├── pages/            # DashboardPage
│       ├── types/            # ChartConfig y respuestas de API
│       └── utils/            # Formato de valores e insights
├── docker-compose.yml
└── README.md
```

## Endpoints de la API

La trazabilidad completa de cada indicador —fuente SQL, columnas, fórmulas,
filtros, cachés y contratos JSON— está en
[`docs/DATA_LINEAGE.md`](docs/DATA_LINEAGE.md).

Todos aceptan `fechaInicial`, `fechaFinal` (YYYY-MM-DD) y `turno` como query
params. Por defecto se consultan los últimos 30 días.

| Endpoint                                   | Fuente de datos                                             |
| ------------------------------------------ | ----------------------------------------------------------- |
| `GET /api/dashboard/libras-netas-proceso`  | `AV_Produccion_Diaria_Resumen` (sin fkTipo 2 ni 4)          |
| `GET /api/dashboard/iqf-libras-hora-dia`   | `AV_Produccion_Diaria_2020` + `EquiposIQF`                  |
| `GET /api/dashboard/iqf-libras-hora-mes`   | Igual que el diario, ventana de 12 meses (param `meses`)    |

Notas:

- Las consultas (`backend/src/services/reports.queries.ts`) se ejecutan como
  SQL directo sobre las tablas fuente, replicando la lógica de los SPs de
  lectura. No se usan los SPs porque `a_Fill_Produccion_Diaria_lectura_dos`
  no compila en la base (referencia la columna inexistente
  `AV_LotesRemision.ClaseClienteTexto`).
- `fkTipo` en `AV_Produccion_Diaria_Resumen`: 0 = RECEPCION (producción),
  1 = REPROCESO, 2 = RE-EMPAQUE (excluido), 4 = REGISTRO FRESCO / FRESH TAIL
  (excluido por ser compra de materia prima).
- El reporte IQF descarta grupos con 15 minutos o menos de trabajo, igual que
  el SP original (@Resumen=23).
- El filtro `turno` se aplica en la capa de servicio; en la base el valor es
  "Turno A" / "Turno B" y el API acepta ambas formas ("A" o "Turno A").

## Requisitos

- Node.js 20+
- Acceso a la base SQL Server con las tablas `AV_Produccion_Diaria_Resumen`,
  `AV_Produccion_Diaria_2020` y `EquiposIQF`
- Docker (opcional, para despliegue)

## Instalación (desarrollo)

### 1. Backend

```bash
cd backend
cp .env.example .env      # editar credenciales de SQL Server
npm install
npm run dev               # http://localhost:3002
```

Verificar: `curl http://localhost:3002/api/health`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

El dev server de Vite hace proxy de `/api` hacia `http://localhost:3002`.

## Despliegue con Docker

```bash
cp .env.example .env      # credenciales de SQL Server para docker-compose
docker compose up -d --build
```

- Frontend: http://localhost:8080 (nginx hace proxy de `/api` al backend)
- Backend: http://localhost:3002

Si SQL Server corre en la máquina anfitriona, `DB_SERVER=host.docker.internal`
(valor por defecto) funciona en Docker Desktop para Mac/Windows.

## Variables de entorno

### Backend (`backend/.env`)

| Variable                      | Descripción                          | Default     |
| ----------------------------- | ------------------------------------ | ----------- |
| `PORT`                        | Puerto de la API                     | `3002`      |
| `CORS_ORIGIN`                 | Orígenes permitidos (coma-separados) | `*`         |
| `DB_SERVER`                   | Host de SQL Server                   | `localhost` |
| `DB_PORT`                     | Puerto de SQL Server                 | `1433`      |
| `DB_DATABASE`                 | Base de datos                        | —           |
| `DB_USER` / `DB_PASSWORD`     | Credenciales SQL                     | —           |
| `DB_ENCRYPT`                  | Conexión cifrada                     | `false`     |
| `DB_TRUST_SERVER_CERTIFICATE` | Confiar en certificado               | `true`      |
| `NVIDIA_API_KEY`              | Clave del API Catalog de NVIDIA      | —           |
| `AI_BASE_URL`                 | URL base compatible con OpenAI       | `https://integrate.api.nvidia.com/v1` |
| `AI_MODEL`                    | Modelo NVIDIA usado por el asistente | `nvidia/llama-3.3-nemotron-super-49b-v1.5` |
| `AI_CONTEXT_PATH`             | Ruta del contexto Markdown de la BD  | Detección automática en desarrollo |

### Frontend (`frontend/.env`)

| Variable       | Descripción         | Default |
| -------------- | ------------------- | ------- |
| `VITE_API_URL` | URL base de la API  | `/api`  |

## Diseño para la Fase 2 (Asistente IA)

Ningún gráfico está hardcodeado. Todo el dashboard se declara en
[frontend/src/config/dashboardConfig.ts](frontend/src/config/dashboardConfig.ts)
como un arreglo de objetos `ChartConfig` (JSON serializable) que el componente
`DynamicChart` sabe renderizar:

```json
{
  "id": "libras-netas-proceso",
  "type": "bar",
  "title": "Libras Congeladas Netas por Tipo de Proceso",
  "endpoint": "libras-netas-proceso",
  "xField": "proceso",
  "yField": "libras",
  "sort": { "field": "libras", "direction": "desc" },
  "valueFormat": "number"
}
```

`ChartConfig` soporta: `bar`, `column`, `line`, `area`, `donut`, `pie`,
múltiples series (`yField: string[]`), orden, formato de valores, colores,
alto y tamaño en la grilla (`gridSpan`).

En la Fase 2, el agente de IA recibirá un comando en lenguaje natural
("Compara Turno A contra Turno B"), generará un `ChartConfig` y el frontend lo
renderizará con el mismo motor — sin cambios de código. El panel lateral
"Asistente IA" ya está integrado en la barra superior como punto de entrada.
