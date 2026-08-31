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
 * - Descabezado: `DES_ASIG_LBRS_EMPLEADOS` (+ `_DET`) — libras y pago a
 *   destajo reales. `Des_PesadoCola.Fecha` está vacío, no sirve.
 * - Clasificado: `CL_LLENADO_RECIPIENTES` (+ `_D`), talla vía `DCP_TALLAS`,
 *   "máquina" = responsable de mesa (`DCP_RESPONSABLES`) porque
 *   `ID_TANQUE` no se usa desde 2023. Inventario disponible en
 *   `CL_InventarioClasificado` (`EnInventario=1 AND Transferido=0 AND
 *   Procesado=0`).
 * - Exportaciones: vista `AV_Envios` (contenedor, `NombreGrupo`,
 *   `EstiloFinal`, `NoOrdenCompra` = código de exportación, `CodigoMaster`).
 * - Compra MP: vista `AV_OrdenesCompraClientes` (avance de órdenes por
 *   cliente, `AnillosXMaster`, `KGFaltantes`) y `AV_MateriaPrima`
 *   (materia prima por propietario/proveedor).
 */

/* ================================================================== */
/* RECEPCIÓN (STB_data)                                                */
/* ================================================================== */

/** Contadores del día en curso: libras recibidas, remisiones, libras
 *  pendientes de procesar y fincas activas. */
export const RECEPCION_RESUMEN_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.FECHA_REMISION = @Dia AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS LibrasRecibidasHoy,
  (SELECT COUNT(DISTINCT rp.REMISION_GENERAL)
     FROM dbo.R_REMISIONES_PLANTA rp
    WHERE rp.FECHA_REMISION = @Dia AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS RemisionesHoy,
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.ANULADA = 0 AND rp.RECHAZADA = 0 AND rp.CERRADA = 0 AND ISNULL(d.PROCESADO, 0) = 0) AS LibrasPendientesProcesar,
  (SELECT COUNT(DISTINCT f.IdFinca)
     FROM dbo.R_REMISIONES_PLANTA rp
     LEFT JOIN dbo.R_Lagunas lg ON lg.IdLaguna = rp.ID_LAGUNA
     LEFT JOIN dbo.R_Fincas f ON f.IdFinca = lg.IdFinca
    WHERE rp.FECHA_REMISION = @Dia AND rp.ANULADA = 0 AND rp.RECHAZADA = 0) AS FincasActivasHoy
`;

/** Libras recibidas por finca y día dentro del rango filtrado. */
export const RECEPCION_POR_FINCA_QUERY = `
SELECT
  rp.FECHA_REMISION AS Dia,
  COALESCE(NULLIF(LTRIM(RTRIM(f.Finca)), ''), NULLIF(LTRIM(RTRIM(rp.NombreCliente)), ''), 'Sin finca') AS Finca,
  SUM(d.LIBRAS) AS Libras
FROM dbo.R_REMISIONES_PLANTA rp
JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
LEFT JOIN dbo.R_Lagunas lg ON lg.IdLaguna = rp.ID_LAGUNA
LEFT JOIN dbo.R_Fincas f ON f.IdFinca = lg.IdFinca
WHERE rp.FECHA_REMISION BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND rp.ANULADA = 0 AND rp.RECHAZADA = 0
GROUP BY rp.FECHA_REMISION,
  COALESCE(NULLIF(LTRIM(RTRIM(f.Finca)), ''), NULLIF(LTRIM(RTRIM(rp.NombreCliente)), ''), 'Sin finca')
`;

/* ================================================================== */
/* DESCABEZADO (STB_data)                                              */
/* ================================================================== */

/** Contadores del día en curso: libras descabezadas, pago, headcount y
 *  libras pendientes de descabezar (entero recibido sin procesar). */
export const DESCABEZADO_RESUMEN_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  (SELECT ISNULL(SUM(det.LIBRAS), 0)
     FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
     JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET det ON det.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
    WHERE h.FECHA = @Dia AND det.ANULADO = 0) AS LibrasDescabezadasHoy,
  (SELECT ISNULL(SUM(det.VALOR), 0)
     FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
     JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET det ON det.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
    WHERE h.FECHA = @Dia AND det.ANULADO = 0) AS PagoHoy,
  (SELECT COUNT(DISTINCT el.ID_EMPLEADO)
     FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
     JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET det ON det.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
     JOIN dbo.DES_EMPLEADOS_LINEAS el ON el.ID_EMPLEADO_LINEA = det.ID_EMPLEADO_LINEA
    WHERE h.FECHA = @Dia AND det.ANULADO = 0) AS EmpleadosHoy,
  (SELECT ISNULL(SUM(d.LIBRAS), 0)
     FROM dbo.R_REMISIONES_PLANTA rp
     JOIN dbo.R_REMISIONES_PLANTA_DETALLE d ON d.ID_REMISION_PLANTA = rp.ID_REMISION_PLANTA
    WHERE rp.ANULADA = 0 AND rp.RECHAZADA = 0 AND rp.CERRADA = 0
      AND ISNULL(rp.ES_COLA, 0) = 0 AND ISNULL(d.PROCESADO, 0) = 0) AS LibrasPendientesDescabezar
`;

/** Libras y pago de descabezado por día y turno dentro del rango. */
export const DESCABEZADO_POR_DIA_QUERY = `
SELECT
  h.FECHA AS Dia,
  det.ID_TURNO AS IdTurno,
  SUM(det.LIBRAS) AS Libras,
  SUM(det.VALOR) AS Valor
FROM dbo.DES_ASIG_LBRS_EMPLEADOS h
JOIN dbo.DES_ASIG_LBRS_EMPLEADOS_DET det ON det.ID_ASIG_LBRS_EMPLEADO = h.ID_ASIG_LBRS_EMPLEADO
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND det.ANULADO = 0
GROUP BY h.FECHA, det.ID_TURNO
`;

/* ================================================================== */
/* CLASIFICADO (STB_data)                                              */
/* ================================================================== */

/** Contadores del día en curso: libras y bins clasificados hoy e
 *  inventario clasificado disponible (libras y bins). */
export const CLASIFICADO_RESUMEN_QUERY = `
DECLARE @Dia date = CAST(GETDATE() AS date);

SELECT
  (SELECT ISNULL(SUM(d.LIBRAS_NETA), 0)
     FROM dbo.CL_LLENADO_RECIPIENTES h
     JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
    WHERE h.FECHA = @Dia AND d.ANULADO = 0) AS LibrasClasificadasHoy,
  (SELECT COUNT(*)
     FROM dbo.CL_LLENADO_RECIPIENTES h
     JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
    WHERE h.FECHA = @Dia AND d.ANULADO = 0) AS BinsHoy,
  (SELECT ISNULL(SUM(LibrasNetas), 0) FROM dbo.CL_InventarioClasificado
    WHERE EnInventario = 1 AND Transferido = 0 AND Procesado = 0) AS InventarioLibras,
  (SELECT COUNT(*) FROM dbo.CL_InventarioClasificado
    WHERE EnInventario = 1 AND Transferido = 0 AND Procesado = 0) AS InventarioBins
`;

/** Libras clasificadas por día, turno, máquina (responsable) y talla. */
export const CLASIFICADO_DETALLE_QUERY = `
SELECT
  h.FECHA AS Dia,
  d.IdTurno AS IdTurno,
  COALESCE(NULLIF(LTRIM(RTRIM(r.NOMBRES)), ''), 'Sin responsable') AS Maquina,
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla') AS Talla,
  SUM(d.LIBRAS_NETA) AS Libras
FROM dbo.CL_LLENADO_RECIPIENTES h
JOIN dbo.CL_LLENADO_RECIPIENTES_D d ON d.ID_LLENADO_RECIPIENTE = h.ID_LLENADO_RECIPIENTE
LEFT JOIN dbo.DCP_RESPONSABLES r ON r.ID_RESPONSABLE = h.ID_RESPONSABLE
LEFT JOIN dbo.DCP_TALLAS t ON t.ID_TALLA = d.ID_TALLA
WHERE h.FECHA BETWEEN @Fecha_Inicial AND @Fecha_Final AND d.ANULADO = 0
GROUP BY h.FECHA, d.IdTurno,
  COALESCE(NULLIF(LTRIM(RTRIM(r.NOMBRES)), ''), 'Sin responsable'),
  COALESCE(NULLIF(LTRIM(RTRIM(t.NOMBRE_TALLA)), ''), 'Sin talla')
`;

/* ================================================================== */
/* EXPORTACIONES (PlantaEmpacadora)                                    */
/* ================================================================== */

/**
 * Envíos de exportación agregados a nivel contenedor + orden de compra +
 * item. `fkTipoEnvio IN (2,3,4)` y `NumeroContenedor <> ''` son los
 * contenedores realmente exportados (el tipo 1 es despacho/fresco/reempaque
 * interno, sin contenedor). Se filtra por `FechaCarga`.
 */
export const EXPORTACIONES_CONTENEDORES_QUERY = `
SELECT
  v.FechaCarga AS Dia,
  v.NumeroContenedor AS Contenedor,
  v.ReferenciaEnvio AS Referencia,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(v.Empresa)), ''), 'Sin cliente') AS Cliente,
  COALESCE(NULLIF(LTRIM(RTRIM(v.EstiloFinal)), ''), 'Sin estilo') AS Estilo,
  NULLIF(LTRIM(RTRIM(v.NoOrdenCompra)), '') AS CodigoExportacion,
  NULLIF(LTRIM(RTRIM(v.CodigoItem)), '') AS Item,
  COUNT(DISTINCT v.CodigoMaster) AS Masteres,
  SUM(v.PesoLibras) AS Libras,
  SUM(v.CantidadSerial) AS Unidades
FROM dbo.AV_Envios v
WHERE v.FechaCarga BETWEEN @Fecha_Inicial AND @Fecha_Final
  AND v.NumeroContenedor IS NOT NULL AND LTRIM(RTRIM(v.NumeroContenedor)) <> ''
GROUP BY v.FechaCarga, v.NumeroContenedor, v.ReferenciaEnvio,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), NULLIF(LTRIM(RTRIM(v.Empresa)), ''), 'Sin cliente'),
  COALESCE(NULLIF(LTRIM(RTRIM(v.EstiloFinal)), ''), 'Sin estilo'),
  NULLIF(LTRIM(RTRIM(v.NoOrdenCompra)), ''),
  NULLIF(LTRIM(RTRIM(v.CodigoItem)), '')
`;

/**
 * Resumen de la semana en curso (lunes-domingo): contenedores exportados
 * en total, hacia Francia, hacia UK, y libras.
 */
export const EXPORTACIONES_RESUMEN_QUERY = `
DECLARE @Hoy date = CAST(GETDATE() AS date);
-- Lunes de la semana en curso, independiente de @@DATEFIRST
-- (el día 0 de SQL Server, 1900-01-01, fue lunes).
DECLARE @Lunes date = DATEADD(DAY, -(DATEDIFF(DAY, 0, @Hoy) % 7), @Hoy);
DECLARE @Domingo date = DATEADD(DAY, 6, @Lunes);

;WITH Cont AS (
  SELECT
    v.NumeroContenedor,
    MAX(CASE WHEN v.NombreGrupo LIKE '%FRANCIA%' THEN 1 ELSE 0 END) AS EsFrancia,
    MAX(CASE WHEN v.NombreGrupo LIKE '%LFF%' OR v.NombreGrupo LIKE '%UK%' THEN 1 ELSE 0 END) AS EsUK,
    SUM(v.PesoLibras) AS Libras
  FROM dbo.AV_Envios v
  WHERE v.FechaCarga BETWEEN @Lunes AND @Domingo
    AND v.NumeroContenedor IS NOT NULL AND LTRIM(RTRIM(v.NumeroContenedor)) <> ''
  GROUP BY v.NumeroContenedor
)
SELECT
  CONVERT(varchar(10), @Lunes, 23) AS SemanaInicio,
  CONVERT(varchar(10), @Domingo, 23) AS SemanaFin,
  (SELECT COUNT(*) FROM Cont) AS ContenedoresSemana,
  (SELECT COUNT(*) FROM Cont WHERE EsFrancia = 1) AS ContenedoresFrancia,
  (SELECT COUNT(*) FROM Cont WHERE EsUK = 1) AS ContenedoresUK,
  (SELECT ISNULL(SUM(Libras), 0) FROM Cont) AS LibrasSemana
`;

/* ================================================================== */
/* COMPRA DE MATERIA PRIMA (PlantaEmpacadora)                          */
/* ================================================================== */

/** Contadores de avance de órdenes de compra de exportación. */
export const COMPRA_MP_RESUMEN_QUERY = `
SELECT
  SUM(CASE WHEN oc.Estado <> 2 THEN 1 ELSE 0 END) AS OrdenesPendientes,
  COUNT(*) AS OrdenesTotales,
  SUM(CASE WHEN oc.Estado <> 2 AND oc.KGFaltantes > 0 THEN oc.KGFaltantes ELSE 0 END) AS KgFaltantes,
  SUM(CASE WHEN oc.Estado <> 2 AND oc.MasteresFaltantes > 0 THEN oc.MasteresFaltantes ELSE 0 END) AS MasteresFaltantes
FROM dbo.OrdenesCompra oc
`;

/**
 * Órdenes de compra por cliente con su avance. Se listan las órdenes
 * pendientes de exportación (Estado <> 2). `NoOrdenCompra` es el código de
 * exportación; `AnillosXMaster` los anillos por máster.
 */
export const COMPRA_MP_ORDENES_QUERY = `
SELECT
  v.NoOrdenCompra AS NoOrden,
  v.FechaOrdenCompra AS Fecha,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombreCliente)), ''), 'Sin cliente') AS Cliente,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombreProducto)), ''), 'Sin producto') AS Producto,
  NULLIF(LTRIM(RTRIM(v.CodigoProducto)), '') AS CodigoExportacion,
  COALESCE(NULLIF(LTRIM(RTRIM(v.EstiloFinal)), ''), 'Sin estilo') AS Estilo,
  ISNULL(v.AnillosXMaster, 0) AS AnillosXMaster,
  CASE WHEN v.AnioETD > 2000 THEN CONCAT(v.AnioETD, '-S', RIGHT('0' + CAST(v.ETD AS varchar(2)), 2)) ELSE '' END AS SemanaETD,
  ISNULL(v.KG, 0) AS Kg,
  ISNULL(v.KGproducidos, 0) AS KgProducidos,
  ISNULL(v.KGFaltantes, 0) AS KgFaltantes,
  ISNULL(v.MasteresFaltantes, 0) AS MasteresFaltantes,
  COALESCE(NULLIF(LTRIM(RTRIM(v.EstadoTexto)), ''), 'SIN ESTADO') AS Estado,
  v.Estado AS EstadoCodigo
FROM dbo.AV_OrdenesCompraClientes v
WHERE v.Estado <> 2
`;

/**
 * Materia prima registrada por propietario/proveedor (vista
 * `AV_MateriaPrima`, filtrada por `DiaProduccion2024`). Devuelve libras y
 * valor de compra por proveedor y día.
 */
export const COMPRA_MP_POR_PROVEEDOR_QUERY = `
SELECT
  CAST(v.DiaProduccion2024 AS date) AS Dia,
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') AS Proveedor,
  SUM(v.PesoLibras) AS Libras,
  SUM(v.SubTotal) AS Valor
FROM dbo.AV_MateriaPrima v
WHERE CAST(v.DiaProduccion2024 AS date) BETWEEN @Fecha_Inicial AND @Fecha_Final
GROUP BY CAST(v.DiaProduccion2024 AS date),
  COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor')
`;
