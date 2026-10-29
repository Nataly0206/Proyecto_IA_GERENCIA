# Resumen procesos

El nuevo módulo presenta Descabezado, Clasificado, Pelado e IQF en una matriz de libras por hora para hoy, semana (lunes a hoy), mes y año calendario hasta hoy. La fecha se calcula en America/Tegucigalpa. No usa el filtro histórico global, que se oculta en esta vista.

## Cálculo y fuentes

- Descabezado: libras asignadas del detalle DES_ASIG_LBRS_EMPLEADOS_DET sin anular, divididas entre la suma de ventanas diarias entre el primer y último registro; mismo numerador del reporte diario de descabezado (Cabezas).
- Clasificado: libras netas de CL_LLENADO_RECIPIENTES_D sin anular y ventanas por día, máquina y turno; cociente de las sumas.
- Pelado: libras de PES_ASIGNACION_LIBRAS_EMPLEADOS_DET y ventanas diarias de planta, conservando el criterio del reporte por estilo (incluye anulados); cociente de las sumas.
- IQF: reutiliza IQF_DAILY_RATE_QUERY y su promedio simple de rendimientos por grupo, con el descarte existente de intervalos de 15 minutos o menos. No suma ni promedia celdas diarias redondeadas.

Los grupos con horas no positivas o cantidades inválidas se excluyen de ambos componentes del cálculo. Cuando no hay un intervalo válido, el indicador muestra —; un rendimiento cero con intervalo válido se conserva en cero. No hay total entre procesos, porque miden distintas etapas.

## Integración

`GET /api/dashboard/resumen-procesos` requiere el permiso independiente `resumen_procesos`. Los administradores lo reciben implícitamente; otros usuarios pueden recibirlo desde Usuarios. La API consulta solo mediante SELECT las bases STB_data y PlantaEmpacadora. No requiere migración ni escribe datos operativos.

Caché de cinco minutos por fecha actual; `refresh=true` fuerza la consulta. La pantalla actualiza automáticamente cada cinco minutos y permite Actualizar manualmente. Incluye rangos, actualización, carga, errores y ayuda de cálculo.

Verificación: `npm run build` en frontend y backend; `npm run test:resumen-procesos` en backend. Se probó lectura real de los cuatro procesos el 29 de octubre de 2026. Las pruebas cubren cambio de año, semana calendario, cociente ponderado, promedio IQF y ausencia de intervalos válidos.
