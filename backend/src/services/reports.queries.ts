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
 * Día de producción más reciente con actividad IQF (la planta puede
 * cruzar medianoche, por eso no se asume la fecha calendario).
 */
export const IQF_LIVE_DAY_QUERY = `
SELECT MAX(pd.DiaProduccion2024) AS Dia
FROM dbo.AV_Produccion_Diaria_2020 pd
WHERE pd.fkTipo < 4
  AND pd.CategoriaLinea LIKE '%IQF%'
  AND pd.DiaProduccion2024 <= CAST(GETDATE() AS DATE)
`;

/**
 * Catálogo de líneas IQF principales (con actividad en los últimos 60
 * días). Estas tarjetas se muestran siempre, en cero si la línea no ha
 * producido en el día en curso. Las variantes de salmuera ("... SAL")
 * no van en el catálogo: su tarjeta aparece solo si registran cajas hoy.
 */
export const IQF_LIVE_LINES_QUERY = `
SELECT DISTINCT pd.CategoriaLinea COLLATE Modern_Spanish_CI_AS AS Linea
FROM dbo.AV_Produccion_Diaria_2020 pd
WHERE pd.DiaProduccion2024 >= DATEADD(DAY, -60, GETDATE())
  AND pd.fkTipo < 4
  AND pd.CategoriaLinea LIKE '%IQF%'
`;

/**
 * Contadores en tiempo real por línea IQF para un día de producción:
 * cada fila de la vista es una caja pesada en la torre (Seriales.Created
 * = FechaHoraTorre), por lo que el acumulado refleja la producción al
 * instante. Une las líneas directas y las salmueras asignadas a equipo
 * IQF (mismo universo de los reportes). Los tiempos se devuelven
 * formateados en SQL (hora local del servidor de BD) para evitar
 * desfases de zona horaria en el driver.
 */
export const IQF_LIVE_QUERY = `
SELECT
  x.Linea,
  COUNT(*) AS Cajas,
  SUM(x.PesoLibras) AS Libras,
  SUM(CASE WHEN x.FechaHoraTorre >= DATEADD(MINUTE, -60, GETDATE()) THEN x.PesoLibras ELSE 0 END)
    AS LibrasUltimaHora,
  CONVERT(VARCHAR(5), MIN(x.FechaHoraTorre), 108) AS PrimeraCaja,
  CONVERT(VARCHAR(5), MAX(x.FechaHoraTorre), 108) AS UltimaCaja,
  DATEDIFF(MINUTE, MIN(x.FechaHoraTorre), MAX(x.FechaHoraTorre)) AS MinutosTrabajados,
  DATEDIFF(MINUTE, MAX(x.FechaHoraTorre), GETDATE()) AS MinutosDesdeUltima
FROM (
  SELECT
    pd.CategoriaLinea COLLATE Modern_Spanish_CI_AS AS Linea,
    pd.PesoLibras,
    pd.FechaHoraTorre
  FROM dbo.AV_Produccion_Diaria_2020 pd
  WHERE pd.DiaProduccion2024 = @Dia
    AND pd.fkTipo < 4
    AND pd.CategoriaLinea LIKE '%IQF%'
    AND (@Turno IS NULL OR pd.Turno = @Turno)

  UNION ALL

  SELECT
    ei.NombreIQF COLLATE Modern_Spanish_CI_AS,
    pd.PesoLibras,
    pd.FechaHoraTorre
  FROM dbo.AV_Produccion_Diaria_2020 pd
  INNER JOIN dbo.EquiposIQF ei
    ON pd.EquipoIQF = ei.IDequipo
  WHERE pd.DiaProduccion2024 = @Dia
    AND pd.fkTipo < 4
    AND pd.EquipoIQF > 0
    AND (@Turno IS NULL OR pd.Turno = @Turno)
) x
GROUP BY x.Linea
ORDER BY x.Linea
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
