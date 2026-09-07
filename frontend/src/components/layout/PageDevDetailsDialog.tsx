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
          'Contadores de hoy y "Libras recibidas por finca": `dbo.R_REMISIONES_PLANTA` (cabecera) + `dbo.R_REMISIONES_PLANTA_DETALLE` (bins; columnas `LIBRAS`, `PROCESADO`).',
          'Finca: `dbo.R_REMISIONES_PLANTA.ID_LAGUNA` → `dbo.R_Lagunas.IdLaguna` → `dbo.R_Fincas.IdFinca` (`Finca`).',
          '`dbo.R_PesadoRecepcion.LibrasNetas` dejó de poblarse en 2026-03; por eso las libras se suman desde el detalle de bins, no de esa tabla.',
          '"Remisiones Recibidas — Detalle": vista `dbo.RemisionesPlantaPBI` (la misma que alimenta el tablero de Power BI). Trae `LibrasRemision`, `LibrasBasura`, `LibrasCola` / `LibrasCabeza` (vía `VPesadoColaPBI` / `VPesadoCabezaPBI`), `Nombre`, `CodigoFinca`, `Laguna` e `IdRemisionPlanta`. La vista filtra internamente `FechaRemision > 2025-01-01`.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contadores: `rp.ANULADA = 0 AND rp.RECHAZADA = 0`. Libras recibidas hoy: `rp.FECHA_REMISION = @Dia`. Remisiones hoy: `COUNT(DISTINCT rp.REMISION_GENERAL)`.',
          'Libras pendientes de procesar: `rp.CERRADA = 0 AND ISNULL(d.PROCESADO, 0) = 0` — es un saldo global, sin filtro de fecha.',
          'Fincas activas hoy: `COUNT(DISTINCT f.IdFinca)`.',
          'Libras recibidas por finca: `rp.FECHA_REMISION BETWEEN @Fecha_Inicial AND @Fecha_Final`; nombre = `COALESCE(NULLIF(f.Finca, \'\'), NULLIF(rp.NombreCliente, \'\'), \'Sin finca\')`.',
          'Remisiones recibidas — detalle: `RemisionesPlantaPBI.FechaRemision BETWEEN @Fecha_Inicial AND @Fecha_Final`, agrupado por (fecha, remisión, cliente, código de finca, laguna).',
          'Recepción no maneja turno.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras recibidas = `SUM(R_REMISIONES_PLANTA_DETALLE.LIBRAS)` de bins no anulados / no rechazados.',
          'Detalle de remisiones: `LibrasRemision` se suma (la vista abre la fila por el indicador `Procesado`); `LibrasCola`, `LibrasCabeza` y `LibrasBasura` se toman con `MAX` porque son constantes por remisión-laguna.',
          'Total cola + cabeza = `LibrasCola + LibrasCabeza`. Rendimiento finca = `LibrasCola / LibrasRemision`. Rendimiento planta = `LibrasCola / (LibrasCola + LibrasCabeza)`. Se calculan en `procesos.service.ts` y se expresan en porcentaje (0–100).',
          'Fila de Total en la tabla: suma de libras y rendimientos ponderados (Σcola ÷ Σremisión y Σcola ÷ Σ(cola+cabeza)), calculada en `WidgetDataTable`.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/recepcion-resumen`',
          '`GET /api/dashboard/recepcion-por-finca` · `/recepcion-remisiones`',
          'Permiso backend: `requirePermission(\'recepcion\')`.',
          'Archivos: `backend/src/services/procesos.queries.ts` (`RECEPCION_RESUMEN_QUERY`, `RECEPCION_POR_FINCA_QUERY`, `RECEPCION_REMISIONES_QUERY`), `procesos.service.ts`, `procesos.controller.ts`, `routes/dashboard.routes.ts`; front `frontend/src/pages/RecepcionPage.tsx`, `components/charts/WidgetDataTable.tsx`.',
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
          '`dbo.DES_ASIG_LBRS_EMPLEADOS` (cabecera, `FECHA`) + `dbo.DES_ASIG_LBRS_EMPLEADOS_DET` (`LIBRAS`, `VALOR`, `ANULADO`, `ID_TALLA`, `ID_EMPLEADO_LINEA`) — libras y pago a destajo reales.',
          'Personas: `dbo.DES_EMPLEADOS_LINEAS` (`ID_EMPLEADO_LINEA` → `ID_EMPLEADO`).',
          'Gramaje: `dbo.DCP_TALLAS` (`ID_TALLA` → `NOMBRE_TALLA`) — la talla / rango, valor cualitativo.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Resumen de hoy: `h.FECHA = @Dia AND d.ANULADO = 0` (CTE `det` reutilizada por los 4 contadores).',
          'Por día: `h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final`, `GROUP BY h.FECHA` (sin turno).',
          'Descabezado ya no filtra por turno.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras descabezadas al día = `SUM(DES_ASIG_LBRS_EMPLEADOS_DET.LIBRAS)` no anulado del día.',
          'Personas descabezando por día = `COUNT(DISTINCT el.ID_EMPLEADO)` del día; no se suma entre filas.',
          'Gramaje promedio = `NOMBRE_TALLA` con mayor `SUM(LIBRAS)` del día (`TOP 1 ... ORDER BY SUM(LIBRAS) DESC`) — texto, no número.',
          'Costo por libra = `SUM(VALOR) / SUM(LIBRAS)` del día (promedio ponderado del precio por libra).',
          'Tablas diaria / mensual: `SUM(LIBRAS)` por fecha, serie constante `\'Descabezadas\'` para la pivote; mensual = 12 meses agregados por mes en el servicio.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/descabezado-resumen` · `/descabezado-por-dia` · `/descabezado-por-dia-mes`',
          'Permiso backend: `requirePermission(\'descabezado\')`.',
          'Archivos: `procesos.queries.ts` (`DESCABEZADO_RESUMEN_QUERY`, `DESCABEZADO_POR_DIA_QUERY`), `procesos.service.ts`; front `frontend/src/pages/DescabezadoPage.tsx`, `components/live/ResumenCards.tsx`.',
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
          '`dbo.CL_LLENADO_RECIPIENTES` (cabecera, `FECHA`, `ID_RESPONSABLE`) + `dbo.CL_LLENADO_RECIPIENTES_D` (`LIBRAS_NETA`, `ANULADO`, `IdTurno`, `ID_TALLA`).',
          'Talla: `dbo.DCP_TALLAS` (`ID_TALLA` → `NOMBRE_TALLA` en el detalle; `IdTallaFinal` → `NOMBRE_TALLA` en el inventario).',
          '"Máquina" = responsable de mesa: `dbo.DCP_RESPONSABLES` (`ID_RESPONSABLE` → `NOMBRES`). `ID_TANQUE` no se usa desde 2023, por eso se identifica la mesa por su responsable.',
          'Inventario clasificado: `dbo.CL_InventarioClasificado` (`LibrasNetas`, `IdTallaFinal`, `FincaPBI`, `Fecha`) con `EnInventario = 1 AND Transferido = 0 AND Procesado = 0`. `Destino` no se usa: está NULL en el 100% de la tabla.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Resumen: libras de `h.FECHA = @Hoy`, de la semana en curso (`@Lunes`–`@Domingo`, sin depender de `@@DATEFIRST`) y del mes en curso (`@PrimerDiaMes`–`@Hoy`); siempre `d.ANULADO = 0`.',
          'Inventario: saldo actual (`EnInventario = 1 AND Transferido = 0 AND Procesado = 0`); se agrupa por `IdTallaFinal` → `DCP_TALLAS` y por `FincaPBI`.',
          'Detalle por máquina: `h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0`, agrupado por fecha, turno, responsable y talla. Turno filtrado en TypeScript. Vista mensual = 12 meses.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras clasificadas = `SUM(CL_LLENADO_RECIPIENTES_D.LIBRAS_NETA)` no anulado.',
          'Inventario: `bins = COUNT(*)`, `libras = SUM(CL_InventarioClasificado.LibrasNetas)` por talla, con columna de Total. El endpoint también calcula finca predominante y días represado (`hoy − MIN(Fecha)` del bin más antiguo), aunque la tabla actual solo muestra Talla × Bins/Libras.',
          'Los nombres son identificadores de mesa (catálogo `DCP_RESPONSABLES`), no producción individual.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`GET /api/dashboard/clasificado-resumen` · `/clasificado-inventario`',
          '`/clasificado-por-maquina` · `/clasificado-por-talla` (`-dia` / `-mes`)',
          'Permiso backend: `requirePermission(\'clasificado\')`.',
          'Archivos: `procesos.queries.ts` (`CLASIFICADO_RESUMEN_QUERY`, `CLASIFICADO_INVENTARIO_QUERY`, `CLASIFICADO_DETALLE_QUERY`), `procesos.service.ts`; front `frontend/src/pages/ClasificadoPage.tsx`, `components/charts/InventarioTallaTable.tsx`.',
        ],
      },
      {
        heading: 'Uso de datos personales',
        body: 'Los nombres proceden del catálogo DCP_RESPONSABLES de la base operativa; deben interpretarse como identificador de mesa y usarse solo para seguimiento interno autorizado.',
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
          'Por estilo / rango histórico: `dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET` (`LIBRAS`); estilo vía `dbo.PES_ASIGNACION_RECIPIENTES_LINEAS` → `dbo.PES_ESTILOS.NOMBRE`. Reemplaza a la vista `V_PagosxPeladoIndividualPBI`, que subcontaba libras respecto a las tablas base.',
          'Personal (headcount) y pago por estilo / talla: vista `dbo.V_PagosxPeladoIndividualPBI` (`IdEmpleado`, `libras`, `Valor`, `Fecha`, `Turno`, `Estilo`, `Talla`).',
          'Por sala (hoy): pelado individual (`PES_ASIGNACION_LIBRAS_EMPLEADOS_DET` → `dbo.DCP_LINEAS.ID_SALA`, empleado vía `dbo.PES_EMPLEADOS_LINEAS`) + pelado grupal (`dbo.DCP_PagosGrupales` + `dbo.DCP_PagosGrupalesDetalle`). Salas fijas `SALA #1`…`SALA #6` de `dbo.PES_SALAS`.',
'"Personas activas" por sala: estimado de gente pelando = `COUNT(DISTINCT ID_EMPLEADO)` con pago de destajo de pelado hoy en la sala (individual + grupal, todo el día), mismo valor que "Empleados hoy". "Libras últimos 30 min" mantiene la ventana en vivo (solo pelado individual; el grupal no tiene hora de registro).',
          '"Libras hoy" por sala = acumulado del día; "Libras por hora" = "Libras hoy" ÷ horas transcurridas del día (`DATEDIFF` desde el primer registro de destajo de hoy de toda la planta hasta `GETDATE()`, mismo divisor para todas las salas). La tabla se ordena por nº de sala y lleva fila de totales.',
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
          'Empleados = `COUNT(DISTINCT IdEmpleado)` de `V_PagosxPeladoIndividualPBI` en el período; no se suman empleados entre filas.',
          'Libras por sala (grupal) = `Libras / NULLIF(CantEmpleados, 0)` por persona, luego re-sumadas por sala.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/pelado-por-estilo` · `/pelado-por-talla` (`-dia` / `-mes`) · `/pelado-personal` (`-dia` / `-mes`)',
          '`/pelado-tiempo-real` · `/pelado-libras-hoy` · `/pelado-por-sala`',
          'Permiso backend: `requirePermission(\'pelado\')`.',
          'Archivos: `backend/src/services/stb.queries.ts`, `reports.queries.ts` (pelado en vivo), `dashboard.service.ts`; front `frontend/src/pages/PeladoPage.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  dashboard: {
    title: 'IQF',
    summary: 'Producción congelada neta y rendimiento por hora de las líneas IQF. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Libras congeladas netas: `dbo.AV_Produccion_Diaria_Resumen` (`NombreTipoProceso`, `Turno`, `PesoLibras`, `DiaProduccion2024`, `fkTipo`, `VaEjecutivo`, `ProcesadaPlanta`).',
          'Rendimiento IQF: `dbo.AV_Produccion_Diaria_2020` (`CategoriaLinea`, `EquipoIQF`, `Turno`, `DiaProduccion2024`, `PesoLibras`, `FechaHoraTorre`, `fkTipo`, `EstiloFinal`) + `dbo.EquiposIQF` (`IDequipo` → `NombreIQF`). Join opcional `dbo.OPship` por `OrdenProduccion`.',
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
          'IQF tiempo real: `MinutosDesdeUltima = DATEDIFF(MINUTE, MAX(FechaHoraTorre), GETDATE())`.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/libras-netas-proceso` (`-dia` / `-mes`) · `/iqf-libras-hora-dia` · `/iqf-libras-hora-mes` · `/iqf-tiempo-real`',
          'Permiso backend: `requirePermission(\'iqf\')`.',
          'Archivos: `backend/src/services/reports.queries.ts`, `dashboard.service.ts`; front `frontend/src/pages/DashboardPage.tsx`.',
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
          'Vista `dbo.AV_Envios` (`FechaCarga`, `NumeroContenedor`, `ReferenciaEnvio`, `NombreGrupo`, `Empresa`, `EstiloFinal`, `CodigoMaster`, `PesoLibras`, `CantidadSerial`). Vista pesada: ~19M filas a nivel de serial (caja individual) sobre `dbo.Seriales`, sin índice utilizable por `FechaCarga`.',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contenedores: `FechaCarga BETWEEN @Fecha_Inicial AND @Fecha_Final` y `NumeroContenedor` no vacío (el despacho/fresco/reempaque interno no lleva contenedor, así que ese filtro ya los excluye).',
          'Detalle agrupado por contenedor + estilo + cliente únicamente (no por código de exportación ni item: agregar por esas dos columnas fragmentaba cada contenedor en ~5-6 filas y disparaba el costo de la agregación sobre la vista de ~14s a menos de 2s).',
          'Cliente = `COALESCE(NULLIF(NombreGrupo, \'\'), NULLIF(Empresa, \'\'), \'Sin cliente\')`.',
          'Resumen semana en curso: lunes-domingo calculado sin depender de `@@DATEFIRST` — `DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy)`.',
          'Francia: `NombreGrupo LIKE \'%FRANCIA%\'`. UK: `NombreGrupo LIKE \'%LFF%\' OR LIKE \'%UK%\'`. AC Holding: `NombreGrupo LIKE \'%AC HOLDING%\'`. Terceros = resto (no cae en las tres anteriores), así que los 4 buckets siempre suman el total.',
          'Vista mensual por cliente = últimos 6 meses (agregación en el servicio); ya no hay vista diaria por cliente.',
          '`fetchExportGroups` (procesos.service.ts) cachea 5 min por rango de fechas: varios widgets de esta página comparten el mismo rango del filtro y antes repetían el escaneo completo de la vista una vez por widget.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          'Libras exportadas = `SUM(PesoLibras)`, agregado en una sola pasada con `SUM(CASE...)` (no con un CTE referenciado varias veces: SQL Server no lo materializa y cada referencia repetía el escaneo completo de la vista, ~25-30s → ~1-3s con una sola pasada).',
          'Másteres = `COUNT(DISTINCT CodigoMaster)`.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/exportaciones-resumen` · `/exportaciones-contenedores` · `/exportaciones-por-estilo` · `/exportaciones-por-cliente-mes`',
          'Archivos: `procesos.queries.ts` (`EXPORTACIONES_CONTENEDORES_QUERY`, `EXPORTACIONES_RESUMEN_QUERY`), `procesos.service.ts` (`getExportaciones*`); front `frontend/src/pages/ExportacionesPage.tsx`.',
        ],
      },
      ARQUITECTURA_COMUN,
    ],
  },

  'compra-materia-prima': {
    title: 'Compra de materia prima',
    summary: 'Materia prima (camarón entero) recibida en la semana/mes en curso y su desglose por mes, gramaje y proveedor. Fuente: PlantaEmpacadora.',
    blocks: [
      {
        heading: 'Tablas y vistas de origen',
        bullets: [
          'Única fuente: vista `dbo.AV_MateriaPrima` (`DiaProduccion2024`, `NombrePropietario`, `NombreGrupo`, `Talla` — gramaje del camarón, ej. "51/60" —, `Item` — código de producto, ej. "STB COLA FRESCO51/60" —, `TipoMateria` — "FRESCO" casi siempre, a veces "SALMUERA" —, `PesoLibras`, `CantidadSerial`, `SubTotal`). En los últimos meses casi toda la vista es `fkTipo = 4` / `NombreTipoProceso = \'FRESH TAIL\'` (registro fresco de materia prima).',
          'Conteo de órdenes de la semana: tabla `dbo.OrdenesCompra` (`FechaOrdenCompra`, fecha de creación de la orden).',
          'Nota: NO se usa la tabla `dbo.MateriaPrima` (esa tabla es de otro dominio — liquidación de exportación WSO/embarque — y no tiene el gramaje de recepción; se verificó por inspección directa de columnas).',
        ],
      },
      {
        heading: 'Filtros y parámetros',
        bullets: [
          'Contadores superiores: `@Lunes`/`@Domingo` = semana que contiene `@Hoy`, `@PrimerDiaMes` = 1º del mes de `@Hoy` — pero `@Hoy` NO es `GETDATE()` directo, es `MAX(DiaProduccion2024)` de `AV_MateriaPrima` (con tope en la fecha real del servidor). La recepción se registra con varios días de rezago (se observó hasta 5); anclar al reloj hacía que "semana actual" y "mes actual" casi siempre cayeran en un período aún sin filas y el resumen mostrara "sin datos" pese a haber recepción reciente. `HoyEfectivo` viaja en la respuesta SQL para que el servicio calcule `librasPromedioSemana` sobre el mes correcto. Ninguno de los 4 contadores responde al filtro de fechas del dashboard.',
          '`OrdenesCompraSemana = COUNT(*)` de `OrdenesCompra` con `FechaOrdenCompra` en `[@Lunes, @Domingo]` (con el `@Hoy` anclado arriba) — casi siempre da 0: la orden más reciente en `OrdenesCompra` es de hace ~2 meses, muy anterior al rezago normal de recepción.',
          '`LibrasRecibidasSemana` / `LibrasRecibidasMes` = `SUM(PesoLibras)` de `AV_MateriaPrima` con `DiaProduccion2024` en la semana / en `[@PrimerDiaMes, @Hoy]` respectivamente.',
          'Materia prima por proveedor (tarjetas, rango del filtro): `CAST(DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final`; proveedor = `COALESCE(NULLIF(NombrePropietario, \'\'), NULLIF(NombreGrupo, \'\'), \'Sin proveedor\')`.',
          'Tarjeta "Materia Prima por Proveedor/Gramaje — Mensual": muestra los 3 meses **con datos** más recientes, no 3 meses calendario a secas — se pide un mes extra (`COMPRA_MP_MESES + 1`) y se recorta a los 3 con filas reales, por el mismo motivo de rezago que el punto anterior (antes había una tabla de 12 meses separada; se fusionó con el widget de gramaje/selector porque, en modo "Proveedor", mostraban exactamente los mismos datos — ver `getCompraMpPorProveedorMes` eliminado). El filtro de proveedores (checklist) se aplica en el navegador sobre las filas ya traídas, antes de re-agregar por mes+serie.',
          'Tabla "Materia Prima por Proveedor e Item" (rango del filtro): agrupa por `TipoMateria` → proveedor → `Item`, reproduce la tabla dinámica de Excel/Power BI que ya usaba el cliente. Jerarquía expandible/colapsable con subtotal por proveedor y total general.',
        ],
      },
      {
        heading: 'Fórmulas y cálculos',
        bullets: [
          '`librasPromedioSemana = librasRecibidasMes / semanasDelMes`, calculado en TypeScript (`procesos.service.ts`, `semanasDelMesActual`): `semanasDelMes = Math.ceil((díaDeHoy + díaDeLaSemanaDelDía1) / 7)` — nº de semanas lunes-domingo que toca el mes desde el día 1 hasta hoy (semana parcial cuenta como una).',
          'Libras por proveedor = `SUM(AV_MateriaPrima.PesoLibras)`; Valor = `SUM(SubTotal)`.',
          'Libras por mes/gramaje/proveedor: el SQL agrega por día+mes+gramaje+proveedor; el servicio (`getCompraMpMateriaPrima`) vuelve a sumar por mes+gramaje+proveedor. El widget del front filtra por proveedor visible y re-agrega por (mes, proveedor) o (mes, gramaje) según el toggle elegido.',
        ],
      },
      {
        heading: 'Endpoints y archivos',
        bullets: [
          '`/compra-mp-resumen` (4 contadores semana/mes) · `/compra-mp-por-proveedor` (tarjetas, rango) · `/compra-mp-materia-prima` (mes/gramaje/proveedor, 3 meses con datos — alimenta la tarjeta "Mensual" fusionada) · `/compra-mp-por-item` (tabla agrupada tipo/proveedor/item, rango del filtro).',
          '`/compra-mp-por-proveedor-mes` se eliminó (junto con `getCompraMpPorProveedorMes` en el servicio, su controller y su ruta): quedó redundante frente a `/compra-mp-materia-prima` en modo "Proveedor".',
          '`/compra-mp-ordenes` (tabla "Órdenes Pendientes de Exportación") se eliminó por completo: vivió primero aquí, luego se movió a Exportaciones, y finalmente se quitó del dashboard.',
          'Permiso backend: `requirePermission(\'compra_materia_prima\')`.',
          'Archivos: `procesos.queries.ts` (`COMPRA_MP_RESUMEN_QUERY`, `COMPRA_MP_POR_PROVEEDOR_QUERY`, `COMPRA_MP_POR_ITEM_QUERY`), `procesos.service.ts` (`getCompraMpResumen`, `getCompraMpPorProveedor`, `getCompraMpMateriaPrima`, `getCompraMpPorItem`); front `frontend/src/pages/CompraMateriaPrimaPage.tsx`, `frontend/src/components/charts/MateriaPrimaProveedorWidget.tsx` (la tarjeta "Mensual": toggle Proveedor/Gramaje, toggle Tabla/Gráfica/Tendencia, selector de proveedores), `frontend/src/components/charts/GroupedItemsTable.tsx` (tabla tipo/proveedor/item).',
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
          'Las preferencias de agrupación y los filtros de columna se guardan en `localStorage` por usuario, solo en este navegador.',
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
