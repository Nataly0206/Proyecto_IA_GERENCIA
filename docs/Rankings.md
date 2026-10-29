# Rankings

Dos listas independientes con los 20 empleados con más libras de Pelado y Descabezado, con posición, nombre, ID y libras. Muestra exclusivamente hoy (fecha de Honduras), sin filtros, y actualiza cada cinco minutos. La API determina la fecha en cada solicitud para cambiar de jornada sin volver a abrir el módulo. Cada lista carga por separado y conserva su estado de error y actualización.

## Datos

STB_data: PES_ASIGNACION_LIBRAS_EMPLEADOS y su detalle para pelado; DES_ASIG_LBRS_EMPLEADOS y su detalle para descabezado. Resuelve el ID de empleado con PES_EMPLEADOS_LINEAS o DES_EMPLEADOS_LINEAS. No exige ACTIVO: los históricos incluyen empleados que registraron producción aunque su asignación haya cambiado. Excluye anulados con el mismo criterio de cada proceso. Suma por ID entre todas las líneas, conserva totales positivos y limita a 20; empates por ID ascendente.

Consulta nombres de DCP_EmpleadosDeptosFechas después de obtener los 20 IDs, seleccionando el más reciente hasta la fecha final. No multiplica libras al unir nombres históricos. Sin nombre disponible se conserva el ID.

## Acceso y API

Permiso propio `rankings`, asignable en Usuarios. Administradores tienen acceso implícito. No requiere migración ni escrituras en bases operativas.

- GET /api/dashboard/rankings/pelado
- GET /api/dashboard/rankings/descabezado

Valida el proceso y fija ambos extremos en el día actual de Honduras. `refresh=true` fuerza la lectura; caché compartida por proceso y rango con la política habitual del sistema para períodos actuales e históricos.

Verificación: compilación de frontend/backend, lectura real de ambos top 20 y `npm run test:rankings` en backend. Prueba SQL con tablas variables (sin persistencia) verifica agrupación de líneas, exclusión de anulados y fechas fuera de rango, nombres históricos sin duplicados, máximo de 20, empates y total de participantes.

## Modos de vista

Selector **Top 10** (inicial) y **Top 20 compacto**. Top 10 muestra los diez primeros por proceso en la distribución habitual. Top 20 compacto divide cada proceso en puestos 1–10 y 11–20, creando cuatro columnas en escritorio con la misma cantidad de filas. Conserva medallas y numeración originales. Los nombres compactos se muestran completos al pasar el cursor. En pantallas pequeñas las columnas se apilan. Alternar la vista usa los mismos datos del top 20, sin consultas adicionales ni cambios en la actualización cada cinco minutos.
