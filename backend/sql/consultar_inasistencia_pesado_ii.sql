-- Consulta de solo lectura equivalente al SELECT activo de
-- dbo.PES_REPORTE_INASISTENCIA_PESADO_II. No crea ni altera objetos.
-- 0 incluye todos los departamentos / puestos, igual que el procedimiento.
DECLARE @id_departamento int = 0;
DECLARE @fecha_ini date = '2026-11-23';
DECLARE @fecha_fin date = '2026-11-23';
DECLARE @id_puesto int = 0;

SELECT
    d.ID_EMPLEADO,
    RTRIM(d.CODIGO_EMPLEADO) AS CODIGO_EMPLEADO,
    RTRIM(d.NOMBRE_EMPLEADO) AS NOMBRE_EMPLEADO,
    d.Fecha,
    d.Año,
    DATEPART(MONTH, d.Fecha) AS Numero_Mes,
    d.Mes,
    d.Dia,
    0 AS COLECTOR,
    ISNULL(pc.PAGO, 0) AS PESADO,
    0 AS FALTA_PRODUCTO,
    ISNULL(acc.CODIGO_ACCION, 'NULL') AS CODIGO_ACCION,
    CASE
        WHEN ISNULL(pc.PAGO, 0) > 0 OR sem.FECHA_DOMINGO IS NOT NULL THEN 'A'
        WHEN d.Fecha IS NULL THEN ''
        ELSE ISNULL(acc.NOMBRE_ACCION, 'X')
    END AS ASISTENCIA,
    d.NOMBRE_PUESTO,
    d.FECHA_INGRESO
FROM dbo.V_RH_EMPLEADOS_DIAS d
LEFT JOIN dbo.V_RH_ACCIONES_ASISTENCIA acc
    ON d.ID_EMPLEADO = acc.ID_EMPLEADO AND d.Fecha = acc.FECHA
LEFT JOIN dbo.V_PL_PAGOS_COLECTORES pc
    ON d.ID_EMPLEADO = pc.ID_EMPLEADO AND d.Fecha = pc.Fecha
LEFT JOIN dbo.PL_TITULOS_PLANILLAS_SEMANAS sem
    ON sem.FECHA_DOMINGO = d.Fecha
WHERE (@id_departamento = 0 OR d.ID_DEPARTAMENTO = @id_departamento)
    AND (@id_puesto = 0 OR d.ID_PUESTO = @id_puesto)
    AND d.Fecha BETWEEN IIF(d.FECHA_INGRESO < @fecha_ini, @fecha_ini, d.FECHA_INGRESO) AND @fecha_fin
ORDER BY d.ID_EMPLEADO, DATEPART(MONTH, d.Fecha), d.Dia;

-- El resultado reproduce las filas del SP; no elimina posibles duplicados
-- por empleado/fecha. El SP no filtra contrato temporal, planilla OBRA ni turno.
-- A es una marca del reporte basada en pago o fecha de domingo de planilla;
-- no siempre prueba presencia física. X no evalúa si el turno ya comenzó.
