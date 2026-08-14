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
 * Libras peladas por sala, acumulado del día en curso (solo SALA #1 a
 * SALA #6). Combina las dos fuentes de pago de pelado: individual
 * (`PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET`, resuelta a sala vía
 * `DCP_LINEAS.ID_SALA` y a empleado vía `PES_EMPLEADOS_LINEAS`) y
 * grupal (`DCP_PagosGrupales` + `DCP_PagosGrupalesDetalle`, con las
 * libras del pago repartidas entre los empleados del grupo).
 */
export const PELADO_POR_SALA_HOY_QUERY = `
;WITH HoyDet AS (
    SELECT l.ID_SALA, d.LIBRAS, d.VALOR, k.ID_EMPLEADO
    FROM dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET d
    JOIN dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS h ON h.ID_ASIGNACION_LIBRAS_EMPLEADO = d.ID_ASIGNACION_LIBRAS_EMPLEADO
    JOIN dbo.DCP_LINEAS l ON l.ID_LINEA = d.ID_LINEA_ACTUAL
    JOIN dbo.PES_EMPLEADOS_LINEAS k ON k.ID_EMPLEADOS_LINEA = d.ID_EMPLEADO_LINEA
    WHERE h.FECHA = CAST(GETDATE() AS DATE)
      AND d.ANULADO = 0
),
GrupalCab AS (
    SELECT IdPagoPG, IdSala, Libras / NULLIF(CantEmpleados, 0) AS LibrasPorPersona
    FROM dbo.DCP_PagosGrupales
    WHERE Fecha = CAST(GETDATE() AS DATE)
),
GrupalHoy AS (
    SELECT c.IdSala AS ID_SALA, c.LibrasPorPersona AS LIBRAS, d.Valor AS VALOR, d.IdEmpleado AS ID_EMPLEADO
    FROM GrupalCab c
    JOIN dbo.DCP_PagosGrupalesDetalle d ON d.IdPagoPG = c.IdPagoPG
),
TodoHoy AS (
    SELECT * FROM HoyDet
    UNION ALL
    SELECT * FROM GrupalHoy
)
SELECT
  s.NOMBRE_SALA,
  ISNULL(SUM(t.LIBRAS), 0) AS LibrasPeladasHoy,
  ISNULL(SUM(t.VALOR), 0) AS PagoAcumuladoHoy,
  COUNT(DISTINCT t.ID_EMPLEADO) AS EmpleadosRegistrando
FROM dbo.PES_SALAS s
LEFT JOIN TodoHoy t ON t.ID_SALA = s.ID_SALA
WHERE s.NOMBRE_SALA IN ('SALA #1','SALA #2','SALA #3','SALA #4','SALA #5','SALA #6')
GROUP BY s.NOMBRE_SALA
`;

/**
 * Personas activas ahora mismo por sala: empleados distintos con registro
 * en los últimos 30 minutos (solo SALA #1 a SALA #6, misma restricción
 * que `PELADO_POR_SALA_HOY_QUERY`). Solo cubre pelado individual — los
 * pagos grupales no tienen hora de registro para medir actividad reciente.
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
