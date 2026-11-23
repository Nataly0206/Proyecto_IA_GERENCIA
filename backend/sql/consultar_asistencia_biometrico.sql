-- Ejecutar desde STBPayroll. Solo lectura; una fila por empleado.
-- Fecha calendario de Honduras; no aplica un corte de turno no confirmado.
DECLARE @Fecha date = '2026-11-23';

WITH Marcas AS (
    SELECT
        TRY_CONVERT(int, u.BADGENUMBER) AS ID_EMPLEADO,
        MIN(c.CHECKTIME) AS PRIMERA_MARCA,
        MAX(c.CHECKTIME) AS ULTIMA_MARCA,
        MIN(CASE WHEN c.CHECKTYPE = 'I' THEN c.CHECKTIME END) AS PRIMERA_ENTRADA,
        MAX(CASE WHEN c.CHECKTYPE = 'O' THEN c.CHECKTIME END) AS ULTIMA_SALIDA,
        COUNT(*) AS CANTIDAD_MARCAS
    FROM [172.16.50.215].[Marcador_Biometrico].[dbo].[CHECKINOUT] c
    INNER JOIN [172.16.50.215].[Marcador_Biometrico].[dbo].[USERINFO] u
        ON u.USERID = c.USERID
    WHERE c.CHECKTIME >= @Fecha
      AND c.CHECKTIME < DATEADD(DAY, 1, @Fecha)
    GROUP BY TRY_CONVERT(int, u.BADGENUMBER)
), Pagos AS (
    SELECT DISTINCT ID_EMPLEADO
    FROM dbo.V_PL_PAGOS_COLECTORES
    WHERE Fecha >= @Fecha
      AND Fecha < DATEADD(DAY, 1, @Fecha)
      AND PAGO > 0
)
SELECT
    e.ID_EMPLEADO,
    RTRIM(e.CODIGO_EMPLEADO) AS CODIGO_EMPLEADO,
    RTRIM(e.Nombre_Completo_Empleado) AS NOMBRE_EMPLEADO,
    e.TIPO_CONTRATO,
    @Fecha AS FECHA,
    m.PRIMERA_MARCA,
    m.ULTIMA_MARCA,
    m.PRIMERA_ENTRADA,
    m.ULTIMA_SALIDA,
    m.CANTIDAD_MARCAS,
    CASE WHEN m.PRIMERA_ENTRADA IS NOT NULL THEN 'A'
         ELSE 'REVISAR: MARCA SIN ENTRADA' END AS ASISTENCIA,
    CASE WHEN p.ID_EMPLEADO IS NOT NULL THEN 'SI' ELSE 'NO' END AS TIENE_PESADO_POSITIVO
FROM Marcas m
INNER JOIN dbo.RH_EMPLEADOS e ON e.ID_EMPLEADO = m.ID_EMPLEADO
LEFT JOIN Pagos p ON p.ID_EMPLEADO = m.ID_EMPLEADO
WHERE e.TIPO_CONTRATO = 'T'
  AND e.ID_TIPO_PLANILLA IN (
      SELECT ID_OBRA
      FROM dbo.PL_PARAMETROS_TIPO_PLANILLA
      WHERE ID_OBRA IS NOT NULL
  )
ORDER BY NOMBRE_EMPLEADO;

-- No se crean X a partir de la ausencia de marcas.
-- Una salida sin entrada hoy puede pertenecer al turno nocturno anterior.
-- PRIMERA/ULTIMA_MARCA no se interpretan automáticamente como entrada/salida.
-- BADGENUMBER identifica ID_EMPLEADO; USERID es la clave interna del biométrico.
