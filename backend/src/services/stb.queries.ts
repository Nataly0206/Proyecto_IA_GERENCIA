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
 * Libras peladas por Estilo y Talla, totalizadas sobre un rango de fechas
 * (sin desglose por día). El servicio agrega por Estilo o por Talla según
 * la dimensión elegida en el widget, sumando la otra dimensión.
 */
export const PELADO_BY_DIMENSION_QUERY = `
SELECT
  Turno,
  Estilo,
  Talla,
  SUM(libras) AS Libras
FROM dbo.V_PagosxPeladoIndividualPBI
WHERE Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY Turno, Estilo, Talla
`;

/**
 * Misma definición que PELADO_BY_DIMENSION_QUERY, con el día incluido
 * para agrupar por día o por mes (vista "Día" / "Mensual").
 */
export const PELADO_BY_DIMENSION_DAILY_QUERY = `
SELECT
  Turno,
  Fecha AS Dia,
  Estilo,
  Talla,
  SUM(libras) AS Libras
FROM dbo.V_PagosxPeladoIndividualPBI
WHERE Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY Turno, Fecha, Estilo, Talla
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
  a.FECHA AS Dia,
  D.NOMBRE AS Estilo,
  SUM(b.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS a
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET b
  ON a.ID_ASIGNACION_LIBRAS_EMPLEADO = b.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS c
  ON b.ID_ASIGNACION_RECIPIENTE_LINEA = c.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS D
  ON c.ID_ESTILO = D.ID_ESTILO
WHERE a.FECHA = @Dia
GROUP BY a.FECHA, D.NOMBRE
ORDER BY D.NOMBRE
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
 * Libras peladas por estilo, totalizadas sobre un rango de fechas.
 * Fuente: asignación real de libras por empleado
 * (`PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET`), igual que
 * `PELADO_LIBRAS_HOY_QUERY` — reemplaza la vista `V_PagosxPeladoIndividualPBI`,
 * que subcuenta libras respecto a las tablas base.
 * Equivalente a los subtotales por estilo de un `GROUP BY ROLLUP(Estilo, Fecha)`,
 * sin desglosar por día porque este reporte solo necesita el total del rango.
 */
export const PELADO_POR_ESTILO_RANGO_QUERY = `
SELECT
  D.NOMBRE AS Estilo,
  SUM(b.LIBRAS) AS Libras
FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS a
INNER JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET b
  ON a.ID_ASIGNACION_LIBRAS_EMPLEADO = b.ID_ASIGNACION_LIBRAS_EMPLEADO
LEFT JOIN dbo.PES_ASIGNACION_RECIPIENTES_LINEAS c
  ON b.ID_ASIGNACION_RECIPIENTE_LINEA = c.ID_ASIGNACION_RECIPIENTE_LINEA
LEFT JOIN dbo.PES_ESTILOS D
  ON c.ID_ESTILO = D.ID_ESTILO
WHERE a.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY D.NOMBRE
ORDER BY D.NOMBRE
`;

/**
 * Libras peladas por sala, acumulado del día en curso (todas las salas,
 * incluye las que no registran producción hoy). Fuente: asignación real
 * de libras por empleado (`PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET`),
 * resuelta a sala vía `DCP_LINEAS.ID_SALA`.
 */
export const PELADO_POR_SALA_HOY_QUERY = `
;WITH HoyDet AS (
    SELECT d.ID_LINEA_ACTUAL, d.LIBRAS, d.VALOR, d.ID_EMPLEADO_LINEA
    FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
    JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
    WHERE h.FECHA = CAST(GETDATE() AS DATE)
      AND d.ANULADO = 0
)
SELECT
  s.NOMBRE_SALA,
  ISNULL(SUM(hd.LIBRAS), 0) AS LibrasPeladasHoy,
  ISNULL(SUM(hd.VALOR), 0) AS PagoAcumuladoHoy,
  COUNT(DISTINCT hd.ID_EMPLEADO_LINEA) AS EmpleadosRegistrando
FROM dbo.PES_SALAS s
LEFT JOIN dbo.DCP_LINEAS l ON l.ID_SALA = s.ID_SALA
LEFT JOIN HoyDet hd ON hd.ID_LINEA_ACTUAL = l.ID_LINEA
GROUP BY s.NOMBRE_SALA
`;

/**
 * Personas activas ahora mismo por sala: empleados distintos con registro
 * en los últimos 30 minutos (todas las salas, incluye 0). Misma fuente y
 * join que `PELADO_POR_SALA_HOY_QUERY`, con ventana de tiempo adicional.
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
GROUP BY s.NOMBRE_SALA
`;
