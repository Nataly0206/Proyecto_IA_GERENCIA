import { Fragment } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DataObjectIcon from '@mui/icons-material/DataObject';
import type { DashboardView } from './DashboardLayout';

/**
 * "Detalles Desarrollador": documentación a nivel de código de cada
 * página del dashboard (tablas / vistas / procedimientos de origen,
 * filtros y parámetros, fórmulas y cálculos, endpoints y archivos
 * clave). Solo se muestra a usuarios con el permiso
 * `detalles_desarrollador` (los administradores lo tienen implícito).
 *
 * El contenido está redactado a mano a partir del backend real; si una
 * consulta cambia en `backend/src/services/*.queries.ts` /
 * `*.service.ts`, actualizar también la entrada correspondiente aquí.
 */

type DevBlock = {
  heading: string;
  body?: string;
  /** Cada línea admite segmentos entre backticks que se renderizan como código. */
  bullets?: string[];
  /** Bloque de código / SQL mostrado en monoespaciado con scroll horizontal. */
  code?: string;
};

type PageDevDetails = {
  title: string;
  summary: string;
  blocks: DevBlock[];
};

const ARQUITECTURA_COMUN: DevBlock = {
  heading: 'Arquitectura común',
  bullets: [
    'El dashboard lee dos bases SQL Server en la misma instancia: `PlantaEmpacadora` (IQF, Pelado en vivo, Exportaciones, Compra MP, Inventario) y `STB_data` (Recepción, Descabezado, Clasificado, Pelado histórico). Usuarios usa la base de autenticación del dashboard.',
    'Ejecución de consultas: `backend/src/services/sql.service.ts` (`runQuery`, pool `config/db` → PlantaEmpacadora) y `backend/src/services/stb.service.ts` (`runStbQuery`, pool `config/stbDb` → STB_data).',
    'El SQL agrega a la granularidad mínima; la consolidación por período (día / mes) y el filtrado por turno se hacen en TypeScript (`backend/src/utils/rows.ts` → `matchesTurno`, y los `aggregate*` de cada service).',
    'Parámetros de rango: query params `fechaInicial`, `fechaFinal`, `turno`. Las vistas mensuales usan una ventana de 12 meses calendario e ignoran el filtro de días (el turno sí se respeta).',
    'Los contadores "de hoy" / "en vivo" usan `CAST(GETDATE() AS date)` en SQL y no responden al filtro de fechas del dashboard.',
    'Todas las rutas están protegidas por `requirePermission(...)` en `backend/src/middleware/sessionAuth.ts`.',
  ],
};

const PAGE_DEV_DETAILS: Record<DashboardView, PageDevDetails> = {
  recepcion: {
    title: 'Recepción',
    summary: 'Camarón recibido desde fincas y saldo pendiente de pasar a proceso. Fuente: STB_data.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Contadores de recepción: `dbo.R_REMISIONES_PLANTA` (cabecera) + `dbo.R_REMISIONES_PLANTA_DETALLE` (bins; columnas `LIBRAS`, `PROCESADO`).',
          '`dbo.R_PesadoRecepcion.LibrasNetas` dejó de poblarse en 2026-03; por eso las libras se suman desde el detalle de bins, no de esa tabla.',
          '"Remisiones Recibidas — Detalle": vista `dbo.RemisionesPlantaPBI` (la misma que alimenta el tablero de Power BI). Trae `LibrasRemision`, `LibrasBasura`, `LibrasCola` / `LibrasCabeza` (vía `VPesadoColaPBI` / `VPesadoCabezaPBI`), `Nombre`, `CodigoFinca`, `Laguna` e `IdRemisionPlanta`. La vista filtra internamente `FechaRemision > 2025-01-01`.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contadores: `rp.ANULADA = 0 AND rp.RECHAZADA = 0`. Libras recibidas hoy: `rp.FECHA_REMISION = @Dia`; semana: lunes a hoy; mes: primer día del mes a hoy.',
          'Libras pendientes de procesar: `rp.CERRADA = 0 AND ISNULL(d.PROCESADO, 0) = 0` — es un saldo global, sin filtro de fecha.',
          'Remisiones recibidas — detalle: `RemisionesPlantaPBI.FechaRemision BETWEEN @Fecha_Inicial AND @Fecha_Final`, agrupado por (fecha, remisión, cliente, código de finca, laguna).',
          'Recepción no maneja turno.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Los contadores se rotulan “Libras recibidas HOSO”. Libras recibidas = `SUM(R_REMISIONES_PLANTA_DETALLE.LIBRAS)` de bins no anulados / no rechazados.',
          'Detalle de remisiones: `LibrasRemision` se suma (la vista abre la fila por el indicador `Procesado`); `LibrasCola`, `LibrasCabeza` y `LibrasBasura` se toman con `MAX` porque son constantes por remisión-laguna.',
          'Total cola + cabeza = `LibrasCola + LibrasCabeza`. Rendimiento finca = `LibrasCola / LibrasRemision`. Rendimiento planta = `LibrasCola / (LibrasCola + LibrasCabeza)`. Se calculan en `procesos.service.ts` y se expresan en porcentaje (0–100).',
          'Fila de Total en la tabla: suma de libras y rendimientos ponderados (Σcola ÷ Σremisión y Σcola ÷ Σ(cola+cabeza)), calculada en `WidgetDataTable`.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/recepcion-resumen` · `/recepcion-remisiones`',
          'Permiso backend: `requirePermission(\'recepcion\')`.',
          'Archivos: `backend/src/services/procesos.queries.ts` (`RECEPCION_RESUMEN_QUERY`, `RECEPCION_REMISIONES_QUERY`), `procesos.service.ts`, `procesos.controller.ts`, `routes/dashboard.routes.ts`; front `frontend/src/pages/RecepcionPage.tsx`, `components/charts/WidgetDataTable.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  descabezado: {
    title: 'Descabezado',
    summary: 'Volumen descabezado por día, dotación y costo a destajo. Fuente: STB_data.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          '`dbo.DES_ASIG_LBRS_EMPLEADOS` + `_DET` — personas, horas y libras de cabezas asignadas.',
          'Personas: `dbo.DES_EMPLEADOS_LINEAS` (`ID_EMPLEADO_LINEA` → `ID_EMPLEADO`).',
          '`dbo.Des_PesadoColaHeader` + `dbo.Des_PesadoCola` — libras netas de cola por fecha.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Resumen: libras de hoy, lunes a hoy y primer día del mes a hoy; solo detalle no anulado. La tarjeta de libras promedio por hora usa exclusivamente el día actual.',
          'Por día: rango de fechas del filtro. Mensual: últimos 12 meses.',
          'Descabezado ya no filtra por turno.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras descabezadas al día = `SUM(DES_ASIG_LBRS_EMPLEADOS_DET.LIBRAS)` no anulado del día.',
          'Personas descabezando por día = `COUNT(DISTINCT el.ID_EMPLEADO)` del día; no se suma entre filas.',
          'Cola + cabezas = total entero procesado. Libras por hora = libras de cabezas ÷ horas efectivas entre el primer y último registro diario.',
          'En `descabezado-resumen`, `librasPromedioPorHora` aplica esa misma fórmula a hoy: `cabezas asignadas ÷ horas efectivas`; devuelve 0 cuando no existe una jornada válida.',
          'Personas = `COUNT(DISTINCT ID_EMPLEADO)`; en mensual cada empleado se cuenta una sola vez por mes.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/descabezado-resumen` · `/descabezado-por-dia` · `/descabezado-por-dia-mes`',
          'Permiso backend: `requirePermission(\'descabezado\')`.',
          'Archivos: `procesos.queries.ts` (`DESCABEZADO_RESUMEN_QUERY`, `DESCABEZADO_POR_DIA_QUERY`, `DESCABEZADO_POR_MES_QUERY`), `procesos.service.ts`; front `frontend/src/pages/DescabezadoPage.tsx`, `components/charts/WidgetDataTable.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  clasificado: {
    title: 'Clasificado',
    summary: 'Producto clasificado por talla y mesa, e inventario clasificado disponible. Fuente: STB_data.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          '`dbo.CL_LLENADO_RECIPIENTES` (cabecera, `FECHA`, `ID_TANQUE`) + `dbo.CL_LLENADO_RECIPIENTES_D` (`LIBRAS_NETA`, `ANULADO`, `IdTurno`, `ID_TALLA`).',
          'Talla: `dbo.DCP_TALLAS` (`ID_TALLA` → `NOMBRE_TALLA` en el detalle; `IdTallaFinal` → `NOMBRE_TALLA` en el inventario).',
          '"Máquina" = `CL_LLENADO_RECIPIENTES.ID_TANQUE` → `dbo.CL_TANQUES.ID_TANQUE`; los ID sin correspondencia (incluido 0) aparecen como “Sin máquina asignada”.',
          'Inventario clasificado: `dbo.CL_InventarioClasificado` (`LibrasNetas`, `IdTallaFinal`, `FincaPBI`, `Fecha`) con `EnInventario = 1 AND Transferido = 0 AND Procesado = 0`. `Destino` no se usa: está NULL en el 100% de la tabla.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Resumen: libras de `h.FECHA = @Hoy`, de la semana en curso (`@Lunes`–`@Domingo`, sin depender de `@@DATEFIRST`) y del mes en curso (`@PrimerDiaMes`–`@Hoy`); siempre `d.ANULADO = 0`. La tarjeta por hora usa el día actual.',
          'Inventario: saldo actual (`EnInventario = 1 AND Transferido = 0 AND Procesado = 0`); se agrupa por `IdTallaFinal` → `DCP_TALLAS` y por `FincaPBI`.',
          'Detalle por máquina: `h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0`, agrupado por fecha, turno, tanque y talla. Turno filtrado en TypeScript. Vista mensual = 12 meses.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras clasificadas = `SUM(CL_LLENADO_RECIPIENTES_D.LIBRAS_NETA)` no anulado.',
          'Libras clasificadas por hora = libras netas no anuladas de hoy ÷ horas entre `MIN(HORA_INICIO)` y `MAX(HORA_FINAL)` de hoy. Si el intervalo es cero o no existe, el resumen devuelve 0.',
          'Inventario: `bins = COUNT(*)`, `libras = SUM(CL_InventarioClasificado.LibrasNetas)` por talla, con columna de Total. El endpoint también calcula finca predominante y días represado (`hoy − MIN(Fecha)` del bin más antiguo), aunque la tabla actual solo muestra Talla × Bins/Libras.',
          'Las libras sin tanque válido se agrupan como “Sin máquina asignada” y se incluyen en el total.',
          'Interfaz: `Libras Clasificadas por Talla` se carga como tabla Talla/Libras/Total en un diálogo al pulsar `Ver por talla` en la esquina superior derecha de `Libras Clasificadas por Máquina`; conserva el rango y turno activos.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/clasificado-resumen` · `/clasificado-inventario` · `/clasificado-inventario-detalle`',
          '`/clasificado-por-maquina` · `/clasificado-por-talla` (`-dia` / `-mes`)',
          'Permiso backend: `requirePermission(\'clasificado\')`.',
          'Archivos: `procesos.queries.ts` (`CLASIFICADO_RESUMEN_QUERY`, `CLASIFICADO_INVENTARIO_QUERY`, `CLASIFICADO_INVENTARIO_DETALLE_QUERY`, `CLASIFICADO_DETALLE_QUERY`), `procesos.service.ts`; front `frontend/src/pages/ClasificadoPage.tsx`, `InventarioTallaTable.tsx`, `ClasificadoInventarioDetalleDialog.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  pelado: {
    title: 'Pelado',
    summary: 'Volumen pelado por sala, estilo, talla y personal. Fuente: STB_data (varias tablas) + AV_Produccion (vivo).',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Por estilo y talla: `dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET` (`LIBRAS`); estilo vía `PES_ASIGNACION_RECIPIENTES_LINEAS` → `PES_ESTILOS`, talla vía `DCP_TALLAS`. Ambos usan exactamente el mismo detalle base para que sus totales concilien.',
          'Personal (headcount) y pago: vista `dbo.V_PagosxPeladoIndividualPBI` (`IdEmpleado`, `libras`, `Valor`, `Fecha`, `Turno`).',
          'Por sala (hoy): el mismo detalle base de la card por estilo, resuelto mediante `DCP_LINEAS.ID_SALA`. Los registros sin catálogo de sala se conservan como “Sin sala” para no perder libras.',
          '"Personas activas" por sala = `COUNT(DISTINCT ID_EMPLEADO)` con registro de pelado hoy. "Libras últimos 30 min" mantiene su ventana en vivo.',
          '"Libras hoy" por sala = acumulado del día; "Libras por hora" = "Libras hoy" ÷ horas transcurridas del día (`DATEDIFF` desde el primer registro de destajo de hoy de toda la planta hasta `GETDATE()`, mismo divisor para todas las salas). La tabla se ordena por nº de sala y lleva fila de totales.',
          '"Horas trabajadas" por sala = horas decimales entre el primer y el último registro de destajo de hoy en esa sala. El filtro “Horas trabajadas >” deja solo las salas que superan estrictamente el valor indicado; la fila de totales suma las salas visibles.',
          'La card `Libras por hora promedio` de `Libras Peladas Hoy por Estilo` usa el total de todos los estilos dividido entre ese mismo tiempo transcurrido, por lo que concilia con el total de libras por hora de las salas.',
          'Cada tarjeta de estilo muestra a la izquierda las libras acumuladas de hoy y a la derecha `lbs/h` = libras del estilo ÷ horas transcurridas desde el primer registro de pelado del día.',
          'Botón "Por talla · hoy": libras peladas del día en curso agrupadas por `dbo.DCP_TALLAS.NOMBRE_TALLA` (mismo criterio que `/pelado-libras-hoy` por estilo, así el total por talla concilia con el total por estilo). Independiente del filtro de fechas; consulta perezosa al abrir el diálogo.',
          'Botón `Ver por talla`: se ubica en la esquina superior derecha de `Libras Peladas por Estilo` y monta bajo demanda una tabla Talla/Libras/Total con `/pelado-por-talla`; conserva el rango y turno globales. El detalle dejó de mostrarse permanentemente en la página.',
          'Órdenes activas / tiempo real: la BD no tiene un conteo real de personal en planta (módulo legado `CodigosBin` / `MovimientosInvProceso` vacío). Se aproxima con órdenes de `dbo.AV_Produccion_Diaria_2020` (`FechaHoraTorre`) con lectura en los últimos 15 min y `NombreTipoProceso IN (\'IQF PEELED\', \'IQF COOK PEELED\', \'PD BLOCK\', \'FRESH PEELED\')`.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Rango: `Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final`. Turno filtrado en TypeScript.',
          'Vista mensual = ventana de 12 meses calendario; agregación por mes en `dashboard.service.ts`.',
          '"Hoy" / vivo: `CAST(GETDATE() AS date)`, independiente del filtro.',
          'Catálogo de estilos: actividad de los últimos 60 días para mostrar cards en 0; fallback sin ventana si no hay datos recientes.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras peladas (rango) = `SUM(PES_ASIGNACION_LIBRAS_EMPLEADOS_DET.LIBRAS)`.',
          'Libras por hora promedio de hoy = `total` de `/pelado-libras-hoy` ÷ (`PELADO_MINUTOS_TRANSCURRIDOS_HOY_QUERY.MinutosTranscurridos / 60`); devuelve 0 cuando todavía no hay un intervalo válido.',
          'Empleados = `COUNT(DISTINCT IdEmpleado)` de `V_PagosxPeladoIndividualPBI` en el período; no se suman empleados entre filas.',
          'Total por estilo = total por talla = suma de libras de todas las salas, incluyendo “Sin sala”.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/pelado-por-estilo` · `/pelado-por-talla` (`-dia` / `-mes`) · `/pelado-personal` (`-dia` / `-mes`)',
          '`/pelado-tiempo-real` · `/pelado-libras-hoy` · `/pelado-libras-hoy-talla` (botón "Por talla · hoy" de la tabla por sala) · `/pelado-por-sala`',
          'Permiso backend: `requirePermission(\'pelado\')`.',
          'Archivos: `backend/src/services/stb.queries.ts`, `reports.queries.ts` (pelado en vivo), `dashboard.service.ts`; front `frontend/src/pages/PeladoPage.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  dashboard: {
    title: 'IQF',
    summary: 'Producción congelada neta, rendimiento por hora y horas trabajadas por IQF. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Libras congeladas netas: `dbo.AV_Produccion_Diaria_Resumen` (`NombreTipoProceso`, `Turno`, `PesoLibras`, `DiaProduccion2024`, `fkTipo`, `VaEjecutivo`, `ProcesadaPlanta`).',
          'Rendimiento IQF: `dbo.AV_Produccion_Diaria_2020` (`CategoriaLinea`, `EquipoIQF`, `Turno`, `DiaProduccion2024`, `PesoLibras`, `FechaHoraTorre`, `fkTipo`, `EstiloFinal`) + `dbo.EquiposIQF` (`IDequipo` → `NombreIQF`). Join opcional `dbo.OPship` por `OrdenProduccion`.',
          'Horas trabajadas: `dbo.AV_Produccion_Diaria_2020`, SELECT equivalente a `dbo.a_Fill_Produccion_Diaria_lectura_dos @Resumen = 30`. `FechaHoraTorre` viene de `Seriales.Created`; `CategoriaLinea` de `AV_LineasProduccion`, unida por `OrdenesProduccion.fkLineaProduccion`.',
          'Día lógico de la vista: `CAST(DATEADD(MINUTE, -359, Seriales.Created) AS DATE)`; Turno A entre 07:00:00 y 18:59:59, B en las demás horas.',
          'IQF en tiempo real: `AV_Produccion_Diaria_2020` agrupado por `LineaEquipoIQF`, día en curso.',
          'Equivale a los SP de lectura oficiales: `@Resumen = 3` (netas) y `@Resumen = 23` / SP `_dos` (rendimiento).',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Netas: `CAST(DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final AND VaEjecutivo = 1 AND ProcesadaPlanta = 1 AND fkTipo NOT IN (2, 4) AND NombreTipoProceso <> \'FRESH TAIL\'`.',
          'Se excluye RE-EMPAQUE (`fkTipo = 2`) y FRESH TAIL / REGISTRO FRESCO (`fkTipo = 4`, que es compra de materia prima, no congelación neta nueva).',
          '`fkTipo`: 0 = RECEPCIÓN (producción), 1 = REPROCESO, 2 = RE-EMPAQUE, 4 = REGISTRO FRESCO.',
          'Rendimiento: `fkTipo < 4`, líneas con `CategoriaLinea LIKE \'%IQF%\'` o `EquipoIQF > 0`; `HAVING DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) > 15` descarta grupos de ≤15 min.',
          "Horas: `DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final`, `fkTipo < 4`, `CategoriaLinea LIKE '%IQF%'`; agrupar por equipo/día/turno y conservar grupos con más de 15 minutos. No usa el UNION ALL del reporte de rendimiento.",
          'La línea `SAL` se excluye del rendimiento por no ser una línea IQF comparable.',
          'Turno filtrado en TypeScript. Vista mensual = 12 meses (ignora el filtro de días, respeta el turno).',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras netas = `SUM(PesoLibras)` agrupado por proceso y turno.',
          'Libras/hora por grupo = `SUM(PesoLibras) / (DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) / 60)`.',
          'Rendimiento del período = promedio simple de los `librasPorHora` de los grupos (`rateSum / grupos`), NO `SUM(libras) / SUM(horas)` — así lo calcula el reporte oficial. Ver `fetchIqfGroups` / `aggregate*` en `dashboard.service.ts`.',
          'Los nombres se normalizan en `normalizeIqfLine`: `IQF # 1 (Espiral)`, `IQF # 2 (Lineal)` e `IQF # 3 (Lineal)`. Se aplica tanto a rendimiento como a horas antes de agregar las celdas.',
          'La gráfica mensual agrega `Promedio general` por mes: `SUM(librasPorHora × grupos) / SUM(grupos)` entre los IQF válidos. En columnas se dibuja como línea; la tabla conserva solamente las columnas de cada IQF y su Grand Total ponderado.',
          'Horas por turno = `DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) / 60.0`. Diario suma turnos seleccionados por equipo/día; Mensual promedia esas horas diarias por equipo/mes sobre los días válidos, sin medir un intervalo de todo el mes. No descuenta pausas.',
          'Columna promedio de fila = suma de horas de sus equipos válidos / número de equipos válidos. Promedio por equipo = total de horas / períodos válidos del equipo. Promedio general = suma de todas las horas / número de celdas equipo/período válidas. Pie de la columna Promedio = media de los promedios de fila. Celdas ausentes se excluyen; mantener precisión y formatear dos decimales al mostrar.',
          'Las horas del endpoint de rendimiento tienen agrupación adicional por estilo/ejecutivo/grupo; no equivalen a las horas trabajadas del modo 30.',
          'IQF tiempo real: `MinutosDesdeUltima = DATEDIFF(MINUTE, MAX(FechaHoraTorre), GETDATE())`.',
        ],
      },
      {
        heading: 'Listas desplegables y vistas',
        bullets: [
          'Diario: “Rendimientos IQF x Hora — Diario” / “Horas Trabajadas por IQF — Diario”. Mensual: “Rendimientos IQF x Hora — Mensual” / “Horas Trabajadas por IQF — Mensual”. Listas independientes y ancho ajustado al texto.',
          'Ambos indicadores comparten Tabla/Gráfica en Diario y Tabla/Gráfica/Tendencia en Mensual. `ChartWidget` conserva `view` al cambiar `report` y muestra el contenido del indicador seleccionado.',
          'Las tarjetas diaria y mensual tienen la misma altura fija en escritorio. `monthYearAxis` muestra el mes abreviado y el año en una segunda línea; `showPeriodAverageSeries` habilita el promedio mensual solo para el rendimiento.',
          'Horas usa `IqfWorkedHoursTable` en Tabla y `DynamicChart` en Gráfica/Tendencia, con `yField = horas`, formato decimal y la misma configuración temporal del reporte. Diario usa línea, Mensual columnas o línea de tendencia. La tabla muestra “Promedio diario” o “Promedio mensual” y el promedio general; no muestra total del período.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/libras-netas-proceso` (`-dia` / `-mes`) · `/iqf-libras-hora-dia` · `/iqf-libras-hora-mes` · `/iqf-tiempo-real` · `/iqf-horas-trabajadas` · `/iqf-horas-trabajadas-mes`',
          'Rutas bajo `/api/dashboard/`. Horas Diario devuelve `{ periodo: YYYY-MM-DD, linea, horas }`; Mensual `{ periodo: YYYY-MM, linea, horas }`. Mensual admite `meses` de 1 a 36, predeterminado 12, con ventana desde el primer día del mes más antiguo hasta hoy. Valida las fechas aunque no las use para elegir la ventana; respeta turno.',
          'Horas: caché de reporte de 5 min por fechas/turno en Diario y por meses/turno en Mensual; `refresh=true` fuerza renovación. El navegador consulta cada 5 min.',
          'Permiso backend: `requirePermission(\'iqf\')`.',
          'Archivos: `backend/src/services/reports.queries.ts`, `dashboard.service.ts`; front `frontend/src/pages/DashboardPage.tsx`, `frontend/src/components/charts/ChartWidget.tsx` e `IqfWorkedHoursTable.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  exportaciones: {
    title: 'Exportaciones',
    summary: 'Producto despachado por contenedor, cliente y estilo. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'La información procede de `Envios`, `Masteres`, `Seriales`, `OrdenesProduccion`, `AV_Items` y `AV_LotesRemision`. Ya no se consulta directamente la vista completa `AV_Envios`, que une muchas tablas ajenas a esta pantalla y trabaja sobre ~19M seriales.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contenedores: `FechaCarga BETWEEN @Fecha_Inicial AND @Fecha_Final` y `NumeroContenedor` no vacío (el despacho/fresco/reempaque interno no lleva contenedor, así que ese filtro ya los excluye).',
          'SQL agrupa primero por contenedor + estilo + cliente. El servicio devuelve una fila principal por fecha/contenedor/referencia y guarda esas agrupaciones en `detalle`; “Ver detalle” las muestra bajo demanda.',
          'Cliente = `COALESCE(NULLIF(NombreGrupo, \'\'), NULLIF(Empresa, \'\'), \'Sin cliente\')`.',
          'Resumen semana en curso: lunes-domingo calculado sin depender de `@@DATEFIRST` — `DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy)`.',
          'Francia: `NombreGrupo LIKE \'%FRANCIA%\'`. UK: `NombreGrupo LIKE \'%LFF%\' OR LIKE \'%UK%\'`. AC Holding: `NombreGrupo LIKE \'%AC HOLDING%\'`. Terceros = resto (no cae en las tres anteriores), así que los 4 buckets siempre suman el total.',
          'Vista mensual por cliente = últimos 6 meses (agregación en el servicio); ya no hay vista diaria por cliente.',
          '`fetchExportGroups` cachea 15 min por rango: Por Estilo y Contenedores comparten una sola consulta, incluso si se solicitan simultáneamente. Resumen usa caché de 15 min y el mensual tiene una consulta SQL agregada y caché propia de 15 min.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras exportadas = `SUM(PesoLibras)`, agregado en una sola pasada con `SUM(CASE...)` (no con un CTE referenciado varias veces: SQL Server no lo materializa y cada referencia repetía el escaneo completo de la vista, ~25-30s → ~1-3s con una sola pasada).',
          'Másteres = `COUNT(DISTINCT CodigoMaster)`.',
          'Fila principal por contenedor: libras = suma del detalle; anillos/máster = `SUM(Unidades) / SUM(Másteres)`; estilos = cantidad de estilos distintos. La fila Total suma contenedores, másteres y libras.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/exportaciones-resumen` · `/exportaciones-contenedores` · `/exportaciones-por-estilo` · `/exportaciones-por-cliente-mes`',
          'Archivos: `procesos.queries.ts` (`EXPORTACIONES_CONTENEDORES_QUERY`, `EXPORTACIONES_CLIENTE_MES_QUERY`, `EXPORTACIONES_RESUMEN_QUERY`), `procesos.service.ts` (`getExportaciones*`); front `ExportacionesPage.tsx` y `ExportContainersTable.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  'compra-materia-prima': {
    title: 'Compra de materia prima',
    summary: 'Materia prima WSO recibida, equivalente entero y desglose por mes, talla y proveedor. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Única fuente: vista `dbo.AV_MateriaPrima` (`DiaProduccion2024`, `NombrePropietario`, `NombreGrupo`, `Talla` — gramaje del camarón, ej. "51/60" —, `Item` — código de producto, ej. "STB COLA FRESCO51/60" —, `TipoMateria` — "FRESCO" casi siempre, a veces "SALMUERA" —, `PesoLibras`, `CantidadSerial`, `SubTotal`). En los últimos meses casi toda la vista es `fkTipo = 4` / `NombreTipoProceso = \'FRESH TAIL\'` (registro fresco de materia prima).',
          'La API `/compra-mp-resumen` devuelve sumas base de `dbo.AV_MateriaPrima.PesoLibras`. Los cuatro contadores visibles son HOSO: el frontend aplica `valor / 0.65` a Hoy, Semana, Mes y Promedio semanal mediante `toHoso`. La fecha efectiva sigue siendo la última fecha registrada, limitada a hoy.',
          'Nota: NO se usa la tabla `dbo.MateriaPrima` (esa tabla es de otro dominio — liquidación de exportación WSO/embarque — y no tiene el gramaje de recepción; se verificó por inspección directa de columnas).',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contadores superiores: `@Lunes`/`@Domingo` = semana que contiene `@Hoy`, `@PrimerDiaMes` = 1º del mes de `@Hoy` — pero `@Hoy` NO es `GETDATE()` directo, es `MAX(DiaProduccion2024)` de `AV_MateriaPrima` (con tope en la fecha real del servidor). La recepción se registra con varios días de rezago (se observó hasta 5); anclar al reloj hacía que "semana actual" y "mes actual" casi siempre cayeran en un período aún sin filas y el resumen mostrara "sin datos" pese a haber recepción reciente. `HoyEfectivo` viaja en la respuesta SQL para que el servicio calcule `librasPromedioSemana` sobre el mes correcto. Ninguno de los 4 contadores responde al filtro de fechas del dashboard.',
          '`LibrasRecibidasHoy = SUM(PesoLibras)` donde `DiaProduccion2024 BETWEEN @Hoy AND @Hoy`; `@Hoy` es la última fecha disponible, limitada a no superar la fecha real.',
          '`LibrasRecibidasSemana` / `LibrasRecibidasMes` = `SUM(PesoLibras)` de `AV_MateriaPrima` con `DiaProduccion2024` en la semana / en `[@PrimerDiaMes, @Hoy]` respectivamente.',
          'Materia prima por proveedor (tarjetas, rango del filtro): `CAST(DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final`; proveedor = `COALESCE(NULLIF(NombrePropietario, \'\'), NULLIF(NombreGrupo, \'\'), \'Sin proveedor\')`.',
          'Tarjeta "Materia Prima por Proveedor/Talla — Mensual": muestra los 3 meses **con datos** más recientes, no 3 meses calendario a secas — se pide un mes extra (`COMPRA_MP_MESES + 1`) y se recorta a los 3 con filas reales, por el mismo motivo de rezago que el punto anterior (antes había una tabla de 12 meses separada; se fusionó con el widget de talla/selector porque, en modo "Proveedor", mostraban exactamente los mismos datos — ver `getCompraMpPorProveedorMes` eliminado). El filtro de proveedores (checklist) se aplica en el navegador sobre las filas ya traídas, antes de re-agregar por mes+serie.',
          'Tabla "Detalle de Materia Prima por Talla" (rango del filtro): pivota `NombrePropietario`/`NombreGrupo` por `Talla`, suma `PesoLibras` e incluye totales por proveedor, por talla y general.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          '`librasPromedioSemana = librasRecibidasMes / semanasDelMes`, calculado en TypeScript (`procesos.service.ts`, `semanasDelMesActual`): `semanasDelMes = Math.ceil((díaDeHoy + díaDeLaSemanaDelDía1) / 7)` — nº de semanas lunes-domingo que toca el mes desde el día 1 hasta hoy (semana parcial cuenta como una).',
          'Libras WSO por proveedor = `SUM(AV_MateriaPrima.PesoLibras)`. Equivalente entero = libras WSO ÷ `0.65`, mostrado en la columna Entero de cada tarjeta combinada.',
          'Tarjetas combinadas: `MateriaPrimaProveedorCombinedCards` consulta una sola vez `/compra-mp-por-proveedor`; por proveedor muestra WSO = `libras` y Entero = `libras / 0.65`, comparte el porcentaje entregado por el endpoint y agrega una tarjeta TOTAL calculada en el navegador. Reemplaza los dos `ChartWidget` separados.',
          'Color estable y no repetido: `categoryColor(nombre)` define colores explícitos distintos para los proveedores operativos conocidos y genera un HSL desde el nombre para proveedores nuevos. La tarjeta combinada y la gráfica mensual llaman la misma función, por lo que el proveedor conserva su color sin depender del orden.',
          'Libras por mes/talla/proveedor: el SQL y el servicio conservan el nombre interno `gramaje` para el valor de `AV_MateriaPrima.Talla`; agregan por mes+talla+proveedor. El widget filtra proveedores y re-agrega por (mes, proveedor) o (mes, talla) según el selector.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/compra-mp-resumen` (libras recibidas hoy, semana/mes y promedio semanal) · `/compra-mp-por-proveedor` (tarjetas, rango) · `/compra-mp-materia-prima` (mes/talla/proveedor, 3 meses con datos — alimenta la tarjeta "Mensual" fusionada) · `/compra-mp-por-talla` (matriz proveedor/talla, rango del filtro).',
          '`/compra-mp-por-proveedor-mes` se eliminó (junto con `getCompraMpPorProveedorMes` en el servicio, su controller y su ruta): quedó redundante frente a `/compra-mp-materia-prima` en modo "Proveedor".',
          '`/compra-mp-ordenes` (tabla "Órdenes Pendientes de Exportación") se eliminó por completo: vivió primero aquí, luego se movió a Exportaciones, y finalmente se quitó del dashboard.',
          'Permiso backend: `requirePermission(\'compra_materia_prima\')`.',
          'Archivos: `procesos.queries.ts` (`COMPRA_MP_RESUMEN_QUERY`, `COMPRA_MP_POR_PROVEEDOR_QUERY`, `COMPRA_MP_POR_ITEM_QUERY`), `procesos.service.ts` (`getCompraMpResumen`, `getCompraMpPorProveedor`, `getCompraMpMateriaPrima`, `getCompraMpPorItem`); front `frontend/src/pages/CompraMateriaPrimaPage.tsx`, `frontend/src/components/charts/MateriaPrimaProveedorCombinedCards.tsx`, `frontend/src/components/charts/MateriaPrimaProveedorWidget.tsx` (la tarjeta "Mensual": selector Proveedor/Talla, vistas Tabla/Gráfica, selector de proveedores), `frontend/src/components/charts/GroupedItemsTable.tsx` (tabla tipo/proveedor/item).',
          'La selección de proveedores del checklist se guarda en `localStorage`, clave `compra-mp-proveedores-ocultos:v1:<userId>` (se guardan los proveedores OCULTOS, no los visibles, para que un proveedor nuevo aparezca visible por defecto).',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  inventory: {
    title: 'Inventario',
    summary: 'Producto terminado disponible (no despachado), explorable como pivote. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Consulta de origen',
        body: 'Una sola consulta en `backend/src/services/inventory.service.ts` (`getInventory`), con un CTE `inventario` de dos ramas unidas por `UNION ALL`:',
        bullets: [
          'Rama 1 (seriales en máster): `dbo.Seriales` → `dbo.OrdenesProduccion` (`FkOrdenProduccion`) → `dbo.AV_LotesRemision` (`FkLoteRemision`) → `dbo.AV_Items` (`FkItem`) → `dbo.Masteres` (`FkMaster`) → `dbo.Localidades` (`FkLocalidad`) → `dbo.Empresas` (`IDEmpresa`) → `dbo.ClientesProduccion` (`fkClienteProduccion`, LEFT JOIN). Filtro: `m.FkEnvio IS NULL`, `op.FechaProduccion > \'2017-07-27\'`, `op.FkTipo < 4`, `op.NoOrdenCompra <> \'\'`. `CantidadSerial = Seriales.Cantidad`.',
          'Rama 2 (seriales sobrantes): `dbo.Seriales` → `dbo.SerialesSobrantes` (`FkSerial`) → `OrdenesProduccion` → `AV_Items` → `AV_LotesRemision` → `dbo.Freezers` (`FkFreezer`) → `dbo.Torres` (`FkTorre`) → `Empresas` → `ClientesProduccion`. Filtro: `s.FkMaster IS NULL`, `op.NoOrdenCompra <> \'\'`. `CantidadSerial = 1` por fila.',
          'Disponibilidad: `CASE op.FkStatus` 1 → DISPONIBLE, 2 → PENDIENTE, 3 → RETENIDO, 4 → CUARENTENADO, else DESCONOCIDO.',
          'Cliente principal = `COALESCE(NULLIF(ClientesProduccion.NombreCliente, \'\'), AV_LotesRemision.Empresa)`.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'No hay filtro de fechas ni turno: se trae el inventario disponible completo y el agrupado / filtrado se hace en el navegador (pivot).',
          '`SUM(PesoKilos)` y `SUM(CantidadSerial)` agrupados por todas las dimensiones (cliente, orden, código externo, fecha de producción, item, estilo, talla, empaque, tipo, disponibilidad).',
          'Las preferencias de agrupación y los filtros de columna se guardan por usuario en `dbo.dashboard_inventario_preferencias`. `localStorage` queda únicamente como respaldo y para migrar selecciones anteriores.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Peso kilos = `SUM(AV_Items.PesoKilos)` sobre los seriales del grupo.',
          'Cantidad serial = `SUM(Seriales.Cantidad)` (rama máster) o conteo de filas (rama sobrantes).',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/inventory` → `inventory.service.getInventory`.',
          'Permiso backend: `requirePermission(\'inventario\')`.',
          'Archivos: `backend/src/routes/inventory.routes.ts`, `backend/src/services/inventory.service.ts`; front `frontend/src/pages/InventoryPage.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  'power-bi': {
    title: 'Power BI',
    summary: 'Reporte de Power BI Embedded mediante el esquema App Owns Data; las credenciales de Microsoft permanecen exclusivamente en el backend.',
    blocks: [
      {
        heading: 'Autenticación y token',
        bullets: [
          '`backend/src/services/powerbi.service.ts` usa MSAL Client Credentials con el scope `https://analysis.windows.net/powerbi/api/.default`.',
          '`GET /api/powerbi/embed-token` está protegido por sesión y `requirePermission(\'power_bi\')`; devuelve únicamente el embed token, embed URL e ID del reporte.',
          'El backend consulta los metadatos del reporte y llama a `GenerateToken` con `accessLevel: View`. Las credenciales nunca se incluyen en el bundle de React.',
        ],
      },
      {
        heading: 'Renderizado',
        bullets: [
          '`frontend/src/components/powerbi/PowerBIReportContainer.tsx` obtiene la configuración mediante el cliente API compartido y renderiza `PowerBIEmbed` con `TokenType.Embed`.',
          'El iframe ocupa el 100% del panel; el panel de filtros está disponible contraído y la navegación de páginas permanece visible.',
        ],
      },
    ],
  },
  users: {
    title: 'Usuarios',
    summary: 'Administración de accesos y permisos del dashboard. Fuente: base de autenticación del dashboard (tablas propias `dashboard_*`).',
    blocks: [
      {
        heading: 'Tablas de origen',
        bullets: [
          '`dbo.dashboard_usuarios` (`id`, `usuario`, `nombre`, `correo`, `es_administrador`, `debe_cambiar_password`, `activo`, `password_hash`).',
          '`dbo.dashboard_usuarios_permisos` (`usuario_id`, `permiso`) — PK compuesta, FK a `dashboard_usuarios`; un registro por permiso otorgado.',
          'Migraciones y seed: `backend/src/database/migrate.ts` (`dashboard_migraciones` controla las versiones aplicadas).',
        ],
      },
      {
        heading: 'Lógica y reglas',
        bullets: [
          '`esAdministrador = true` ⇒ superusuario implícito: ignora la lista de permisos y no se edita desde la UI (`PATCH /users/:id/permisos` responde 400 para administradores).',
          '`fetchPermisos` / `fetchPermisosMap` filtran con `esPermisoValido` (catálogo `backend/src/types/permissions.ts`); un permiso desconocido en BD se ignora.',
          '`updatePermisos` = `DELETE` de todos los permisos del usuario + `INSERT` del nuevo conjunto (reemplazo total).',
          'Validación de entrada: `permisosInput.every(esPermisoValido)` y de-duplicación con `Set`.',
          '`activo = 0` bloquea el login; `debe_cambiar_password = 1` fuerza el cambio al ingresar. El hash (bcrypt) vive en `password_hash` y nunca se devuelve al front.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          'Todas bajo `requirePermission(\'usuarios\')`: `GET /api/users` (lista con permisos vía `fetchPermisosMap`), `POST /api/users` (crea usuario + permisos + contraseña temporal), `PATCH /api/users/:id/permisos` (reemplaza permisos), más estado / reset de contraseña según `users.routes.ts`.',
          'Archivos: `backend/src/services/auth.service.ts`, `routes/users.routes.ts`, `middleware/sessionAuth.ts` (`requirePermission`); front `frontend/src/pages/UsersPage.tsx`.',
        ],
      },
      {
        heading: 'Catálogo de permisos',
        body: 'La lista de permisos asignables se define en `backend/src/types/permissions.ts` y debe reflejarse en `frontend/src/config/permissions.ts` (`PERMISOS` + `PERMISO_LABELS`). Cada vista nueva del dashboard agrega su clave aquí para poder gatearse. `detalles_desarrollador` es el permiso que habilita este mismo diálogo.',
      },
      ARQUITECTURA_COMUN,
    ],
  },
};

/** Renderiza una línea con segmentos `entre backticks` como <code>. */
function renderLine(line: string) {
  const parts = line.split('`');
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Box
        key={i}
        component="code"
        sx={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.82em',
          bgcolor: 'rgba(15, 23, 42, 0.06)',
          px: 0.5,
          py: 0.1,
          borderRadius: 0.5,
          wordBreak: 'break-word',
        }}
      >
        {part}
      </Box>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default function PageDevDetailsDialog({ view, open, onClose }: {
  view: DashboardView;
  open: boolean;
  onClose: () => void;
}) {
  const details = PAGE_DEV_DETAILS[view];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ pr: 6, pb: 1.25 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ width: 34, height: 34, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: 'rgba(88, 28, 135, 0.1)', color: '#7c3aed' }}>
            <DataObjectIcon />
          </Box>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="overline" color="text.secondary" fontWeight={800}>Detalles Desarrollador</Typography>
              <Chip label="Requiere permiso" size="small" color="secondary" variant="outlined" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
            </Stack>
            <Typography variant="h6" fontWeight={800}>{details.title}</Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} aria-label="Cerrar detalles de desarrollador" sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{details.summary}</Typography>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {details.blocks.map((block) => (
            <Box key={block.heading}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom>{block.heading}</Typography>
              {block.body && (
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65, mb: block.bullets ? 1 : 0 }}>
                  {renderLine(block.body)}
                </Typography>
              )}
              {block.bullets && (
                <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.75}>
                  {block.bullets.map((bullet, i) => (
                    <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {renderLine(bullet)}
                    </Typography>
                  ))}
                </Stack>
              )}
              {block.code && (
                <Box
                  component="pre"
                  sx={{
                    mt: 1,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'rgba(15, 23, 42, 0.9)',
                    color: '#e2e8f0',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                    overflowX: 'auto',
                  }}
                >
                  {block.code}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
