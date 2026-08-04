/**
 * Consultas de los 3 reportes del dashboard, construidas directamente
 * sobre las tablas fuente (verificadas contra la BD):
 *
 * - `AV_Produccion_Diaria_Resumen`: producción por tipo de proceso.
 *   `fkTipo` / `TipoOP`: 0 = RECEPCION (producción), 1 = REPROCESO,
 *   2 = RE-EMPAQUE, 4 = REGISTRO FRESCO (FRESH TAIL, compra de materia
 *   prima). Mismos filtros base del SP de lectura (@Resumen=3):
 *   VaEjecutivo = 1 y ProcesadaPlanta = 1.
 *
 * - `AV_Produccion_Diaria_2020` + `EquiposIQF`: rendimiento IQF
 *   (misma lógica del SP `_dos` @Resumen=23: fkTipo < 4, líneas IQF,
 *   y descarte de grupos con 15 minutos o menos de trabajo).
 */

/**
 * Libras congeladas netas por tipo de proceso:
 * excluye RE-EMPAQUE (fkTipo = 2) y la compra de materia prima
 * FRESH TAIL / REGISTRO FRESCO (fkTipo = 4).
 */
export const NET_FROZEN_BY_PROCESS_QUERY = `
SELECT
  a.NombreTipoProceso AS Proceso,
  a.Turno,
  SUM(a.PesoLibras) AS Libras
FROM dbo.AV_Produccion_Diaria_Resumen a
WHERE CAST(a.DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND a.VaEjecutivo = 1
  AND a.ProcesadaPlanta = 1
  AND a.fkTipo NOT IN (2, 4)
  AND a.NombreTipoProceso <> 'FRESH TAIL'
GROUP BY a.NombreTipoProceso, a.Turno
`;

/**
 * Misma definición que NET_FROZEN_BY_PROCESS_QUERY, con el día de
 * producción incluido para poder agrupar por día o por mes en el
 * servicio (vista "Día" / "Mensual" del reporte de libras netas).
 */
export const NET_FROZEN_BY_PROCESS_DAILY_QUERY = `
SELECT
  a.NombreTipoProceso AS Proceso,
  a.Turno,
  CAST(a.DiaProduccion2024 AS DATE) AS Dia,
  SUM(a.PesoLibras) AS Libras
FROM dbo.AV_Produccion_Diaria_Resumen a
WHERE CAST(a.DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND a.VaEjecutivo = 1
  AND a.ProcesadaPlanta = 1
  AND a.fkTipo NOT IN (2, 4)
  AND a.NombreTipoProceso <> 'FRESH TAIL'
GROUP BY a.NombreTipoProceso, a.Turno, CAST(a.DiaProduccion2024 AS DATE)
`;

/**
 * Libras producidas por contador IQF para un único día. Si hoy pertenece
 * al rango filtrado se muestra hoy; para consultas históricas se muestra
 * solamente la fecha final, nunca el acumulado de varios días.
 */
export const IQF_LIVE_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  CONVERT(varchar(10), @Dia, 23) AS Dia,
  a.LineaEquipoIQF COLLATE Modern_Spanish_CI_AS AS Linea,
  SUM(a.PesoLibras) AS Libras,
  CONVERT(varchar(5), MAX(a.FechaHoraTorre), 108) AS UltimaCaja,
  CASE
    WHEN @Dia = CAST(GETDATE() AS date)
      THEN DATEDIFF(MINUTE, MAX(a.FechaHoraTorre), GETDATE())
    ELSE -1
  END AS MinutosDesdeUltima
FROM dbo.AV_Produccion_Diaria_2020 AS a
LEFT JOIN dbo.OPship AS o
  ON a.OrdenProduccion = o.OrdenProduccion
WHERE a.DiaProduccion2024 >= @Dia
  AND a.DiaProduccion2024 < DATEADD(DAY, 1, @Dia)
  AND a.fkTipo < 4
  AND a.LineaEquipoIQF IS NOT NULL
GROUP BY a.LineaEquipoIQF
ORDER BY a.LineaEquipoIQF;
`;

/**
 * Catálogo reciente de contadores. Permite conservar la tarjeta en cero
 * cuando un IQF todavía no registra producción en el día consultado.
 */
export const IQF_LIVE_LINES_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT DISTINCT
  CONVERT(varchar(10), @Dia, 23) AS Dia,
  a.LineaEquipoIQF COLLATE Modern_Spanish_CI_AS AS Linea
FROM dbo.AV_Produccion_Diaria_2020 AS a
WHERE a.DiaProduccion2024 >= DATEADD(DAY, -60, @Dia)
  AND a.DiaProduccion2024 < DATEADD(DAY, 1, @Dia)
  AND a.fkTipo < 4
  AND a.LineaEquipoIQF IS NOT NULL
ORDER BY Linea;
`;

/**
 * Tipos de proceso considerados "pelado" (producto sin cáscara):
 * IQF PELADO, IQF COCINADO PELADO, BLOCK PELADO y FRESCO PELADO, según
 * el catálogo `TiposProceso` (los únicos con "PELAD" en su descripción).
 * Se reutiliza el mismo literal en las 4 consultas de esta sección.
 */
const PELADO_TIPOS_PROCESO = `'IQF PEELED', 'IQF COOK PEELED', 'PD BLOCK', 'FRESH PEELED'`;

/**
 * Libras peladas por estilo final, para un rango de fechas. Misma fuente
 * y filtros base que `NET_FROZEN_BY_PROCESS_QUERY` (libras netas),
 * acotado a los tipos de proceso pelado.
 */
export const PELADO_BY_STYLE_QUERY = `
SELECT
  a.EstiloFinal AS Estilo,
  a.Turno,
  SUM(a.PesoLibras) AS Libras
FROM dbo.AV_Produccion_Diaria_Resumen a
WHERE CAST(a.DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND a.VaEjecutivo = 1
  AND a.ProcesadaPlanta = 1
  AND a.fkTipo NOT IN (2, 4)
  AND a.NombreTipoProceso IN (${PELADO_TIPOS_PROCESO})
GROUP BY a.EstiloFinal, a.Turno
`;

/**
 * Misma definición que PELADO_BY_STYLE_QUERY, con el día de producción
 * incluido para agrupar por día o por mes (vista "Día" / "Mensual").
 */
export const PELADO_BY_STYLE_DAILY_QUERY = `
SELECT
  a.EstiloFinal AS Estilo,
  a.Turno,
  CAST(a.DiaProduccion2024 AS DATE) AS Dia,
  SUM(a.PesoLibras) AS Libras
FROM dbo.AV_Produccion_Diaria_Resumen a
WHERE CAST(a.DiaProduccion2024 AS DATE) BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND a.VaEjecutivo = 1
  AND a.ProcesadaPlanta = 1
  AND a.fkTipo NOT IN (2, 4)
  AND a.NombreTipoProceso IN (${PELADO_TIPOS_PROCESO})
GROUP BY a.EstiloFinal, a.Turno, CAST(a.DiaProduccion2024 AS DATE)
`;

/**
 * Libras peladas por estilo para el día en curso. Misma lógica y fuente
 * (torre/`FechaHoraTorre`) que `IQF_LIVE_QUERY`, agrupada por
 * `EstiloFinal` en vez de por línea IQF.
 */
export const PELADO_LIVE_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  CONVERT(varchar(10), @Dia, 23) AS Dia,
  a.EstiloFinal COLLATE Modern_Spanish_CI_AS AS Estilo,
  SUM(a.PesoLibras) AS Libras,
  CONVERT(varchar(5), MAX(a.FechaHoraTorre), 108) AS UltimaCaja,
  CASE
    WHEN @Dia = CAST(GETDATE() AS date)
      THEN DATEDIFF(MINUTE, MAX(a.FechaHoraTorre), GETDATE())
    ELSE -1
  END AS MinutosDesdeUltima
FROM dbo.AV_Produccion_Diaria_2020 AS a
WHERE a.DiaProduccion2024 >= @Dia
  AND a.DiaProduccion2024 < DATEADD(DAY, 1, @Dia)
  AND a.fkTipo < 4
  AND a.NombreTipoProceso IN (${PELADO_TIPOS_PROCESO})
  AND a.EstiloFinal IS NOT NULL AND a.EstiloFinal <> ''
GROUP BY a.EstiloFinal
ORDER BY a.EstiloFinal;
`;

/**
 * Catálogo reciente de estilos pelados. Igual que `IQF_LIVE_LINES_QUERY`,
 * permite mostrar la tarjeta en cero cuando un estilo no registra
 * producción en el día consultado.
 */
export const PELADO_LIVE_STYLES_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT DISTINCT
  CONVERT(varchar(10), @Dia, 23) AS Dia,
  a.EstiloFinal COLLATE Modern_Spanish_CI_AS AS Estilo
FROM dbo.AV_Produccion_Diaria_2020 AS a
WHERE a.DiaProduccion2024 >= DATEADD(DAY, -60, @Dia)
  AND a.DiaProduccion2024 < DATEADD(DAY, 1, @Dia)
  AND a.fkTipo < 4
  AND a.NombreTipoProceso IN (${PELADO_TIPOS_PROCESO})
  AND a.EstiloFinal IS NOT NULL AND a.EstiloFinal <> ''
ORDER BY Estilo;
`;

/**
 * Cantidad de órdenes de producción con lectura de pelado en los últimos
 * 15 minutos. No existe en la base un conteo real de personal en planta
 * (el módulo legado `CodigosBin`/`MovimientosInvProceso` está vacío), así
 * que se usa como aproximación indirecta de actividad en tiempo real.
 */
export const PELADO_LIVE_ORDENES_ACTIVAS_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT COUNT(*) AS OrdenesActivas
FROM (
  SELECT a.OrdenProduccion
  FROM dbo.AV_Produccion_Diaria_2020 AS a
  WHERE a.DiaProduccion2024 >= @Dia
    AND a.DiaProduccion2024 < DATEADD(DAY, 1, @Dia)
    AND a.fkTipo < 4
    AND a.NombreTipoProceso IN (${PELADO_TIPOS_PROCESO})
    AND a.OrdenProduccion IS NOT NULL AND a.OrdenProduccion <> ''
  GROUP BY a.OrdenProduccion
  HAVING DATEDIFF(MINUTE, MAX(a.FechaHoraTorre), GETDATE()) <= 15
) x;
`;

/**
 * Producción IQF con granularidad por línea/estilo/turno/día.
 * El servicio agrega estos grupos por día o por mes para calcular
 * libras por hora (suma de libras / suma de horas).
 */
export const IQF_DAILY_RATE_QUERY = `
SELECT
  pd.CategoriaLinea COLLATE Modern_Spanish_CI_AS AS Linea,
  pd.Turno,
  pd.DiaProduccion2024 AS Dia,
  SUM(pd.PesoLibras) AS TotalLibras,
  CAST(DATEDIFF(MINUTE, MIN(pd.FechaHoraTorre), MAX(pd.FechaHoraTorre)) AS FLOAT) / 60
    AS TiempoHorasDecimales
FROM dbo.AV_Produccion_Diaria_2020 pd
WHERE pd.DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND pd.fkTipo < 4
  AND pd.CategoriaLinea LIKE '%IQF%'
GROUP BY pd.CategoriaLinea, pd.EstiloFinal, pd.NombreEjecutivo, pd.NombreGrupo,
         pd.Turno, pd.DiaProduccion2024
HAVING DATEDIFF(MINUTE, MIN(pd.FechaHoraTorre), MAX(pd.FechaHoraTorre)) > 15

UNION ALL

SELECT
  ei.NombreIQF COLLATE Modern_Spanish_CI_AS AS Linea,
  pd.Turno,
  pd.DiaProduccion2024 AS Dia,
  SUM(pd.PesoLibras) AS TotalLibras,
  CAST(DATEDIFF(MINUTE, MIN(pd.FechaHoraTorre), MAX(pd.FechaHoraTorre)) AS FLOAT) / 60
    AS TiempoHorasDecimales
FROM dbo.AV_Produccion_Diaria_2020 pd
INNER JOIN dbo.EquiposIQF ei
  ON pd.EquipoIQF = ei.IDequipo
WHERE pd.DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND pd.fkTipo < 4
  AND pd.EquipoIQF > 0
GROUP BY ei.NombreIQF, pd.EstiloFinal, pd.NombreEjecutivo, pd.NombreGrupo,
         pd.Turno, pd.DiaProduccion2024
HAVING DATEDIFF(MINUTE, MIN(pd.FechaHoraTorre), MAX(pd.FechaHoraTorre)) > 15
`;
