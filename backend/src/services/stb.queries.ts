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
