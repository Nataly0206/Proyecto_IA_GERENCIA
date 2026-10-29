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

## Optimización de carga

La API admite `process=Descabezado|Clasificado|Pelado|IQF`. La pantalla consulta y presenta cada fila independientemente, de modo que IQF no retrasa los demás procesos ni oculta sus resultados si falla. Mantiene la tabla previa durante actualizaciones y conserva datos del navegador durante 30 minutos (vigencia de cinco minutos, sin solicitudes adicionales al cambiar de ventana).

Las muestras hasta ayer se comparten entre usuarios durante una hora, con caché en memoria que conserva ese plazo incluso sin Redis. Las solicitudes concurrentes comparten la misma lectura histórica. Las muestras de hoy se actualizan cada cinco minutos; Actualizar fuerza solo la lectura actual. Correcciones retroactivas quedan reflejadas al vencer la hora del histórico. Al cambiar de día se usa una clave nueva. No se cambiaron numeradores, denominadores ni filtros de las consultas originales; la división por fecha conserva grupos diarios y el promedio oficial IQF. La primera carga tras reiniciar aún debe obtener el histórico desde SQL.

`npm run test:resumen-procesos` también verifica carga por proceso, caché compartida, actualización sin releer el año, recuperación tras fallos y equivalencia de acumulados.

## Redis y preparación al arrancar

Productividad usa `getCachedProcessSummary`, compartido por la API y la preparación de caché al iniciar el backend. Esta preparación no bloquea el servidor; carga las mismas cuatro claves por proceso que usa la pantalla. `docker compose up -d redis` inicia el Redis local; el puerto 6379 se publica únicamente en 127.0.0.1 para el backend que corre fuera de Docker. Dentro de Docker el backend mantiene `redis://redis:6379`.

La comprobación del 29 de octubre encontró Redis detenido aunque CACHE_ENABLED estaba activo y REDIS_URL apuntaba a 127.0.0.1:6379. Tras iniciarlo, `/api/health` confirmó redis=ready y un proceso nuevo leyó los cuatro resultados preparados desde Redis en 23 ms sin ninguna consulta SQL. El histórico y las lecturas actuales mantienen sus plazos de caché y la pantalla continúa actualizándose cada cinco minutos.
