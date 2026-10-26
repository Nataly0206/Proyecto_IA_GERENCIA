# Inventario Fresco

Nueva vista independiente de Inventario PT. El inventario anterior conserva su consulta, filtros y preferencias; solo cambia su nombre visible.

La vista Fresco muestra las cuatro etapas juntas en un tablero de dos columnas en escritorio y una columna en móvil. Cada panel integra total de libras, bins y una tabla por cliente, talla/destino o estilo. Permite cambiar a Por fecha y, en Pelado, Por destino. Ver detalle abre una tabla completa con filtros y columnas, con preferencias separadas. Las tablas principales tienen encabezado fijo y desplazamiento interno para mantener los cuatro paneles visibles en escritorio.

## Fuentes verificadas en STB_data

| Etapa | Fuente | Condición |
| --- | --- | --- |
| Recepción | `dbo.RemisionesPlantaPBIInventario` | `LIBRAS > 0`; la vista resuelve bins pendientes |
| Cola sin clasificar | `dbo.VInventarioProductoColaPBI` | `Enviado = 0 AND LibrasNetas > 0` |
| Cola clasificada | `dbo.CL_InventarioClasificado` | `EnInventario = 1 AND Transferido = 0 AND Procesado = 0 AND Enviado = 0 AND Reproceso = 0 AND LibrasNetas > 0` |
| Pelado | `dbo.PES_V_LLENADO_RECIPIENTES` | `Procesado = 0 AND LIBRAS > 0` |

El destino del clasificado sale de `CL_InventarioClasificado.IdLLenadoRecipienteD → CL_LLENADO_RECIPIENTES_D.IdDestinoFinal → CL_DESTINOS_FINAL.DestinoFinal`. Si existe un `Destino` explícito en inventario, tiene prioridad. Catálogos faltantes se muestran como “Sin destino”/“Sin talla”; no se pierde el peso por falta de catálogo. La agrupación principal conserva cada combinación talla y destino. Se excluyen los registros con `Reproceso = 1` (regresos de pelado y pruebas del sistema), igual que el reporte operativo: con ese filtro el 26 de octubre cuadran 73 bins y 29,769.82 lb.

Las libras se suman sin deduplicar valores iguales. Bins cuenta registros de llenado, igual que el reporte de referencia: el número físico de recipiente se reutiliza. `COUNT(DISTINCT Bin)` reduciría incorrectamente las existencias. Para Recepción, el tiempo mostrado por cliente es el mayor tiempo pendiente entre sus bins, tomando `DiferenciaTiempo` de la fuente.

No se aplica fecha ni turno: las existencias antiguas siguen incluidas mientras estén pendientes. No se suman las cuatro etapas en un total general. Actualización automática cada cinco minutos en el navegador. La caché del servidor dura dos minutos y se renueva por adelantado, así cada lectura automática trae datos con menos de dos minutos de antigüedad. El botón Actualizar fuerza la lectura SQL.

## Comparación con capturas del 26 de octubre de 2026

Recepción: **28,635.00 lb**, coincidencia exacta.

Pelado por fecha, coincidencias exactas al consultar:

| Fecha | Libras |
| --- | ---: |
| 20/10/2026 | 4,654.30 |
| 21/10/2026 | 13,902.74 |
| 22/10/2026 | 13,067.24 |
| 23/10/2026 | 5,971.87 |
| 24/10/2026 | 20,704.62 |

Los saldos del 26 y los totales generales variaron durante la implementación por movimientos de producción. Las capturas son una referencia de un momento anterior; no se fijan esos números en código.

## Acceso y API

Permiso separado: `inventario_fresco`. La migración 15 lo concede a quienes ya tenían `inventario`, conservando el acceso inicial. Los administradores tienen acceso implícito; después se puede administrar por usuario.

Endpoints GET `/api/dashboard/inventario-fresco-recepcion`, `-cola`, `-clasificado` y `-pelado`; `refresh=true` fuerza actualización. Usan autenticación de sesión y permiso Fresco. Responden filas consolidadas con fecha, cliente, finca, laguna, talla, destino, estilo, bins y libras según disponibilidad de cada fuente.

Para instalar: ejecutar `npm run migrate` y `npm run build` en backend; `npm run build` en frontend. Reiniciar el servidor con la nueva compilación.

Verificación: `cd backend && npm run test:inventario-fresco`. Incluye consolidación, SQL con variables de tabla para estados/destinos faltantes, conservación de saldos reales y las cuatro rutas con acceso permitido/denegado. Las pruebas de inventario solo leen datos operativos.
