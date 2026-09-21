/**
 * Consultas SQL de los módulos de proceso: Recepción, Descabezado y
 * Clasificado (fuente STB_data) y Exportaciones y Compra de Materia
 * Prima (fuente PlantaEmpacadora).
 *
 * Mismo criterio que `reports.queries.ts` / `stb.queries.ts`: el SQL
 * agrega a la granularidad mínima necesaria y el servicio termina de
 * consolidar por período (día/mes) y de filtrar por turno en TypeScript.
 *
 * Columnas confirmadas por inspección directa de la base (2026-08):
 * - Recepción: `R_REMISIONES_PLANTA` + `R_REMISIONES_PLANTA_DETALLE`
 *   (`LIBRAS`, `PROCESADO`), finca vía `R_Lagunas` → `R_Fincas`.
 *   `R_PesadoRecepcion.LibrasNetas` dejó de poblarse en 2026-03, por eso
 *   se suman las libras del detalle de bins.
 * - Descabezado: `DES_ASIG_LBRS_EMPLEADOS` (+ `_DET`) — libras, pago a
 *   destajo (`VALOR`) y talla (`ID_TALLA` → `DCP_TALLAS.NOMBRE_TALLA`, el
 *   "gramaje"). Personas vía `DES_EMPLEADOS_LINEAS`. Sin desglose por
 *   turno. `Des_PesadoCola.Fecha` está vacío, no sirve.
 * - Clasificado: `CL_LLENADO_RECIPIENTES` (+ `_D`), talla vía `DCP_TALLAS`,
 *   máquina vía `ID_TANQUE` → `CL_TANQUES`; el ID 0 queda sin asignar.
 *   Inventario disponible en
 *   `CL_InventarioClasificado` (`EnInventario=1 AND Transferido=0 AND
 *   Procesado=0`).
 * - Exportaciones: consulta reducida sobre `Envios`, `Masteres`, `Seriales`,
 *   `OrdenesProduccion`, `AV_Items` y `AV_LotesRemision`; evita recorrer las
 *   muchas uniones no utilizadas de la vista general `AV_Envios`.
 * - Compra MP: vista `AV_OrdenesCompraClientes` (avance de órdenes por
 *   cliente, `AnillosXMaster`, `KGFaltantes`), tabla `OrdenesCompra`
 *   (`FechaOrdenCompra` para el conteo de órdenes de la semana) y vista
 *   `AV_MateriaPrima` (materia prima por propietario/proveedor;
 *   `DiaProduccion2024`, `NombrePropietario`, `NombreGrupo`, `Talla` =
 *   gramaje del camarón recibido, `PesoLibras`, `SubTotal`).
 */

/* ================================================================== */
/* RECEPCIÓN (STB_data)                                                */
/* ================================================================== */

/** Libras recibidas hoy, en la semana y en el mes en curso, más el saldo
 * global pendiente de procesar. */
export const RECEPCION_RESUMEN_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Dia) % 7), @Dia);
DECLARE @PrimerDiaMes date = DATEADD(DAY, 1 - DAY(@Dia), @Dia);

SELECT
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.FECHA_REMISION = @Dia AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS LibrasRecibidasHoy,
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.FECHA_REMISION BETWEEN @Lunes AND @Dia
      AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS LibrasRecibidasSemana,
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.FECHA_REMISION BETWEEN @PrimerDiaMes AND @Dia
      AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS LibrasRecibidasMes,
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.ANULADA = 0 AND rp.RECHAZADA = 0 AND rp.CERRADA = 0 AND ISNULL(d.PROCESADO, 0) = 0) AS LibrasPendientesProcesar
`;

/**
 * Detalle de remisiones recibidas en el rango: una fila por remisión, finca
 * y laguna. Fuente: vista `dbo.RemisionesPlantaPBI`, la misma que alimenta
 * el tablero de Power BI (libras de remisión, cola, cabeza y basura). La
 * vista ya filtra internamente `FechaRemision > 2025-01-01`.
 *
 * `LibrasRemision` se suma porque la vista abre la fila por el indicador
 * `Procesado` (una remisión-laguna puede aparecer como procesada y no
 * procesada); las libras de pesado (`LibrasCola`, `LibrasCabeza`) y de
 * basura son constantes por remisión-laguna, así que se toman con MAX para
 * no duplicarlas. Los rendimientos cola/recepción ("finca") y cola/planta
 * se calculan en el servicio a partir de estos totales.
 */
export const RECEPCION_REMISIONES_QUERY = `
SELECT
  v.FechaRemision AS Fecha,
  v.IdRemisionPlanta AS Remision,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Nombre)), ''), 'Sin cliente') AS Cliente,
  COALESCE(NULLIF(LTRIM(RTRIM(v.CodigoFinca)), ''), '') AS CodigoFinca,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Finca)), ''), '') AS Finca,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Laguna)), ''), '') AS Laguna,
  SUM(v.LibrasRemision) AS LibrasRemision,
  MAX(ISNULL(v.LibrasBasura, 0)) AS LibrasBasura,
  MAX(ISNULL(v.LibrasCola, 0)) AS LibrasCola,
  MAX(ISNULL(v.LibrasCabeza, 0)) AS LibrasCabeza
FROM dbo.RemisionesPlantaPBI v
WHERE v.FechaRemision BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY v.FechaRemision, v.IdRemisionPlanta,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Nombre)), ''), 'Sin cliente'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.CodigoFinca)), ''), ''),
  COALESCE(NULLIF(LTRIM(RTRIM(v.Finca)), ''), ''),
  COALESCE(NULLIF(LTRIM(RTRIM(v.Laguna)), ''), '')
`;

/* ================================================================== */
/* DESCABEZADO (STB_data)                                              */
/* ================================================================== */

/** Libras descabezadas hoy, semana y mes, empleados distintos y rendimiento de hoy. */
export const DESCABEZADO_RESUMEN_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Dia) % 7), @Dia);
DECLARE @PrimerDiaMes date = DATEADD(DAY, 1 - DAY(@Dia), @Dia);
DECLARE @HorasHoy float = (
  SELECT DATEDIFF(SECOND, MIN(CAST(d.HORA AS time)), MAX(CAST(d.HORA AS time))) / 3600.0
    FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
    JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
   WHERE h.FECHA = @Dia AND ISNULL(d.ANULADO, 0) = 0
);
DECLARE @CabezasHoy float = (
  SELECT ISNULL(SUM(d.LIBRAS), 0)
  FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
  JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
  WHERE h.FECHA = @Dia AND ISNULL(d.ANULADO, 0) = 0
);

;WITH det AS (
  SELECT h.FECHA, d.LIBRAS, el.ID_EMPLEADO
    FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
    JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
    LEFT JOIN dbo.DES_EMPLEADOS_LINEAS el ON el.ID_EMPLEADO_LINEA = d.ID_EMPLEADO_LINEA
   WHERE h.FECHA BETWEEN @PrimerDiaMes AND @Dia AND ISNULL(d.ANULADO, 0) = 0
)
SELECT
  (SELECT ISNULL(SUM(LIBRAS), 0) FROM det WHERE FECHA = @Dia) AS LibrasDescabezadasDia,
  (SELECT ISNULL(SUM(LIBRAS), 0) FROM det WHERE FECHA BETWEEN @Lunes AND @Dia) AS LibrasDescabezadasSemana,
  (SELECT ISNULL(SUM(LIBRAS), 0) FROM det) AS LibrasDescabezadasMes,
  (SELECT COUNT(DISTINCT ID_EMPLEADO) FROM det WHERE FECHA = @Dia) AS PersonasDia,
  CASE WHEN ISNULL(@HorasHoy, 0) > 0 THEN @CabezasHoy / @HorasHoy ELSE 0 END AS LibrasPromedioPorHora
`;

/**
 * Detalle diario. Empleados y horas se agregan antes de unirlos con la
 * producción para evitar multiplicar personas o libras.
 *
 * Cola sale de las libras netas del pesado; cabezas, de las libras asignadas
 * a empleados sin anular. Total es la suma de ambas fuentes por fecha.
 */
export const DESCABEZADO_POR_DIA_QUERY = `
;WITH personal AS (
  SELECT h.FECHA AS Dia,
    COUNT(DISTINCT el.ID_EMPLEADO) AS Personas,
    SUM(d.LIBRAS) AS Cabezas,
    DATEDIFF(SECOND, MIN(CAST(d.HORA AS time)), MAX(CAST(d.HORA AS time))) / 3600.0 AS Horas
  FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
  JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
  LEFT JOIN dbo.DES_EMPLEADOS_LINEAS el ON el.ID_EMPLEADO_LINEA = d.ID_EMPLEADO_LINEA
  WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ISNULL(d.ANULADO, 0) = 0
  GROUP BY h.FECHA
), produccion AS (
  SELECT h.Fecha AS Dia,
    SUM(c.LibrasNetas) AS Cola
  FROM dbo.Des_PesadoColaHeader h
  JOIN dbo.Des_PesadoCola c ON c.IdPesadoColaHeader = h.IdPesadoColaHeader
  WHERE h.Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final
  GROUP BY h.Fecha
)
SELECT p.Dia, p.Personas, ISNULL(r.Cola, 0) AS Cola,
  ISNULL(p.Cabezas, 0) AS Cabezas,
  ISNULL(r.Cola, 0) + ISNULL(p.Cabezas, 0) AS Total,
  CASE WHEN p.Horas > 0
    THEN ISNULL(p.Cabezas, 0) / p.Horas ELSE 0 END AS LibrasPorHora,
  p.Horas
FROM personal p
LEFT JOIN produccion r ON r.Dia = p.Dia
`;

/** Detalle mensual. `COUNT(DISTINCT ID_EMPLEADO)` evita repetir a una
 * persona que trabajó varios días del mismo mes. Las horas son la suma de
 * las jornadas diarias para calcular un rendimiento mensual ponderado. */
export const DESCABEZADO_POR_MES_QUERY = `
;WITH jornadas AS (
  SELECT h.FECHA AS Dia,
    SUM(d.LIBRAS) AS Cabezas,
    DATEDIFF(SECOND, MIN(CAST(d.HORA AS time)), MAX(CAST(d.HORA AS time))) / 3600.0 AS Horas
  FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
  JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
  WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ISNULL(d.ANULADO, 0) = 0
  GROUP BY h.FECHA
), personal AS (
  SELECT CONVERT(varchar(7), h.FECHA, 23) AS Mes,
    COUNT(DISTINCT el.ID_EMPLEADO) AS Personas
  FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
  JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET d ON d.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
  LEFT JOIN dbo.DES_EMPLEADOS_LINEAS el ON el.ID_EMPLEADO_LINEA = d.ID_EMPLEADO_LINEA
  WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND ISNULL(d.ANULADO, 0) = 0
  GROUP BY CONVERT(varchar(7), h.FECHA, 23)
), horas AS (
  SELECT CONVERT(varchar(7), Dia, 23) AS Mes,
    SUM(Horas) AS Horas, SUM(Cabezas) AS Cabezas
  FROM jornadas GROUP BY CONVERT(varchar(7), Dia, 23)
), produccion AS (
  SELECT CONVERT(varchar(7), h.Fecha, 23) AS Mes,
    SUM(c.LibrasNetas) AS Cola
  FROM dbo.Des_PesadoColaHeader h
  JOIN dbo.Des_PesadoCola c ON c.IdPesadoColaHeader = h.IdPesadoColaHeader
  WHERE h.Fecha BETWEEN @Fecha_Inicial AND @Fecha_Final
  GROUP BY CONVERT(varchar(7), h.Fecha, 23)
)
SELECT p.Mes, p.Personas, ISNULL(r.Cola, 0) AS Cola,
  ISNULL(h.Cabezas, 0) AS Cabezas,
  ISNULL(r.Cola, 0) + ISNULL(h.Cabezas, 0) AS Total,
  CASE WHEN h.Horas > 0
    THEN ISNULL(h.Cabezas, 0) / h.Horas ELSE 0 END AS LibrasPorHora,
  h.Horas
FROM personal p
LEFT JOIN horas h ON h.Mes = p.Mes
LEFT JOIN produccion r ON r.Mes = p.Mes
`;

/* ================================================================== */
/* CLASIFICADO (STB_data)                                              */
/* ================================================================== */

/** Contadores de libras clasificadas: día en curso, semana en curso
 *  (lunes-domingo, sin depender de `@@DATEFIRST`) y mes en curso. El
 *  inventario disponible se sirve aparte como tabla
 *  (`CLASIFICADO_INVENTARIO_QUERY`). */
export const CLASIFICADO_RESUMEN_QUERY = `
DECLARE @Hoy date = CAST(GETDATE() AS date);
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy);
DECLARE @Domingo date = DATEADD(DAY, 6, @Lunes);
DECLARE @PrimerDiaMes date = DATEADD(DAY, 1 - DAY(@Hoy), @Hoy);
DECLARE @HorasClasificadoHoy float = (
  SELECT DATEDIFF(SECOND, MIN(d.HORA_INICIO), MAX(d.HORA_FINAL)) / 3600.0
    FROM dbo.CL_LLENADO_RECIPIENTES h
    JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
   WHERE h.FECHA = @Hoy AND d.ANULADO = 0
);

SELECT
  CONVERT(varchar(10), @Lunes, 23) AS SemanaInicio,
  CONVERT(varchar(10), @Domingo, 23) AS SemanaFin,
  (SELECT ISNULL(SUM(d.LIBRAS_NETA), 0)
     FROM dbo.CL_LLENADO_RECIPIENTES h
     JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
    WHERE h.FECHA = @Hoy AND d.ANULADO = 0) AS LibrasClasificadasHoy,
  (SELECT ISNULL(SUM(d.LIBRAS_NETA), 0)
     FROM dbo.CL_LLENADO_RECIPIENTES h
     JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
    WHERE h.FECHA BETWEEN @Lunes AND @Domingo AND d.ANULADO = 0) AS LibrasClasificadasSemana,
  (SELECT ISNULL(SUM(d.LIBRAS_NETA), 0)
     FROM dbo.CL_LLENADO_RECIPIENTES h
     JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
    WHERE h.FECHA BETWEEN @PrimerDiaMes AND @Hoy AND d.ANULADO = 0) AS LibrasClasificadasMes,
  CASE WHEN ISNULL(@HorasClasificadoHoy, 0) > 0 THEN
    (SELECT ISNULL(SUM(d.LIBRAS_NETA), 0)
       FROM dbo.CL_LLENADO_RECIPIENTES h
       JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
      WHERE h.FECHA = @Hoy AND d.ANULADO = 0) / @HorasClasificadoHoy
    ELSE 0 END AS LibrasClasificadasPorHora
`;

/**
 * Inventario de clasificado disponible por talla final y finca de origen
 * (`EnInventario = 1 AND Transferido = 0 AND Procesado = 0`). El servicio
 * consolida a una fila por talla con su finca predominante y la fecha del
 * bin más antiguo (para señalar inventario represado). Talla vía
 * `IdTallaFinal` → `DCP_TALLAS`. `ic.Destino` no se usa: está NULL en el
 * 100% de las filas de la tabla (no se llena en ningún flujo actual).
 */
export const CLASIFICADO_INVENTARIO_QUERY = `
SELECT
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  COALESCE(NULLIF(LTRIM(RTRIM(ic.FincaPBI)), ''), 'Sin finca') AS Finca,
  COUNT(*) AS Bins,
  ISNULL(SUM(ic.LibrasNetas), 0) AS Libras,
  MIN(ic.Fecha) AS FechaMasAntigua
FROM dbo.CL_InventarioClasificado ic
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA = ic.IdTallaFinal
WHERE ic.EnInventario = 1 AND ic.Transferido = 0 AND ic.Procesado = 0
GROUP BY
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla'),
  COALESCE(NULLIF(LTRIM(RTRIM(ic.FincaPBI)), ''), 'Sin finca')
`;

/** Detalle cruzado del inventario clasificado disponible. Se consulta a
 * través de la conexión PlantaEmpacadora y se califica STB_data porque el
 * inventario operativo de clasificación vive en esa base de la instancia. */
export const CLASIFICADO_INVENTARIO_DETALLE_QUERY = `
SELECT
  COALESCE(NULLIF(LTRIM(RTRIM(h.FincaPBI)), ''), NULLIF(LTRIM(RTRIM(ic.FincaPBI)), ''), 'Sin finca') AS Finca,
  COALESCE(NULLIF(LTRIM(RTRIM(h.LagunaCicloPBI)), ''), NULLIF(LTRIM(RTRIM(ic.LagunaCicloPBI)), ''), 'Sin laguna/ciclo') AS LagunaCiclo,
  COALESCE(NULLIF(LTRIM(RTRIM(h.Remision)), ''), 'Sin remisión') AS Remision,
  COALESCE(NULLIF(LTRIM(RTRIM(ic.Lote)), ''), 'Sin lote') AS Lote,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS TallaInicio,
  COALESCE(NULLIF(LTRIM(RTRIM(tp.TipoProducto)), ''),
    CASE WHEN h.ENTERO = 1 THEN 'Entero' ELSE 'Nitido Cola' END) AS Destino,
  SUM(ic.LibrasNetas) AS Libras
FROM STB_data.dbo.CL_InventarioClasificado ic
JOIN STB_data.dbo.CL_LLENADO_RECIPIENTES_D d
  ON d.ID_LLENADO_RECIPIENTE_D = ic.IdLLenadoRecipienteD
JOIN STB_data.dbo.CL_LLENADO_RECIPIENTES h
  ON h.ID_LLENADO_RECIPIENTE = d.ID_LLENADO_RECIPIENTE
LEFT JOIN STB_data.dbo.DCP_TALLAS t ON t.ID_TALLA = d.ID_TALLA
LEFT JOIN STB_data.dbo.CL_TipoProducto tp ON tp.IdTipoProducto = h.IdTipoProducto
WHERE ic.EnInventario = 1 AND ic.Transferido = 0 AND ic.Procesado = 0
GROUP BY
  COALESCE(NULLIF(LTRIM(RTRIM(h.FincaPBI)), ''), NULLIF(LTRIM(RTRIM(ic.FincaPBI)), ''), 'Sin finca'),
  COALESCE(NULLIF(LTRIM(RTRIM(h.LagunaCicloPBI)), ''), NULLIF(LTRIM(RTRIM(ic.LagunaCicloPBI)), ''), 'Sin laguna/ciclo'),
  COALESCE(NULLIF(LTRIM(RTRIM(h.Remision)), ''), 'Sin remisión'),
  COALESCE(NULLIF(LTRIM(RTRIM(ic.Lote)), ''), 'Sin lote'),
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla'),
  COALESCE(NULLIF(LTRIM(RTRIM(tp.TipoProducto)), ''), CASE WHEN h.ENTERO = 1 THEN 'Entero' ELSE 'Nitido Cola' END)
`;

/** Libras clasificadas por día, turno, tanque/máquina y talla. */
export const CLASIFICADO_DETALLE_QUERY = `
SELECT
  h.FECHA AS Dia,
  d.IdTurno AS IdTurno,
  CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END AS Maquina,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  SUM(d.LIBRAS_NETA) AS Libras
FROM dbo.CL_LLENADO_RECIPIENTES h
JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
LEFT JOIN dbo.CL_TANQUES tanque ON tanque.ID_TANQUE = h.ID_TANQUE
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA = d.ID_TALLA
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0
GROUP BY h.FECHA, d.IdTurno,
  CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla')
`;

/**
 * Horas trabajadas por máquina, por día y turno (mismo criterio que
 * `@HorasClasificadoHoy` en `CLASIFICADO_RESUMEN_QUERY`: desde el primer
 * `HORA_INICIO` hasta el último `HORA_FINAL`), dentro del rango de fechas
 * filtrado. El servicio suma estos tramos por máquina para obtener las
 * horas totales del rango y calcular libras/hora.
 */
export const CLASIFICADO_HORAS_MAQUINA_QUERY = `
SELECT
  h.FECHA AS Dia,
  d.IdTurno AS IdTurno,
  CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END AS Maquina,
  CASE WHEN COUNT(d.HORA_INICIO) > 0
    THEN DATEDIFF(SECOND, MIN(d.HORA_INICIO), MAX(d.HORA_FINAL)) / 3600.0
    ELSE 0 END AS Horas
FROM dbo.CL_LLENADO_RECIPIENTES h
JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
LEFT JOIN dbo.CL_TANQUES tanque ON tanque.ID_TANQUE = h.ID_TANQUE
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0
GROUP BY h.FECHA, d.IdTurno,
  CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END
`;

/**
 * Libras clasificadas hoy por máquina, con horas trabajadas (mismo
 * criterio que `@HorasClasificadoHoy` en `CLASIFICADO_RESUMEN_QUERY`, pero
 * por máquina) para poder calcular libras/hora en vivo por máquina.
 */
export const CLASIFICADO_POR_MAQUINA_HOY_QUERY = `
DECLARE @Hoy date = CAST(GETDATE() AS date);

SELECT
  CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END AS Maquina,
  SUM(d.LIBRAS_NETA) AS Libras,
  CASE WHEN COUNT(d.HORA_INICIO) > 0
    THEN DATEDIFF(SECOND, MIN(d.HORA_INICIO), MAX(d.HORA_FINAL)) / 3600.0
    ELSE 0 END AS Horas
FROM dbo.CL_LLENADO_RECIPIENTES h
JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
LEFT JOIN dbo.CL_TANQUES tanque ON tanque.ID_TANQUE = h.ID_TANQUE
WHERE h.FECHA = @Hoy AND d.ANULADO = 0
GROUP BY CASE WHEN tanque.ID_TANQUE IS NOT NULL
    THEN CONCAT('Máquina ', tanque.ID_TANQUE)
    ELSE 'Sin máquina asignada' END
`;

/* ================================================================== */
/* EXPORTACIONES (PlantaEmpacadora)                                    */
/* ================================================================== */

/**
 * Envíos de exportación agregados a nivel contenedor + cliente + estilo
 * (`NumeroContenedor <> ''` son los contenedores realmente exportados; el
 * despacho/fresco/reempaque interno no lleva contenedor). Se filtra por
 * `FechaCarga`.
 *
 * IMPORTANTE: no se agrupa por código de exportación ni por item — agregar
 * por esas dos columnas de más fragmentaba cada contenedor en ~5-6 filas y
 * disparaba el costo de la agregación sobre `AV_Envios` (vista de ~19M filas
 * a nivel de serial) de ~14s a menos de 2s, además de dar una tabla mucho
 * más legible (una fila por contenedor + estilo + cliente).
 */
export const EXPORTACIONES_CONTENEDORES_QUERY = `
WITH ItemAnillos AS (
  SELECT pci.fkItem, MAX(pc.Unidades) AS AnillosPorMaster
  FROM dbo.ProductosClienteItem pci
  JOIN dbo.ProductosCliente pc ON pc.IDproducto = pci.fkProducto
  WHERE pc.Unidades > 0
  GROUP BY pci.fkItem
  HAVING COUNT(DISTINCT pc.Unidades) = 1
)
SELECT
  e.FechaCarga AS Dia,
  e.NumeroContenedor AS Contenedor,
  e.ReferenciaEnvio AS Referencia,
  e.CodigoEmbarque AS CodigoEmbarque,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente') AS Cliente,
  COALESCE(NULLIF(LTRIM(RTRIM(i.EstiloFinal)), ''), 'Sin estilo') AS Estilo,
  COUNT(DISTINCT m.CodigoMaster) AS Masteres,
  COUNT(DISTINCT m.CodigoMaster) * COALESCE(ia.AnillosPorMaster, 0) AS Anillos,
  SUM(i.PesoLibras) AS Libras,
  SUM(s.Cantidad) AS Unidades
FROM dbo.Envios e
JOIN dbo.Masteres m ON m.FkEnvio = e.IdEnvio
JOIN dbo.Seriales s ON s.FkMaster = m.IdMaster
JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
LEFT JOIN ItemAnillos ia ON ia.fkItem = i.IdItem
WHERE e.FechaCarga BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND e.NumeroContenedor IS NOT NULL AND e.NumeroContenedor <> ''
GROUP BY e.FechaCarga, e.NumeroContenedor, e.ReferenciaEnvio, e.CodigoEmbarque,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente'),
  COALESCE(NULLIF(LTRIM(RTRIM(i.EstiloFinal)), ''), 'Sin estilo'), i.IdItem, ia.AnillosPorMaster
`;

/** Desglose de un contenedor abierto: una fila por cliente, orden e ítem. */
export const EXPORTACIONES_CONTENEDOR_DETALLE_QUERY = `
WITH ItemAnillos AS (
  SELECT pci.fkItem, MAX(pc.Unidades) AS AnillosPorMaster
  FROM dbo.ProductosClienteItem pci
  JOIN dbo.ProductosCliente pc ON pc.IDproducto = pci.fkProducto
  WHERE pc.Unidades > 0
  GROUP BY pci.fkItem
  HAVING COUNT(DISTINCT pc.Unidades) = 1
)
SELECT
  e.FechaCarga AS Dia,
  e.ReferenciaEnvio AS Referencia,
  e.CodigoEmbarque AS CodigoEmbarque,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente') AS Cliente,
  COALESCE(NULLIF(LTRIM(RTRIM(op.NoOrdenCompra)), ''), 'Sin orden') AS OrdenCompra,
  COALESCE(NULLIF(LTRIM(RTRIM(i.Item)), ''), 'Sin ítem') AS Item,
  COALESCE(ia.AnillosPorMaster, 0) AS AnillosPorMaster,
  COUNT(DISTINCT m.CodigoMaster) * COALESCE(ia.AnillosPorMaster, 0) AS Anillos,
  SUM(i.PesoLibras) AS Libras,
  COUNT(s.IdSerial) AS CantidadSerial
FROM dbo.Envios e
JOIN dbo.Masteres m ON m.FkEnvio = e.IdEnvio
JOIN dbo.Seriales s ON s.FkMaster = m.IdMaster
JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
LEFT JOIN ItemAnillos ia ON ia.fkItem = i.IdItem
WHERE e.FechaCarga = @Fecha
  AND e.NumeroContenedor = @Contenedor
  AND COALESCE(e.ReferenciaEnvio, '') = @Referencia
GROUP BY e.FechaCarga, e.ReferenciaEnvio, e.CodigoEmbarque,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente'),
  COALESCE(NULLIF(LTRIM(RTRIM(op.NoOrdenCompra)), ''), 'Sin orden'),
  COALESCE(NULLIF(LTRIM(RTRIM(i.Item)), ''), 'Sin ítem'), i.IdItem, ia.AnillosPorMaster
ORDER BY Cliente, CodigoEmbarque, OrdenCompra, Item
`;

/** Trazabilidad del mismo envío mostrado en el diálogo, a nivel de OP y origen. */
export const EXPORTACIONES_TRAZABILIDAD_QUERY = `
SELECT
  e.ReferenciaEnvio AS Shipment, e.NumeroContenedor AS Contenedor,
  NULLIF(LTRIM(RTRIM(op.NoOrdenCompra)), '') AS PO,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), '') AS Cliente,
  i.Item AS Item, i.CodigoItem AS CodigoItem, lr.Finca AS Finca, lr.laguna AS Laguna,
  CAST(DATEADD(MINUTE, -359, s.Created) AS date) AS FechaProduccion,
  op.OrdenProduccion AS CodigoProduccion,
  COUNT(DISTINCT m.IdMaster) AS Master,
  SUM(CAST(i.PesoLibras AS decimal(18,4))) AS Libras,
  c.NombreColor AS Color
FROM dbo.Envios e
JOIN dbo.Masteres m ON m.FkEnvio = e.IdEnvio
JOIN dbo.Seriales s ON s.FkMaster = m.IdMaster
JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
LEFT JOIN dbo.Colores c ON c.PKcolor = op.fkColor
WHERE e.FechaCarga = @Fecha AND e.NumeroContenedor = @Contenedor
  AND COALESCE(e.ReferenciaEnvio, '') = @Referencia
GROUP BY e.ReferenciaEnvio, e.NumeroContenedor, op.NoOrdenCompra,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), ''),
  i.Item, i.CodigoItem, lr.Finca, lr.laguna, CAST(DATEADD(MINUTE, -359, s.Created) AS date),
  op.OrdenProduccion, c.NombreColor
ORDER BY i.Item, lr.Finca, lr.laguna, FechaProduccion, op.OrdenProduccion
`;

/** Conteo mensual directo en SQL; evita descargar el detalle de seis meses. */
export const EXPORTACIONES_CLIENTE_MES_QUERY = `
SELECT
  CONVERT(varchar(7), e.FechaCarga, 23) AS Mes,
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente') AS Cliente,
  COUNT(DISTINCT e.NumeroContenedor) AS Contenedores
FROM dbo.Envios e
JOIN dbo.Masteres m ON m.FkEnvio = e.IdEnvio
JOIN dbo.Seriales s ON s.FkMaster = m.IdMaster
JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
JOIN dbo.AV_LotesRemision lr ON lr.IdLoteRemision = op.FkLoteRemision
WHERE e.FechaCarga BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND e.NumeroContenedor IS NOT NULL AND e.NumeroContenedor <> ''
GROUP BY CONVERT(varchar(7), e.FechaCarga, 23),
  COALESCE(NULLIF(LTRIM(RTRIM(lr.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(lr.Empresa)), ''), 'Sin cliente')
`;

/**
 * Resumen de la semana en curso (lunes-domingo): libras exportadas hacia
 * Francia, UK, AC Holding, terceros (todo lo que no cae en los tres
 * anteriores) y el total. Clasificado por `NombreGrupo` — "Terceros" es el
 * resto, así que los 4 buckets siempre suman el total.
 *
 * IMPORTANTE: agregado en una sola pasada con `SUM(CASE...)`, sin CTE
 * referenciado varias veces (SQL Server no materializa CTEs: cada
 * subconsulta repetida vuelve a escanear `AV_Envios`, ~19M filas — ver nota
 * histórica de este archivo). Con una sola pasada baja de ~25-30s a ~1-3s.
 */
export const EXPORTACIONES_RESUMEN_QUERY = `
DECLARE @Hoy date = CAST(GETDATE() AS date);
-- Lunes de la semana en curso, independiente de @@DATEFIRST
-- (el día 0 de SQL Server, 1900-01-01, fue lunes).
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy);
DECLARE @Domingo date = DATEADD(DAY, 6, @Lunes);

SELECT
  CONVERT(varchar(10), @Lunes, 23) AS SemanaInicio,
  CONVERT(varchar(10), @Domingo, 23) AS SemanaFin,
  ISNULL(SUM(CASE WHEN v.NombreGrupo LIKE '%FRANCIA%' THEN i.PesoLibras ELSE 0 END), 0) AS LibrasFrancia,
  ISNULL(SUM(CASE WHEN v.NombreGrupo LIKE '%LFF%' OR v.NombreGrupo LIKE '%UK%' THEN i.PesoLibras ELSE 0 END), 0) AS LibrasUK,
  ISNULL(SUM(CASE WHEN v.NombreGrupo LIKE '%AC HOLDING%' THEN i.PesoLibras ELSE 0 END), 0) AS LibrasACHolding,
  ISNULL(SUM(CASE
    WHEN v.NombreGrupo NOT LIKE '%FRANCIA%'
     AND v.NombreGrupo NOT LIKE '%LFF%' AND v.NombreGrupo NOT LIKE '%UK%'
     AND v.NombreGrupo NOT LIKE '%AC HOLDING%'
    THEN i.PesoLibras ELSE 0 END), 0) AS LibrasTerceros,
  ISNULL(SUM(i.PesoLibras), 0) AS LibrasTotal
FROM dbo.Envios e
JOIN dbo.Masteres m ON m.FkEnvio = e.IdEnvio
JOIN dbo.Seriales s ON s.FkMaster = m.IdMaster
JOIN dbo.OrdenesProduccion op ON op.IdOrdenProduccion = s.FkOrdenProduccion
JOIN dbo.AV_Items i ON i.IdItem = op.FkItem
JOIN dbo.AV_LotesRemision v ON v.IdLoteRemision = op.FkLoteRemision
WHERE e.FechaCarga BETWEEN @Lunes AND @Domingo
  AND e.NumeroContenedor IS NOT NULL AND e.NumeroContenedor <> ''
`;

/* ================================================================== */
/* COMPRA DE MATERIA PRIMA (PlantaEmpacadora)                          */
/* ================================================================== */

/**
 * Contadores superiores de Compra de Materia Prima: libras recibidas hoy,
 * en la semana y en el mes en curso. La semana es lunes-domingo, calculada sin
 * depender de `@@DATEFIRST` (igual que `EXPORTACIONES_RESUMEN_QUERY`).
 * El promedio por semana se calcula en el servicio (libras del mes / nº de
 * semanas del mes en curso).
 */
/**
 * IMPORTANTE: "hoy" se ancla al día más reciente con filas en
 * `AV_MateriaPrima`, no al reloj del servidor. La recepción de materia
 * prima se registra con varios días de rezago (se observó hasta 5 días);
 * si se usara `GETDATE()` directo, "semana actual" y "mes actual" casi
 * siempre caerían en un período todavía sin filas y el resumen mostraría
 * "sin datos" aunque sí hay recepción reciente (mismo problema que se
 * corrigió en `getCompraMpMateriaPrima` para la ventana de 3 meses).
 * Se devuelve `HoyEfectivo` para que el servicio calcule el promedio por
 * semana sobre el mes correcto (ver `getCompraMpResumen`).
 */
export const COMPRA_MP_RESUMEN_QUERY = `
DECLARE @HoyReal date = CAST(GETDATE() AS date);
DECLARE @UltimaFechaMP date = (SELECT MAX(CAST(DiaProduccion2024 AS date)) FROM dbo.AV_MateriaPrima);
DECLARE @Hoy date = IIF(@UltimaFechaMP IS NULL OR @UltimaFechaMP > @HoyReal, @HoyReal, @UltimaFechaMP);
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy);
DECLARE @Domingo date = DATEADD(DAY, 6, @Lunes);
DECLARE @PrimerDiaMes date = DATEADD(DAY, 1 - DAY(@Hoy), @Hoy);

SELECT
  CONVERT(varchar(10), @Lunes, 23) AS SemanaInicio,
  CONVERT(varchar(10), @Domingo, 23) AS SemanaFin,
  CONVERT(varchar(10), @Hoy, 23) AS HoyEfectivo,
  (SELECT ISNULL(SUM(v.PesoLibras), 0) FROM dbo.AV_MateriaPrima v
    WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Hoy AND @Hoy) AS LibrasRecibidasHoy,
  (SELECT ISNULL(SUM(v.PesoLibras), 0) FROM dbo.AV_MateriaPrima v
    WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Lunes AND @Domingo) AS LibrasRecibidasSemana,
  (SELECT ISNULL(SUM(v.PesoLibras), 0) FROM dbo.AV_MateriaPrima v
    WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @PrimerDiaMes AND @Hoy) AS LibrasRecibidasMes
`;

/**
 * Materia prima registrada por propietario/proveedor (vista
 * `AV_MateriaPrima`, filtrada por `DiaProduccion2024`). Devuelve libras y
 * valor de compra por día, año, mes, gramaje (columna `Talla` de la vista:
 * "51/60", "41/50", …) y proveedor. El servicio re-agrega estos grupos por
 * proveedor (tarjetas del rango), por mes (tabla mensual, últimos 3 meses)
 * o por año/mes/gramaje/proveedor (widget con selector de proveedores).
 */
export const COMPRA_MP_POR_PROVEEDOR_QUERY = `
SELECT
  CAST(v.DiaProduccion2024 AS date) AS Dia,
  YEAR(v.DiaProduccion2024) AS Anio,
  CONVERT(varchar(7), v.DiaProduccion2024, 23) AS Mes,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Talla)), ''), 'Sin gramaje') AS Gramaje,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') AS Proveedor,
  SUM(v.PesoLibras) AS Libras,
  SUM(v.SubTotal) AS Valor
FROM dbo.AV_MateriaPrima v
WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY CAST(v.DiaProduccion2024 AS date),
  YEAR(v.DiaProduccion2024),
  CONVERT(varchar(7), v.DiaProduccion2024, 23),
  COALESCE(NULLIF(LTRIM(RTRIM(v.Talla)), ''), 'Sin gramaje'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor')
`;

/**
 * Materia prima por tipo (`TipoMateria`: casi siempre "FRESCO", a veces
 * "SALMUERA"), proveedor e item (`Item`, ej. "STB COLA FRESCO51/60") —
 * mismo desglose que la tabla dinámica de Excel/Power BI que ya usa el
 * cliente. Peso en libras y cantidad de seriales (bultos/cajas) por grupo.
 */
export const COMPRA_MP_POR_ITEM_QUERY = `
SELECT
  COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo') AS Tipo,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') AS Proveedor,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Item)), ''), 'Sin item') AS Item,
  SUM(v.PesoLibras) AS PesoLibras,
  SUM(v.CantidadSerial) AS CantidadSerial
FROM dbo.AV_MateriaPrima v
WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY
  COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.Item)), ''), 'Sin item')
`;

/** Agregado base para la matriz proveedor × talla del detalle de materia
 * prima. Los totales de filas y columnas se calculan en la interfaz. */
export const COMPRA_MP_POR_TALLA_QUERY = `
SELECT
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') AS Proveedor,
  COALESCE(NULLIF(LTRIM(RTRIM(v.Talla)), ''), 'Sin talla') AS Talla,
  SUM(v.PesoLibras) AS Total
FROM dbo.AV_MateriaPrima v
WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.Talla)), ''), 'Sin talla')
`;
