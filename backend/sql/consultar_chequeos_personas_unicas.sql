/* =====================================================================
   Chequeos de personal SIN repetir personas - STB_data
   Si una persona fue chequeada en varias líneas/actividades el mismo día,
   cuenta 1 sola vez: se asigna a la línea de su ÚLTIMO chequeo del día
   (para usar el primero, cambiar DESC por ASC en "Asignacion").
   Tipo sigue la regla de Personal: Decoración Anillos y Reempaque = Obra;
   cualquier otro proceso chequeado = Auxiliar.
   ===================================================================== */
USE STB_data;

DECLARE @Desde date = '2026-11-27';
DECLARE @Hasta date = '2026-11-27';

WITH Chequeos AS (
    SELECT h.IdPagoGrupalAsistencia, h.Fecha, d.IdEmpleado, d.HoraDesde,
           d.IdPagoGrupalAsistenciaDetalle,
           CASE WHEN p.NOMBRE_PROCESO LIKE '%DECORACION ANILLOS%'
                  OR l.LineaProduccion LIKE '%REEMPAQUE%'
                  OR l.LineaProduccion LIKE '%DECORACION%'
                  OR l.LineaProduccion LIKE '%PERFORACION%' THEN 'Obra' ELSE 'Auxiliar' END AS TipoLinea
    FROM dbo.DCP_PagoGrupalAsistencias h
    JOIN dbo.DCP_PagoGrupalAsistenciasDetalle d ON d.IdPagoGrupalAsistencia = h.IdPagoGrupalAsistencia
    LEFT JOIN dbo.dcp_LineasProduccion l ON l.IdLineaProduccion = h.IdLineaProduccion
    LEFT JOIN dbo.DCP_PROCESOS p          ON p.ID_PROCESO = l.IdProceso
    WHERE h.Fecha BETWEEN @Desde AND @Hasta
),
Personas AS (   -- una fila por persona y día
    SELECT Fecha, IdEmpleado,
           -- Auxiliar si tuvo al menos un chequeo fuera de Decoración/Reempaque
           CASE WHEN MAX(CASE WHEN TipoLinea = 'Auxiliar' THEN 1 ELSE 0 END) = 1
                THEN 'Auxiliar' ELSE 'Obra' END AS Tipo,
           COUNT(*) AS Chequeos
    FROM Chequeos GROUP BY Fecha, IdEmpleado
),
Asignacion AS ( -- línea donde se cuenta a cada persona
    SELECT Fecha, IdEmpleado, IdPagoGrupalAsistencia,
           ROW_NUMBER() OVER (PARTITION BY Fecha, IdEmpleado
                              ORDER BY CASE WHEN HoraDesde IS NULL THEN 1 ELSE 0 END,
                                       HoraDesde DESC, IdPagoGrupalAsistenciaDetalle DESC) AS n
    FROM Chequeos
),
Lineas AS (
    SELECT h.IdPagoGrupalAsistencia, h.Fecha, p.NOMBRE_PROCESO AS Proceso, l.LineaProduccion,
           h.Usuario, h.Cerrado,
           COUNT(d.IdPagoGrupalAsistenciaDetalle) AS Registros,
           SUM(d.Valor) AS TotalValor,
           SUM(DATEDIFF(MINUTE, d.HoraDesde, d.HoraHasta)
               + CASE WHEN d.HoraHasta < d.HoraDesde THEN 1440 ELSE 0 END) / 60.0 AS TotalHoras
    FROM dbo.DCP_PagoGrupalAsistencias h
    LEFT JOIN dbo.dcp_LineasProduccion l ON l.IdLineaProduccion = h.IdLineaProduccion
    LEFT JOIN dbo.DCP_PROCESOS p          ON p.ID_PROCESO = l.IdProceso
    LEFT JOIN dbo.DCP_PagoGrupalAsistenciasDetalle d ON d.IdPagoGrupalAsistencia = h.IdPagoGrupalAsistencia
    WHERE h.Fecha BETWEEN @Desde AND @Hasta
    GROUP BY h.IdPagoGrupalAsistencia, h.Fecha, p.NOMBRE_PROCESO, l.LineaProduccion, h.Usuario, h.Cerrado
),
Resultado AS (
    SELECT 0 AS Orden, li.Fecha, li.IdPagoGrupalAsistencia, li.Proceso, li.LineaProduccion,
           li.Usuario, li.Cerrado,
           li.Registros                                           AS Chequeos,
           COUNT(pe.IdEmpleado)                                   AS PersonasUnicas,
           SUM(CASE WHEN pe.Tipo = 'Auxiliar' THEN 1 ELSE 0 END) AS Auxiliares,
           SUM(CASE WHEN pe.Tipo = 'Obra'     THEN 1 ELSE 0 END) AS Obra,
           SUM(CASE WHEN pe.Chequeos > 1      THEN 1 ELSE 0 END) AS ConVariosChequeos,
           li.TotalValor, li.TotalHoras
    FROM Lineas li
    LEFT JOIN Asignacion a ON a.IdPagoGrupalAsistencia = li.IdPagoGrupalAsistencia AND a.n = 1
    LEFT JOIN Personas pe  ON pe.Fecha = a.Fecha AND pe.IdEmpleado = a.IdEmpleado
    GROUP BY li.Fecha, li.IdPagoGrupalAsistencia, li.Proceso, li.LineaProduccion, li.Usuario,
             li.Cerrado, li.Registros, li.TotalValor, li.TotalHoras

    UNION ALL   -- total del día: personas sin repetir

    SELECT 1, pe.Fecha, NULL, NULL, 'TOTAL PERSONAS DEL DÍA', NULL, NULL,
           (SELECT COUNT(*) FROM Chequeos c WHERE c.Fecha = pe.Fecha),
           COUNT(*),
           SUM(CASE WHEN pe.Tipo = 'Auxiliar' THEN 1 ELSE 0 END),
           SUM(CASE WHEN pe.Tipo = 'Obra'     THEN 1 ELSE 0 END),
           SUM(CASE WHEN pe.Chequeos > 1      THEN 1 ELSE 0 END),
           (SELECT SUM(li.TotalValor) FROM Lineas li WHERE li.Fecha = pe.Fecha),
           (SELECT SUM(li.TotalHoras) FROM Lineas li WHERE li.Fecha = pe.Fecha)
    FROM Personas pe
    GROUP BY pe.Fecha
)
SELECT Fecha, IdPagoGrupalAsistencia, Proceso, LineaProduccion, Usuario, Cerrado,
       Chequeos, PersonasUnicas, Auxiliares, Obra, ConVariosChequeos, TotalValor, TotalHoras
FROM Resultado
ORDER BY Fecha, Orden, IdPagoGrupalAsistencia;
