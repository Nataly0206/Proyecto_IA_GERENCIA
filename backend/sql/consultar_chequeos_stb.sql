/* =====================================================================
   Chequeos de personal (pago grupal por asistencia) - STB_data
   Replica la pantalla de chequeos: arriba las líneas del día y abajo
   los empleados de cada línea con horas, valor y actividad.
   ===================================================================== */
USE STB_data;

DECLARE @Desde date = '2026-11-27';
DECLARE @Hasta date = '2026-11-27';
DECLARE @Proceso varchar(100) = NULL;   -- p. ej. 'Pelado'; NULL = todos
DECLARE @Linea   varchar(100) = NULL;   -- p. ej. 'Aux. Pesado y Chequeo'; NULL = todas

/* 1) Encabezado: una fila por línea chequeada (grilla de arriba) */
SELECT h.IdPagoGrupalAsistencia,
       h.Fecha,
       p.NOMBRE_PROCESO                 AS Proceso,
       l.LineaProduccion,
       h.Observacion,
       h.Libras,
       h.LibrasAutomaticas              AS LbsAuto,
       h.Factor,
       h.Cerrado,
       h.Usuario,
       l.AplicaGrupal,
       COUNT(d.IdPagoGrupalAsistenciaDetalle) AS Empleados,
       SUM(d.Valor)                     AS TotalValor,
       SUM(DATEDIFF(MINUTE, d.HoraDesde, d.HoraHasta)
           + CASE WHEN d.HoraHasta < d.HoraDesde THEN 1440 ELSE 0 END) / 60.0 AS TotalHoras
FROM dbo.DCP_PagoGrupalAsistencias h
LEFT JOIN dbo.dcp_LineasProduccion l ON l.IdLineaProduccion = h.IdLineaProduccion
LEFT JOIN dbo.DCP_PROCESOS p          ON p.ID_PROCESO = l.IdProceso
LEFT JOIN dbo.DCP_PagoGrupalAsistenciasDetalle d ON d.IdPagoGrupalAsistencia = h.IdPagoGrupalAsistencia
WHERE h.Fecha BETWEEN @Desde AND @Hasta
  AND (@Proceso IS NULL OR p.NOMBRE_PROCESO = @Proceso)
  AND (@Linea   IS NULL OR LTRIM(RTRIM(l.LineaProduccion)) = @Linea)
GROUP BY h.IdPagoGrupalAsistencia, h.Fecha, p.NOMBRE_PROCESO, l.LineaProduccion, h.Observacion,
         h.Libras, h.LibrasAutomaticas, h.Factor, h.Cerrado, h.Usuario, l.AplicaGrupal
ORDER BY h.Fecha, h.IdPagoGrupalAsistencia;

/* 2) Detalle: empleados de cada línea (grilla de abajo) */
SELECT h.Fecha,
       p.NOMBRE_PROCESO                 AS Proceso,
       l.LineaProduccion,
       d.IdEmpleado,
       e.Identidad,
       e.NombreEmpleado,
       d.HoraDesde,
       d.HoraHasta,
       (DATEDIFF(MINUTE, d.HoraDesde, d.HoraHasta)
        + CASE WHEN d.HoraHasta < d.HoraDesde THEN 1440 ELSE 0 END) / 60.0 AS Horas,
       d.Valor,
       a.Actividad,
       h.Cerrado,
       h.Usuario
FROM dbo.DCP_PagoGrupalAsistencias h
JOIN dbo.DCP_PagoGrupalAsistenciasDetalle d ON d.IdPagoGrupalAsistencia = h.IdPagoGrupalAsistencia
LEFT JOIN dbo.dcp_LineasProduccion l ON l.IdLineaProduccion = h.IdLineaProduccion
LEFT JOIN dbo.DCP_PROCESOS p          ON p.ID_PROCESO = l.IdProceso
LEFT JOIN dbo.Dcp_Actividades a       ON a.IdActividad = d.idActividad
LEFT JOIN dbo.DCP_EmpleadosDeptos e   ON e.IdEmpleado = d.IdEmpleado
WHERE h.Fecha BETWEEN @Desde AND @Hasta
  AND (@Proceso IS NULL OR p.NOMBRE_PROCESO = @Proceso)
  AND (@Linea   IS NULL OR LTRIM(RTRIM(l.LineaProduccion)) = @Linea)
ORDER BY h.Fecha, l.LineaProduccion, d.HoraDesde, e.NombreEmpleado;
