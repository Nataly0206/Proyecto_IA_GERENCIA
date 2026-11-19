/** Alcance común de pelado: libras de todas las salas y personal identificado.
 * Incluye detalles marcados ANULADO para conciliar con el reporte operativo de total pelado. */
export const PELADO_INCLUDED_RECORDS = `d.LIBRAS>0 AND k.ID_EMPLEADO>0`;

/** Uniones que necesita PELADO_INCLUDED_RECORDS (alias d = detalle). */
export const PELADO_SCOPE_JOINS = `
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA = l.ID_SALA`;

/**
 * Consultas sobre STB_data (segunda base, misma instancia SQL Server que
 * PlantaEmpacadora). Fuente: vista `V_PagosxPeladoIndividualPBI`, pagos
 * y libras reales por empleado del proceso de pelado (columnas
 * confirmadas por inspección directa: Nombre_proceso, LineaProduccion,
 * IdDepartamentoRRHH, IdEmpleado, Identidad, NombreEmpleado, libras,
 * factor, HoraDesde, HoraHasta, Valor, Horas, Fecha, AplicaGrupal,
 * IdLineaProduccion, IdPagoDeduccion, IdProceso, Estilo, Talla,
 * cuentacontable, TipoCuenta, CLIENTE, Finca, laguna, Origen, Turno).
 */

/**
 * Libras y pago por empleado, por día y turno, dentro del rango de
 * fechas filtrado. Granularidad mínima necesaria para poder calcular
 * headcount real (`COUNT DISTINCT IdEmpleado`) por cualquier período
 * (total, día o mes) en el servicio, igual que el resto de los reportes
 * del dashboard agregan por período en TypeScript en vez de en SQL.
 */
export const PELADO_PERSONAL_DAILY_QUERY = `
SELECT
  Turno,
  Fecha AS Dia,
  IdEmpleado,
  SUM(libras) AS Libras,
  SUM(Valor) AS Valor
FROM dbo.V_PagosxPeladoIndividualPBI
WHERE Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY Turno, Fecha, IdEmpleado
`;

/**
 * Libras peladas por Estilo y Talla desde las mismas tablas base que el
 * total oficial por estilo. Esto evita el subconteo de la vista PBI.
 */
export const PELADO_BY_DIMENSION_QUERY = `
SELECT
  COALESCE(tr.Turno, 'Sin turno') AS Turno,
  COALESCE(NULLIF(LTRIM(RTRIM(e.NOMBRE)), ''), 'Sin estilo') AS Estilo,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  SUM(d.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS ar
  ON d.ID_ASIGNACION_RECIPIENTE_LINEA = ar.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS e ON ar.ID_ESTILO = e.ID_ESTILO
LEFT JOIN dbo.DCP_TALLAS t ON d.ID_TALLA = t.ID_TALLA
LEFT JOIN dbo.Cl_Turnos tr ON d.ID_TURNO = tr.IdTurno${PELADO_SCOPE_JOINS}
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY COALESCE(tr.Turno, 'Sin turno'),
  COALESCE(NULLIF(LTRIM(RTRIM(e.NOMBRE)), ''), 'Sin estilo'),
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla')
`;

/**
 * Insumos de lbs/hora/persona por talla, con la definición de Pelado por Sala:
 * por día y talla, horas = primera a última pesada y personas = empleados únicos.
 * HorasPersona suma horas × personas de cada día; el rendimiento del rango es
 * LibrasConHoras / HorasPersona (para un solo día: libras / horas / personas).
 * Los días con una sola pesada de la talla no tienen ventana y se excluyen.
 * La fila EsTotal=1 es la planta completa (misma definición que Pelado por Sala).
 */
export const PELADO_TALLA_RENDIMIENTO_QUERY = `
WITH Registros AS (
  SELECT h.FECHA AS Dia,
    COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
    k.ID_EMPLEADO AS IdEmpleado, d.LIBRAS AS Libras, d.HORA AS Hora
  FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
  JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
    ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
  LEFT JOIN dbo.DCP_TALLAS t ON d.ID_TALLA = t.ID_TALLA
  LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
  LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno = d.ID_TURNO
  WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
    AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno))) = @Turno)
), TallaDia AS (
  -- (Dia) agrega la fila de planta: ventana del día completo y personas únicas,
  -- para que el total no cuente dos veces a quien peló varias tallas.
  SELECT Dia, GROUPING(Talla) AS EsTotal, Talla, SUM(Libras) AS Libras, COUNT(DISTINCT IdEmpleado) AS Personas,
    CASE WHEN COUNT(Hora) > 1 THEN DATEDIFF(SECOND, MIN(Hora), MAX(Hora)) / 3600.0 ELSE 0 END AS Horas
  FROM Registros GROUP BY GROUPING SETS ((Dia, Talla), (Dia))
)
SELECT EsTotal, Talla,
  SUM(CASE WHEN Horas > 0 AND Personas > 0 THEN Libras ELSE 0 END) AS LibrasConHoras,
  SUM(CASE WHEN Horas > 0 THEN Horas * Personas ELSE 0 END) AS HorasPersona
FROM TallaDia GROUP BY EsTotal, Talla
`;

/**
 * Misma definición que PELADO_BY_DIMENSION_QUERY, con el día incluido
 * para agrupar por día o por mes (vista "Día" / "Mensual").
 */
export const PELADO_BY_DIMENSION_DAILY_QUERY = `
SELECT
  COALESCE(tr.Turno, 'Sin turno') AS Turno,
  h.FECHA AS Dia,
  COALESCE(NULLIF(LTRIM(RTRIM(e.NOMBRE)), ''), 'Sin estilo') AS Estilo,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  SUM(d.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS ar
  ON d.ID_ASIGNACION_RECIPIENTE_LINEA = ar.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS e ON ar.ID_ESTILO = e.ID_ESTILO
LEFT JOIN dbo.DCP_TALLAS t ON d.ID_TALLA = t.ID_TALLA
LEFT JOIN dbo.Cl_Turnos tr ON d.ID_TURNO = tr.IdTurno${PELADO_SCOPE_JOINS}
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY COALESCE(tr.Turno, 'Sin turno'), h.FECHA,
  COALESCE(NULLIF(LTRIM(RTRIM(e.NOMBRE)), ''), 'Sin estilo'),
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla')
`;

/**
 * Libras peladas por estilo, siempre del día en curso (GETDATE en SQL,
 * independiente del filtro de fechas del dashboard). Fuente: asignación
 * real de libras por empleado (`PES_ASIGNACION_LIBRAS_EMPLEADOS` +
 * `_DET`), con el estilo resuelto vía la línea/recipiente asignado.
 */
export const PELADO_LIBRAS_HOY_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  h.FECHA AS Dia,
  e.NOMBRE AS Estilo,
  SUM(d.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS c
  ON d.ID_ASIGNACION_RECIPIENTE_LINEA = c.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS e
  ON c.ID_ESTILO = e.ID_ESTILO${PELADO_SCOPE_JOINS}
WHERE h.FECHA = @Dia
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY h.FECHA, e.NOMBRE
ORDER BY e.NOMBRE
`;

/**
 * Catálogo de estilos con actividad reciente (últimos 60 días). Permite
 * mostrar la card de un estilo en 0 cuando todavía no registra libras en
 * el día actual, igual que `PELADO_LIVE_STYLES_QUERY` para IQF en vivo.
 */
export const PELADO_LIBRAS_HOY_ESTILOS_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT DISTINCT D.NOMBRE AS Estilo
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS a
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET b
  ON a.ID_ASIGNACION_LIBRAS_EMPLEADO = b.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS c
  ON b.ID_ASIGNACION_RECIPIENTE_LINEA = c.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS D
  ON c.ID_ESTILO = D.ID_ESTILO
WHERE a.FECHA >= DATEADD(DAY, -60, @Dia)
  AND a.FECHA < DATEADD(DAY, 1, @Dia)
  AND D.NOMBRE IS NOT NULL
ORDER BY D.NOMBRE
`;

/**
 * Respaldo de `PELADO_LIBRAS_HOY_ESTILOS_QUERY` sin ventana de fechas:
 * se usa solo cuando los últimos 60 días no traen ningún estilo (por
 * ejemplo, una planta recién arrancada o una base de prueba sin datos
 * recientes), para que las cards nunca queden vacías.
 */
export const PELADO_LIBRAS_HOY_ESTILOS_FALLBACK_QUERY = `
SELECT DISTINCT D.NOMBRE AS Estilo
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS a
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET b
  ON a.ID_ASIGNACION_LIBRAS_EMPLEADO = b.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS c
  ON b.ID_ASIGNACION_RECIPIENTE_LINEA = c.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS D
  ON c.ID_ESTILO = D.ID_ESTILO
WHERE D.NOMBRE IS NOT NULL
ORDER BY D.NOMBRE
`;

/**
 * Libras peladas por talla, siempre del día en curso (GETDATE en SQL,
 * independiente del filtro de fechas del dashboard). Misma fuente y
 * mismo criterio que `PELADO_LIBRAS_HOY_QUERY` (asignación real de libras
 * por empleado), con la talla resuelta vía `DCP_TALLAS.NOMBRE_TALLA` — así
 * el total por talla del día concilia con el total por estilo del día.
 */
export const PELADO_LIBRAS_HOY_TALLA_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  SUM(d.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.DCP_TALLAS t
  ON t.ID_TALLA = d.ID_TALLA${PELADO_SCOPE_JOINS}
WHERE h.FECHA = @Dia
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla')
ORDER BY Libras DESC
`;

/** Ritmo reciente del equipo: libras reales en una ventana móvil de 60 minutos.
 * Usa fecha + hora del detalle, excluye anulados y no extrapola ventanas parciales.
 * Al cruzar medianoche también incluye los registros de la fecha anterior.
 */
export const PELADO_RITMO_ULTIMA_HORA_QUERY = `
DECLARE @Hasta datetime = GETDATE();
DECLARE @Desde datetime = DATEADD(MINUTE, -60, @Hasta);
SELECT ISNULL(SUM(d.LIBRAS), 0) AS Libras,
  CONVERT(varchar(19), @Desde, 126) AS Desde,
  CONVERT(varchar(19), @Hasta, 126) AS Hasta
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
CROSS APPLY (SELECT DATEADD(SECOND, DATEDIFF(SECOND, 0, d.HORA), CAST(h.FECHA AS datetime)) AS Marca) r${PELADO_SCOPE_JOINS}
WHERE h.FECHA BETWEEN CAST(@Desde AS date) AND CAST(@Hasta AS date)
  AND ${PELADO_INCLUDED_RECORDS}
  AND r.Marca > @Desde AND r.Marca <= @Hasta
`;

/**
 * Libras peladas por sala desde exactamente el mismo detalle que el total
 * oficial por estilo. Las uniones son LEFT para conservar registros sin
 * sala/empleado catalogado bajo "Sin sala".
 */
export const PELADO_POR_SALA_HOY_QUERY = `
SELECT
  COALESCE(s.NOMBRE_SALA, 'Sin sala') AS NOMBRE_SALA,
  SUM(d.LIBRAS) AS LibrasPeladasHoy,
  SUM(d.VALOR) AS PagoAcumuladoHoy,
  COUNT(DISTINCT k.ID_EMPLEADO) AS EmpleadosRegistrando,
  CASE WHEN COUNT(d.HORA) > 1
    THEN DATEDIFF(SECOND, MIN(d.HORA), MAX(d.HORA)) / 3600.0
    ELSE 0 END AS HorasTrabajadas
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA = l.ID_SALA
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
WHERE h.FECHA = CAST(GETDATE() AS DATE)
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY COALESCE(s.NOMBRE_SALA, 'Sin sala')
`;

/** Distribución de tallas por sala, con la misma fuente y fecha que la actividad. */
export const PELADO_TALLAS_POR_SALA_HOY_QUERY = `
SELECT COALESCE(s.NOMBRE_SALA, 'Sin sala') AS NOMBRE_SALA,
  t.NOMBRE_TALLA AS Talla, SUM(d.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA = l.ID_SALA
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA = d.ID_TALLA
WHERE h.FECHA = CAST(GETDATE() AS DATE)
  AND ${PELADO_INCLUDED_RECORDS}
GROUP BY COALESCE(s.NOMBRE_SALA, 'Sin sala'), t.NOMBRE_TALLA
`;

/**
 * Horas trabajadas en planta por día (desde el primer hasta el último
 * registro de pelado de ese día), dentro del rango de fechas filtrado.
 * A diferencia de `PELADO_POR_SALA_DIARIO_QUERY.Horas` (suma de la
 * ventana de cada sala), esto es la ventana de la planta completa —
 * la métrica que corresponde a un reporte que no está desglosado por
 * sala, como "Libras Peladas por Estilo — Diario".
 */
export const PELADO_HORAS_TRABAJADAS_DIA_QUERY = `
SELECT h.FECHA AS Dia,
  CASE WHEN COUNT(d.HORA) > 1
    THEN DATEDIFF(SECOND, MIN(d.HORA), MAX(d.HORA)) / 3600.0
    ELSE 0 END AS Horas
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno = d.ID_TURNO
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno))) = @Turno)
GROUP BY h.FECHA
`;

/** Actividad histórica por día, semana o mes; el umbral se aplica por sala y fecha. */
export const PELADO_POR_SALA_DIARIO_QUERY = `
WITH Registros AS (
  SELECT h.FECHA AS Dia,
    COALESCE(s.NOMBRE_SALA, 'Sin sala') AS Sala,
    k.ID_EMPLEADO AS IdEmpleado,
    d.LIBRAS AS Libras,
    d.HORA AS Hora
  FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
  JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
    ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
  LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
  LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA = l.ID_SALA
  LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
  LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno = d.ID_TURNO
  WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND ${PELADO_INCLUDED_RECORDS}
    AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno))) = @Turno)
), SalaDia AS (
  SELECT Dia, Sala, SUM(Libras) AS Libras,
    CASE WHEN COUNT(Hora) > 1
      THEN DATEDIFF(SECOND, MIN(Hora), MAX(Hora)) / 3600.0
      ELSE 0 END AS Horas
  FROM Registros
  GROUP BY Dia, Sala
), SalasIncluidas AS (
  SELECT Dia, Sala, Libras, Horas FROM SalaDia
  WHERE @MinHours IS NULL OR Horas > @MinHours
), Periodos AS (
  SELECT s.*,
    CASE WHEN @Periodo = 'mes' THEN DATEADD(MONTH, DATEDIFF(MONTH, 0, Dia), 0)
      WHEN @Periodo = 'semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', Dia) % 7), CAST(Dia AS datetime))
      ELSE CAST(Dia AS datetime) END AS Periodo
  FROM SalasIncluidas s
), Totales AS (
  SELECT Periodo AS Dia, SUM(Libras) AS Libras
  FROM Periodos GROUP BY Periodo
), Personas AS (
  SELECT s.Periodo AS Dia, COUNT(DISTINCT r.IdEmpleado) AS Personas
  FROM Registros r
  JOIN Periodos s ON s.Dia = r.Dia AND s.Sala = r.Sala
  GROUP BY s.Periodo
), PlantaDia AS (
  -- Ventana real del día (primer a último registro entre las salas
  -- incluidas), NO la suma de la ventana de cada sala — un día tiene
  -- como máximo 24 horas aunque varias salas trabajen en paralelo.
  SELECT r.Dia,
    CASE WHEN COUNT(r.Hora) > 1
      THEN DATEDIFF(SECOND, MIN(r.Hora), MAX(r.Hora)) / 3600.0
      ELSE 0 END AS Horas
  FROM Registros r
  JOIN SalasIncluidas s ON s.Dia = r.Dia AND s.Sala = r.Sala
  GROUP BY r.Dia
), PlantaPeriodo AS (
  SELECT p.Periodo AS Dia, SUM(pd.Horas) AS Horas
  FROM PlantaDia pd
  JOIN (SELECT DISTINCT Dia, Periodo FROM Periodos) p ON p.Dia = pd.Dia
  GROUP BY p.Periodo
)
SELECT t.Dia, ISNULL(p.Personas, 0) AS Personas, t.Libras,
  ISNULL(pd.Horas, 0) AS Horas,
  CASE WHEN ISNULL(pd.Horas, 0) > 0 THEN t.Libras / pd.Horas ELSE 0 END AS LibrasPorHoraPromedio
FROM Totales t
LEFT JOIN Personas p ON p.Dia = t.Dia
LEFT JOIN PlantaPeriodo pd ON pd.Dia = t.Dia
ORDER BY t.Dia
`;

/**
 * Mensual: lee el detalle una vez y materializa por empleado, sala y día.
 * Conserva los extremos y la cantidad de horas para reconstruir exactamente
 * las ventanas diarias, el umbral por sala/día y las personas únicas del mes.
 * Evita expandir varias veces los CTE sobre todo un año de registros.
 */
export const PELADO_POR_SALA_MENSUAL_QUERY = `
SET NOCOUNT ON;

SELECT h.FECHA AS Dia,
  COALESCE(s.NOMBRE_SALA, 'Sin sala') AS Sala,
  k.ID_EMPLEADO AS IdEmpleado,
  SUM(d.LIBRAS) AS Libras,
  MIN(d.HORA) AS PrimeraHora,
  MAX(d.HORA) AS UltimaHora,
  COUNT_BIG(d.HORA) AS RegistrosConHora
INTO #PeladoEmpleadoDia
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA = l.ID_SALA
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno = d.ID_TURNO
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND ${PELADO_INCLUDED_RECORDS}
  AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno))) = @Turno)
GROUP BY h.FECHA, COALESCE(s.NOMBRE_SALA, 'Sin sala'), k.ID_EMPLEADO
OPTION (RECOMPILE);

CREATE CLUSTERED INDEX IX_PeladoEmpleadoDia_Dia ON #PeladoEmpleadoDia (Dia);

;WITH SalaDia AS (
  SELECT Dia, Sala, SUM(Libras) AS Libras,
    MIN(PrimeraHora) AS PrimeraHora, MAX(UltimaHora) AS UltimaHora,
    SUM(RegistrosConHora) AS RegistrosConHora,
    CASE WHEN SUM(RegistrosConHora) > 1
      THEN DATEDIFF(SECOND, MIN(PrimeraHora), MAX(UltimaHora)) / 3600.0
      ELSE 0 END AS Horas
  FROM #PeladoEmpleadoDia
  GROUP BY Dia, Sala
)
SELECT *, DATEADD(MONTH, DATEDIFF(MONTH, 0, Dia), 0) AS Mes
INTO #PeladoSalasIncluidas
FROM SalaDia
WHERE @MinHours IS NULL OR Horas > @MinHours;

CREATE CLUSTERED INDEX IX_PeladoSalasIncluidas_Dia ON #PeladoSalasIncluidas (Dia);

;WITH PlantaDia AS (
  SELECT Dia, Mes, SUM(Libras) AS Libras,
    CASE WHEN SUM(RegistrosConHora) > 1
      THEN DATEDIFF(SECOND, MIN(PrimeraHora), MAX(UltimaHora)) / 3600.0
      ELSE 0 END AS Horas
  FROM #PeladoSalasIncluidas
  GROUP BY Dia, Mes
), Totales AS (
  SELECT Mes, SUM(Libras) AS Libras, SUM(Horas) AS Horas
  FROM PlantaDia GROUP BY Mes
), Personas AS (
  SELECT s.Mes, COUNT(DISTINCT e.IdEmpleado) AS Personas
  FROM #PeladoEmpleadoDia e
  JOIN #PeladoSalasIncluidas s ON s.Dia = e.Dia AND s.Sala = e.Sala
  GROUP BY s.Mes
)
SELECT t.Mes AS Dia, ISNULL(p.Personas, 0) AS Personas, t.Libras,
  t.Horas,
  CASE WHEN t.Horas > 0 THEN t.Libras / t.Horas ELSE 0 END AS LibrasPorHoraPromedio
FROM Totales t
LEFT JOIN Personas p ON p.Mes = t.Mes
ORDER BY t.Mes;

DROP TABLE #PeladoSalasIncluidas;
DROP TABLE #PeladoEmpleadoDia;
`;

/**
 * Ventana en vivo por sala (últimos 30 minutos), solo SALA #1 a SALA #6 y
 * misma restricción que `PELADO_POR_SALA_HOY_QUERY`. Solo cubre pelado
 * individual — los pagos grupales no tienen hora de registro para medir
 * actividad reciente. El servicio solo consume `LibrasUltimos30Min`;
 * `PersonasActivas` ya no se usa (la columna "Personas activas" ahora sale
 * de los pagos de destajo del día, ver `getPeladoPorSala`).
 */
export const PELADO_POR_SALA_ACTIVOS_QUERY = `
;WITH Activos AS (
    SELECT d.ID_LINEA_ACTUAL, d.LIBRAS, d.ID_EMPLEADO_LINEA
    FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
    JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
    WHERE h.FECHA = CAST(GETDATE() AS DATE)
      AND d.ANULADO = 0
      AND DATEADD(SECOND, DATEDIFF(SECOND, 0, d.HORA), CAST(h.FECHA AS DATETIME)) >= DATEADD(MINUTE, -30, GETDATE())
)
SELECT
  s.NOMBRE_SALA,
  ISNULL(COUNT(DISTINCT a.ID_EMPLEADO_LINEA), 0) AS PersonasActivas,
  ISNULL(SUM(a.LIBRAS), 0) AS LibrasUltimos30Min
FROM dbo.PES_SALAS s
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_SALA = s.ID_SALA
LEFT JOIN Activos a ON a.ID_LINEA_ACTUAL = l.ID_LINEA
WHERE s.NOMBRE_SALA IN ('SALA #1','SALA #2','SALA #3','SALA #4','SALA #5','SALA #6')
GROUP BY s.NOMBRE_SALA
`;

/**
 * Minutos transcurridos del día de pelado: desde el primer registro de
 * destajo individual de hoy (toda la planta) hasta ahora. El servicio lo
 * divide entre 60 para obtener las horas usadas como divisor de la
 * columna "Libras por hora" por sala. El pelado grupal no tiene hora de
 * registro, por eso solo cuenta el detalle individual para el arranque.
 */
export const PELADO_MINUTOS_TRANSCURRIDOS_HOY_QUERY = `
SELECT
  DATEDIFF(
    MINUTE,
    MIN(DATEADD(SECOND, DATEDIFF(SECOND, 0, d.HORA), CAST(h.FECHA AS DATETIME))),
    GETDATE()
  ) AS MinutosTranscurridos
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO${PELADO_SCOPE_JOINS}
WHERE h.FECHA = CAST(GETDATE() AS DATE)
  AND ${PELADO_INCLUDED_RECORDS}
`;

/** Personas con libras positivas por talla y jornada; IDs permiten deduplicar tallas agrupadas. */
export const PELADO_TALLA_PERSONAS_DIA_QUERY = `
SELECT h.FECHA Dia, COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') Talla,
  k.ID_EMPLEADO IdEmpleado,
  CONVERT(varchar(8),MIN(d.HORA),108) PrimeraHora,
  CONVERT(varchar(8),MAX(d.HORA),108) UltimaHora, COUNT(d.HORA) RegistrosHora
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
  ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA=d.ID_TALLA
LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno=d.ID_TURNO
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.LIBRAS>0
  AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno)))=@Turno)
GROUP BY h.FECHA,t.NOMBRE_TALLA,k.ID_EMPLEADO
`;

/** Rendimiento real de la vista usada por el reporte: TRABAJADOS contiene horas decimales. */
export const PELADO_TALLA_PERSONAL_RENDIMIENTO_QUERY = `
SET NOCOUNT ON;
DECLARE @Captura datetime=GETDATE(), @CapturaUtc datetime2=SYSUTCDATETIME();
SELECT h.FECHA Dia,h.IdLineaProduccion,k.ID_EMPLEADO IdEmpleado,d.ID_TALLA,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)),''),'Sin talla') Talla,
  d.ID_TURNO,d.MANUAL,d.HORA,d.LIBRAS,d.VALOR,COALESCE(s.NOMBRE_SALA,'Sin sala') Sala
INTO #PeladoDetalleIncluido
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA=d.ID_TALLA
LEFT JOIN dbo.Cl_Turnos tr ON tr.IdTurno=d.ID_TURNO
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ${PELADO_INCLUDED_RECORDS}
  AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(tr.Turno)))=@Turno);
DELETE d FROM #PeladoDetalleIncluido d
JOIN (
  SELECT Dia,Sala,CASE WHEN COUNT(HORA)>1 THEN DATEDIFF(SECOND,MIN(HORA),MAX(HORA))/3600.0 ELSE 0 END Horas
  FROM #PeladoDetalleIncluido GROUP BY Dia,Sala
) s ON s.Dia=d.Dia AND s.Sala=d.Sala
WHERE @MinHours IS NOT NULL AND s.Horas<=@MinHours;
CREATE CLUSTERED INDEX IX_PeladoDetalleIncluido ON #PeladoDetalleIncluido (Dia,IdEmpleado,ID_TALLA);

;WITH Resultados AS (
SELECT 'PBI' Fuente,v.Talla,v.IdEmpleado,SUM(v.libras) Libras,
  SUM(CASE WHEN v.TRABAJADOS>0 THEN v.TRABAJADOS ELSE 0 END) HorasTrabajadas,
  SUM(CASE WHEN v.TRABAJADOS IS NULL OR v.TRABAJADOS<=0 THEN 1 ELSE 0 END) SinHoras,
  CAST(NULL AS varchar(200)) Sala,CAST(0 AS decimal(18,2)) Valor,
  CAST(NULL AS varchar(8)) PrimeraHora,CAST(NULL AS varchar(8)) UltimaHora,
  CAST(0 AS decimal(18,2)) LibrasRecientes,CAST(0 AS int) Personas
FROM dbo.V_PagosxPeladoIndividualPBI v
WHERE v.Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final AND v.libras>0 AND v.IdEmpleado>0
  AND (@Turno IS NULL OR UPPER(LTRIM(RTRIM(v.Turno)))=@Turno)
  AND EXISTS (
    SELECT 1 FROM #PeladoDetalleIncluido d
    WHERE d.Dia=v.Fecha AND d.IdEmpleado=v.IdEmpleado AND d.ID_TALLA=v.ID_TALLA
      AND d.IdLineaProduccion=v.IdLineaProduccion AND d.ID_TURNO=v.IdTurno
      AND d.MANUAL=CASE WHEN UPPER(v.MANUAL)='MANUAL' THEN 1 ELSE 0 END
      AND ((d.HORA BETWEEN v.HoraDesde AND v.HoraHasta) OR (d.HORA IS NULL AND v.HoraDesde IS NULL))
  )
GROUP BY v.Talla,v.IdEmpleado
UNION ALL
SELECT 'BASE',Talla,IdEmpleado,SUM(LIBRAS),0,0,NULL,0,NULL,NULL,0,0
FROM #PeladoDetalleIncluido GROUP BY Talla,IdEmpleado
UNION ALL
SELECT 'SALA',NULL,0,SUM(LIBRAS),
  CASE WHEN COUNT(HORA)>1 THEN DATEDIFF(SECOND,MIN(HORA),MAX(HORA))/3600.0 ELSE 0 END,
  0,Sala,SUM(VALOR),CONVERT(varchar(8),MIN(HORA),108),CONVERT(varchar(8),MAX(HORA),108),
  SUM(CASE WHEN DATEADD(SECOND,DATEDIFF(SECOND,0,HORA),CAST(Dia AS datetime))>=DATEADD(MINUTE,-30,@Captura) THEN LIBRAS ELSE 0 END),
  COUNT(DISTINCT IdEmpleado)
FROM #PeladoDetalleIncluido GROUP BY Sala
UNION ALL
SELECT 'TALLA_SALA',Talla,0,SUM(LIBRAS),0,0,Sala,0,NULL,NULL,0,0
FROM #PeladoDetalleIncluido GROUP BY Sala,Talla
)
SELECT *,CONVERT(varchar(27),@CapturaUtc,126)+'Z' Actualizado,CONVERT(varchar(8),@Captura,108) HoraCaptura
FROM Resultados;
DROP TABLE #PeladoDetalleIncluido;
`;

/** Arranque de la actividad con el mismo alcance de salas incluidas. */
export const PELADO_SALAS_MINUTOS_HOY_QUERY = `
SELECT DATEDIFF(MINUTE,MIN(DATEADD(SECOND,DATEDIFF(SECOND,0,d.HORA),CAST(h.FECHA AS datetime))),GETDATE()) MinutosTranscurridos
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h
JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d ON d.ID_ASIGNACION_LIBRAS_EMPLEADO=h.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA=d.ID_EMPLEADO_LINEA
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_LINEA=d.ID_LINEA_ACTUAL
LEFT JOIN dbo.PES_SALAS s ON s.ID_SALA=l.ID_SALA
WHERE h.FECHA=CAST(GETDATE() AS date) AND ${PELADO_INCLUDED_RECORDS}
`;
