# Linaje y manejo de datos del Dashboard Gerencial

Este documento explica qué datos muestra el dashboard, de dónde salen, cómo se
calculan y qué archivos debe revisar un agente antes de modificar un indicador.
Describe la implementación existente; no sustituye la validación funcional con
el reporte oficial de la planta.

## 1. Mapa rápido de la arquitectura

```text
SQL Server (PlantaEmpacadora)
        |
        | consultas T-SQL parametrizadas
        v
backend/src/services/reports.queries.ts
        |
        | normalización, filtros y agregados
        v
backend/src/services/dashboard.service.ts
        |
        | caché en memoria + JSON
        v
GET /api/dashboard/*
        |
        | Axios + React Query + localStorage
        v
frontend/src/components/*
```

Archivos principales:

| Responsabilidad | Archivo |
| --- | --- |
| Consultas SQL de los reportes fijos | `backend/src/services/reports.queries.ts` |
| Reglas, fórmulas y forma de las respuestas | `backend/src/services/dashboard.service.ts` |
| Validación de filtros y caché del servidor | `backend/src/controllers/dashboard.controller.ts` |
| Rutas HTTP | `backend/src/routes/dashboard.routes.ts` |
| Conexión a SQL Server | `backend/src/config/db.ts` |
| Tipos de respuesta del backend | `backend/src/types/dashboard.types.ts` |
| Cliente HTTP del frontend | `frontend/src/api/client.ts` |
| Funciones que llaman a la API | `frontend/src/api/dashboard.api.ts` |
| Caché y refresco del navegador | `frontend/src/hooks/useDashboardData.ts` |
| Declaración de widgets IQF | `frontend/src/config/dashboardConfig.ts` |
| Selector Total/Día/Mensual | `frontend/src/components/charts/NetProcessWidget.tsx` |
| Tarjetas de libras netas | `frontend/src/components/charts/KpiCards.tsx` |
| Tabla pivote y Grand Total | `frontend/src/components/charts/PivotTable.tsx` |
| Gráficas ApexCharts | `frontend/src/components/charts/DynamicChart.tsx` |
| Contadores en vivo | `frontend/src/components/live/IqfLiveCounters.tsx` |
| Filtros globales | `frontend/src/context/FiltersContext.tsx` y `frontend/src/components/filters/GlobalFilters.tsx` |

## 2. Fuentes SQL Server

### `dbo.AV_Produccion_Diaria_Resumen`

Fuente del reporte **Libras Congeladas Netas por Tipo de Proceso**.

Columnas usadas:

| Columna | Uso |
| --- | --- |
| `DiaProduccion2024` | Fecha de producción y filtro por rango |
| `NombreTipoProceso` | Nombre de la tarjeta o serie |
| `Turno` | Filtro Turno A/Turno B |
| `PesoLibras` | Libras que se suman |
| `VaEjecutivo` | Solo se acepta valor `1` |
| `ProcesadaPlanta` | Solo se acepta valor `1` |
| `fkTipo` | Excluye reempaque y registro fresco |

Interpretación usada por el proyecto:

| `fkTipo` | Significado |
| --- | --- |
| `0` | Recepción/producción |
| `1` | Reproceso |
| `2` | Reempaque, excluido |
| `4` | Registro fresco/FRESH TAIL, excluido |

Además de `fkTipo NOT IN (2, 4)`, el SQL excluye explícitamente
`NombreTipoProceso = 'FRESH TAIL'`.

### `dbo.AV_Produccion_Diaria_2020`

Fuente de los contadores IQF y los rendimientos diarios/mensuales.

Columnas usadas:

| Columna | Uso |
| --- | --- |
| `DiaProduccion2024` | Día de producción |
| `CategoriaLinea` | Nombre directo de la línea IQF |
| `EquipoIQF` | Relación con `EquiposIQF` |
| `PesoLibras` | Libras por caja/registro |
| `FechaHoraTorre` | Primera/última caja y duración del grupo |
| `Turno` | Filtro de turno |
| `fkTipo` | Solo registros con `fkTipo < 4` |
| `EstiloFinal` | Dimensión del grupo de rendimiento |
| `NombreEjecutivo` | Dimensión del grupo de rendimiento |
| `NombreGrupo` | Dimensión del grupo de rendimiento |

### `dbo.EquiposIQF`

Convierte el identificador `AV_Produccion_Diaria_2020.EquipoIQF` en el nombre
visible `EquiposIQF.NombreIQF`.

Columnas usadas:

| Columna | Uso |
| --- | --- |
| `IDequipo` | Clave de unión |
| `NombreIQF` | Nombre de línea para registros asignados por equipo |

### `dbo.AV_Produccion_Diaria`

Esta vista **no alimenta los widgets fijos**. Es la fuente principal permitida
en el prompt del Asistente IA para consultas dinámicas.

El asistente conoce actualmente estas columnas:

`FechaProduccion`, `EstiloFinal`, `PesoLibras`, `fkTipo`, `TipoOP`, `Item`,
`OrdenProduccion`, `NoRemision` y `Empresa`.

La definición y ejemplos disponibles para el modelo están en
`backend/src/services/ai.service.ts`. Si cambia el esquema real de la vista,
también debe actualizarse ese prompt.

## 3. Matriz de widgets y endpoints

| Sección visible | Endpoint | Fuente SQL | Ventana de datos |
| --- | --- | --- | --- |
| Producción IQF en Tiempo Real | `/api/dashboard/iqf-tiempo-real` | `AV_Produccion_Diaria_2020` + `EquiposIQF` | Último día de producción IQF no posterior a hoy |
| Libras netas, vista Total | `/api/dashboard/libras-netas-proceso` | `AV_Produccion_Diaria_Resumen` | Rango global; por defecto últimos 30 días |
| Libras netas, vista Día | `/api/dashboard/libras-netas-proceso-dia` | `AV_Produccion_Diaria_Resumen` | Rango global |
| Libras netas, vista Mensual | `/api/dashboard/libras-netas-proceso-mes` | `AV_Produccion_Diaria_Resumen` | Últimos 12 meses calendario; ignora las fechas globales |
| Rendimientos IQF x Hora — Diario | `/api/dashboard/iqf-libras-hora-dia` | `AV_Produccion_Diaria_2020` + `EquiposIQF` | Rango global |
| Rendimientos IQF x Hora — Mensual | `/api/dashboard/iqf-libras-hora-mes` | `AV_Produccion_Diaria_2020` + `EquiposIQF` | Últimos 12 meses calendario; ignora las fechas globales |
| Asistente IA | `POST /api/ai/chat` | Principalmente `AV_Produccion_Diaria`; otras vistas permitidas por el prompt | La que solicite el usuario/modelo |

Los endpoints mensuales aceptan `meses`, limitado en el backend entre 1 y 36.
El frontend actual no envía ese parámetro, por lo que usa 12.

## 4. Producción IQF en Tiempo Real

### Selección del día

`IQF_LIVE_DAY_QUERY` busca:

```sql
MAX(DiaProduccion2024)
WHERE fkTipo < 4
  AND CategoriaLinea LIKE '%IQF%'
  AND DiaProduccion2024 <= CAST(GETDATE() AS DATE)
```

No se asume el día calendario actual porque una jornada de planta puede cruzar
medianoche o la base puede no tener producción hoy.

### Catálogo de tarjetas

`IQF_LIVE_LINES_QUERY` obtiene nombres IQF con actividad en los últimos 60 días.
El servicio combina ese catálogo con las líneas que sí tienen datos en el día
seleccionado. Por eso una línea conocida puede mostrarse en cero.

### Acumulados por línea

`IQF_LIVE_QUERY` construye un universo con `UNION ALL`:

1. Registros cuyo `CategoriaLinea LIKE '%IQF%'`; el nombre es
   `CategoriaLinea`.
2. Registros con `EquipoIQF > 0`; el nombre se obtiene de
   `EquiposIQF.NombreIQF`.

Después agrupa por nombre de línea.

| Campo de API | Cálculo |
| --- | --- |
| `cajas` | `COUNT(*)` |
| `libras` | `SUM(PesoLibras)` |
| `librasUltimaHora` | Suma cuando `FechaHoraTorre >= GETDATE() - 60 minutos` |
| `primeraCaja` | Hora de `MIN(FechaHoraTorre)`, formato `HH:MM` |
| `ultimaCaja` | Hora de `MAX(FechaHoraTorre)`, formato `HH:MM` |
| `minutosTrabajados` | Diferencia entre primera y última caja |
| `minutosDesdeUltima` | Diferencia entre última caja y `GETDATE()` |
| `librasPorHora` | `libras / (minutosTrabajados / 60)`, solo si hay al menos 10 minutos |
| `activa` | `minutosDesdeUltima <= 15` |

La interfaz actual muestra únicamente `linea`, `libras` y el estado:

- `ACTIVA` si `activa = true`.
- `SIN DATOS` si `cajas = 0`.
- Tiempo desde la última caja en los demás casos.

Los campos restantes ya están disponibles en la API para futuras mejoras.

### Filtro de turno

El frontend envía `A`, `B` o nada. El servicio convierte `A` en `Turno A` y
`B` en `Turno B` antes de ejecutar el SQL. Sin filtro envía `NULL`.

## 5. Libras Congeladas Netas por Tipo de Proceso

### Filtros SQL comunes

```sql
CAST(DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final
AND VaEjecutivo = 1
AND ProcesadaPlanta = 1
AND fkTipo NOT IN (2, 4)
AND NombreTipoProceso <> 'FRESH TAIL'
```

El filtro de turno se aplica posteriormente en TypeScript con una comparación
que considera equivalentes `A` y `Turno A`.

### Vista Total: tarjetas

El SQL agrupa por `NombreTipoProceso` y `Turno`. El servicio:

1. Filtra el turno.
2. Acumula libras por proceso.
3. Calcula el total de todos los procesos incluidos.
4. Calcula `porcentaje = librasProceso / total * 100`.
5. Redondea libras y porcentaje a dos decimales.
6. Ordena de mayor a menor cantidad de libras.

Respuesta:

```json
[
  {
    "proceso": "IQF PEELED",
    "libras": 673481.25,
    "porcentaje": 76.2
  }
]
```

`KpiCards.tsx` formatea las libras sin decimales visibles y el porcentaje con
un decimal. El color depende de la posición del proceso después de ordenar, no
de una asociación permanente proceso-color.

### Vista Día

Usa los mismos filtros, pero el SQL incluye el día. El servicio devuelve una
fila por `periodo + proceso`:

```json
{
  "periodo": "2026-07-23",
  "proceso": "IQF PEELED",
  "libras": 12345.67
}
```

El frontend pivotea `proceso` como serie y `periodo` como eje X.

### Vista Mensual

No usa `fechaInicial` ni `fechaFinal` del filtro global. Calcula:

- Fin: fecha local actual del backend.
- Inicio: primer día del mes de hace 11 meses.
- Agrupación: primeros siete caracteres del día, `YYYY-MM`.

Sí respeta el turno.

## 6. Rendimientos IQF x Hora

### Unidad básica: grupo de rendimiento

`IQF_DAILY_RATE_QUERY` produce grupos con estas dimensiones:

- Línea.
- Estilo final.
- Ejecutivo.
- Grupo.
- Turno.
- Día.

Hay dos ramas unidas con `UNION ALL`:

1. Línea tomada de `CategoriaLinea`, limitada a categorías que contienen IQF.
2. Línea tomada de `EquiposIQF.NombreIQF`, limitada a `EquipoIQF > 0`.

Cada grupo calcula:

```text
TotalLibras = SUM(PesoLibras)
TiempoHorasDecimales =
  DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) / 60
RendimientoGrupo = TotalLibras / TiempoHorasDecimales
```

Se descartan grupos con 15 minutos o menos:

```sql
HAVING DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) > 15
```

### Celda período × línea

Una celda no usa `SUM(libras) / SUM(horas)`. Replica el reporte oficial
promediando de forma simple los rendimientos de sus grupos:

```text
librasPorHoraCelda =
  SUM(RendimientoGrupo) / cantidadDeGrupos
```

La API conserva también:

- `libras`: suma de libras de los grupos de la celda.
- `horas`: suma de horas de los grupos.
- `grupos`: cantidad de grupos.
- `librasPorHora`: promedio simple anterior.

Todos los campos decimales se redondean a dos posiciones.

### Reporte diario

`periodo = DiaProduccion2024` en formato `YYYY-MM-DD`. Respeta el rango global
y el turno.

### Reporte mensual

Consulta desde el primer día de hace 11 meses hasta la fecha local actual del
backend y usa `periodo = YYYY-MM`. Ignora las fechas globales y sí respeta el
turno.

En el widget mensual el frontend excluye cualquier nombre de serie que
contenga `SAL`. Esta exclusión es solo visual, definida mediante
`excludedSeriesValues: ['SAL']` en `dashboardConfig.ts`; el backend sí devuelve
esas filas.

### Grand Total de la tabla pivote

Cada celda ya representa un promedio de grupos. Para recuperar el promedio
simple de todos los grupos al totalizar, `PivotTable.tsx` pondera cada celda
por `grupos`:

```text
Grand Total =
  SUM(librasPorHoraCelda * gruposCelda) / SUM(gruposCelda)
```

Esta fórmula se usa para totales de fila, columna y tabla completa.

Las vistas de gráfica muestran directamente `librasPorHora` por celda; no
dibujan los Grand Total.

## 7. Filtros y fechas

Valores iniciales del frontend:

```text
fechaInicial = hoy - 30 días
fechaFinal   = hoy
turno        = todos
```

El navegador usa `dayjs()` y, por tanto, su fecha local. Si un cliente llama
directamente a la API sin fechas, el backend genera sus propios últimos 30
días y serializa las fechas con UTC mediante `toISOString().slice(0, 10)`.

El controlador valida:

- Formato estricto `YYYY-MM-DD`.
- `fechaInicial <= fechaFinal`.

Las fechas se envían a SQL Server como parámetros `sql.Date`; no se concatenan
en el SQL.

## 8. Normalización de datos

`backend/src/utils/rows.ts` normaliza nombres de columnas ignorando:

- Mayúsculas/minúsculas.
- Espacios.
- Guiones bajos y otros caracteres no alfanuméricos.
- Tildes.

`pickNumber` convierte números y devuelve `0` si el dato falta o no es válido.
`pickString` recorta texto y convierte objetos `Date` a `YYYY-MM-DD`.

Esta tolerancia evita fallos por diferencias de alias, pero también puede
ocultar una columna ausente convirtiéndola silenciosamente a `0` o cadena
vacía. Al cambiar SQL, se debe validar la respuesta real del endpoint.

## 9. Caché, actualización y datos potencialmente antiguos

Existen dos capas de caché.

### Backend

| Tipo | TTL |
| --- | --- |
| Reportes normales | 5 minutos |
| Contadores IQF en vivo | 30 minutos |

La caché está en memoria del proceso Node. Reiniciar el backend la vacía.
También comparte la promesa de una consulta en curso para evitar consultas
duplicadas simultáneas.

Claves relevantes:

- Reportes diarios/totales: incluyen endpoint y todos los filtros.
- Reportes mensuales: incluyen endpoint, turno y cantidad de meses; no incluyen
  fechas porque esas fechas se ignoran.
- En vivo: incluye solamente el turno.

### Frontend

React Query y `localStorage` mantienen:

| Tipo | Vigencia/refresco |
| --- | --- |
| Reportes normales | 5 minutos |
| Contadores IQF en vivo | 30 minutos, incluso en segundo plano |

Prefijo de almacenamiento: `dashboard-cache:v1`.

La hora que se muestra junto a “EN VIVO” usa `dataUpdatedAt` de React Query, no
el campo `actualizado` enviado por la API. Representa cuándo el navegador
aceptó el dato, que puede provenir de caché.

## 10. Asistente IA y consultas dinámicas

El asistente es independiente de los endpoints fijos:

```text
Panel React
  -> POST /api/ai/chat
  -> NVIDIA Chat Completions
  -> tool query_database
  -> runQuery(sql, [])
  -> respuesta y gráficas dinámicas
```

Reglas actuales:

- Proveedor predeterminado: NVIDIA API compatible con OpenAI.
- Herramienta disponible: `query_database`.
- Solo acepta una sentencia que comience con `SELECT`.
- Bloquea palabras de escritura, DDL, ejecución y acceso externo.
- Limita los resultados entregados al modelo a las primeras 500 filas.
- Máximo ocho iteraciones de herramientas.
- El login SQL debe ser de solo lectura; el filtro de texto no reemplaza los
  permisos de SQL Server.

El script recomendado para crear ese login es
`backend/sql/create_readonly_user.sql`.

El contexto del modelo se carga desde
`docs/Documentacion_Completa_BD_STB.md` y se conserva en memoria durante la
vida del proceso backend. La ruta puede sustituirse mediante
`AI_CONTEXT_PATH`.

Además de `query_database`, el agente dispone de `run_production_report`, una
herramienta restringida a los procedimientos de lectura y modos permitidos.
Como `a_Fill_Produccion_Diaria_lectura_dos` actualmente no compila por la
referencia a `ClaseClienteTexto`, los modos IQF 23 y 27 usan automáticamente
`IQF_DAILY_RATE_QUERY` como respaldo controlado.

## 11. Autenticación y errores

Los endpoints `/api/dashboard/*` y `/api/ai/*` pasan por `apiKeyAuth`.

- En producción `API_KEY` es obligatoria.
- El frontend envía `X-API-Key` si `VITE_API_KEY` fue incorporada en el build.
- La clave del modelo NVIDIA (`NVIDIA_API_KEY`/compatibilidad `AI_API_KEY`) vive
  solo en el backend y nunca debe enviarse al navegador.

En producción, un error interno se responde como `Error interno del servidor`;
el detalle SQL queda únicamente en los logs del backend. Un HTTP 500 en todos
los widgets suele indicar conexión/configuración compartida, mientras un 500
aislado suele apuntar a la consulta o transformación de ese endpoint.

## 12. Riesgos y verificaciones antes de cambiar fórmulas

### Posible solapamiento en los `UNION ALL` IQF

Las consultas en vivo y de rendimiento unen:

- Registros con `CategoriaLinea LIKE '%IQF%'`.
- Registros con `EquipoIQF > 0`.

No hay una condición explícita que haga ambos conjuntos mutuamente
excluyentes. Si un mismo registro cumple ambas condiciones, `UNION ALL` puede
contarlo dos veces. Los comentarios del código sugieren que la segunda rama
representa salmueras asignadas a equipo, pero esa separación debe comprobarse
con datos reales antes de “corregirla”.

Consulta de diagnóstico sugerida:

```sql
SELECT COUNT(*) AS PosibleSolapamiento
FROM dbo.AV_Produccion_Diaria_2020
WHERE CategoriaLinea LIKE '%IQF%'
  AND EquipoIQF > 0
  AND fkTipo < 4
  AND DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final;
```

### “Tiempo real” usa el último día disponible

Si no hay producción hoy, las tarjetas muestran el último día IQF anterior.
El estado probablemente aparecerá inactivo por el gran
`minutosDesdeUltima`. No cambiar a `GETDATE()` sin confirmar cómo se manejan
jornadas que cruzan medianoche.

### El modelo de color no es estable por proceso

En las tarjetas, el color se asigna por posición después de ordenar. Si cambia
el ranking, un proceso puede cambiar de color.

### Diferencias de zona horaria

- Las horas de primera/última caja se formatean en SQL para mantener la hora
  local del servidor de base.
- Las ventanas mensuales se calculan con la zona horaria del proceso backend.
- Los filtros iniciales se calculan con la zona del navegador.

## 13. Procedimiento para agregar un nuevo dato o widget

1. Confirmar con negocio la fuente, unidad, inclusiones, exclusiones, fecha y
   fórmula de totalización.
2. Agregar una consulta parametrizada en `reports.queries.ts`.
3. Agregar la transformación y un tipo de respuesta en
   `dashboard.service.ts` y `dashboard.types.ts`.
4. Crear controlador y ruta en `dashboard.controller.ts` y
   `dashboard.routes.ts`.
5. Definir una clave de caché que incluya únicamente los filtros que sí
   afectan el resultado.
6. Agregar el endpoint al tipo `DashboardEndpoint` del frontend.
7. Agregar el método de API si el patrón genérico no es suficiente.
8. Declarar el widget en `dashboardConfig.ts` o crear un componente específico.
9. Verificar:
   - SQL directo con un rango pequeño.
   - JSON del endpoint.
   - Totales contra el reporte oficial.
   - Turno A, Turno B y todos.
   - Sin datos.
   - Vista móvil y escritorio.
   - Build de backend y frontend.
10. Si el Asistente IA debe conocer el dato, actualizar también el esquema y
    ejemplos del `SYSTEM_PROMPT` en `ai.service.ts`, además de los permisos del
    usuario SQL de solo lectura.

## 14. Contratos JSON de referencia

### Libras netas total

```ts
{
  proceso: string;
  libras: number;
  porcentaje: number;
}
```

### Libras netas por período

```ts
{
  periodo: string; // YYYY-MM-DD o YYYY-MM
  proceso: string;
  libras: number;
}
```

### Rendimiento IQF

```ts
{
  periodo: string; // YYYY-MM-DD o YYYY-MM
  linea: string;
  libras: number;
  horas: number;
  grupos: number;
  librasPorHora: number;
}
```

### Contador IQF

```ts
{
  dia: string;
  actualizado: string;
  lineas: Array<{
    linea: string;
    libras: number;
    cajas: number;
    librasUltimaHora: number;
    librasPorHora: number;
    primeraCaja: string;
    ultimaCaja: string;
    minutosDesdeUltima: number;
    activa: boolean;
  }>;
}
```
