# Carga

En Inventario PT, **Solicitar carga** abre los ítems que coinciden con todos los filtros activos. Agrupa por cliente principal, cliente, código, nombre, estilo, marca, talla, empaque y tipo. Permite solicitar seriales enteros incluso por encima de la existencia disponible; el resumen calcula kg asignados, solicitados, asignados y faltantes mientras se escribe.

Al guardar, el servidor vuelve a consultar Inventario PT, aplica los mismos filtros y asigna exclusivamente producto DISPONIBLE por fecha de producción ascendente, entre distintas órdenes de compra. Desempata por orden de compra y código externo. Una asignación parcial calcula el peso proporcional a la cantidad de seriales de la fila de origen. Si el stock se agotó antes del envío, guarda todo como faltante y conserva la identidad del ítem.

## Historial

**Carga** comparte el permiso `inventario`. Los usuarios con ese permiso pueden ver las cargas, filtrar por fecha de creación desde/hasta (ambos días incluidos, hora de Honduras), consultar autor, referencia, seriales solicitados/asignados/faltantes y estado Completa/Con faltantes. El detalle conserva orden de compra, ítem, finca, laguna, fecha, color, código de producción, peso y seriales, con subtotales y total asignado. Los históricos no se recalculan con las existencias actuales. El peso se puede consultar en libras o kilos.

## Persistencia y conexiones

Todos los INSERT del módulo usan `getAuthPool()` (`AUTH_DB_*`), configurado en este entorno para **DashboardGerencialAuth**, la base propia de gerencia. La tabla `dbo.dashboard_precargas` conserva el nombre técnico para mantener los históricos existentes. Guarda usuario, fecha UTC y JSON de referencia, filtros, solicitud, asignación y faltantes. La migración 16 crea la tabla; la 17 agrega el índice por fecha.

PlantaEmpacadora se consulta exclusivamente con SELECT para obtener inventario y trazabilidad: `AV_LotesRemision.Finca/laguna`, `Colores.CodigoColor` vía `OrdenesProduccion.fkColor`, y `OrdenesProduccion.OrdenProduccion`. Este módulo no escribe en PlantaEmpacadora ni STB_data. Tampoco actualiza seriales, masters o inventario. Las cargas son planes guardados sin reservas; varias pueden incluir las mismas existencias.

- `GET /api/inventory/preloads?from=YYYY-MM-DD&to=YYYY-MM-DD`: historial; ambos parámetros son opcionales. Valida fechas reales y orden del rango. Filtra en SQL por límites UTC equivalentes al día de Honduras.
- `POST /api/inventory/preloads`: `{ filters, notes, lines: [{ key, quantity }] }`. Valida claves de ítem, cantidades enteras positivas, duplicados, referencia y filtros.
- `key`: JSON del arreglo de dimensiones de agrupación, en el orden de `ITEM_FIELDS`.

En otro entorno, ejecutar `npm run migrate` en backend antes de usar. Las cargas antiguas se leen calculando asignados y faltantes desde su detalle guardado.

## Alcance

No se sustituyen productos automáticamente. Los faltantes se registran para revisión; esta versión no tiene despacho, aprobación ni cancelación. La tabla se puede descargar en PDF. Un master puede agrupar varios seriales: la unidad de captura sigue siendo la cantidad serial del inventario.

Verificación: `npm run build` en frontend y backend; `npm run test:cargas` en backend. Incluye FIFO entre órdenes, faltantes, existencias agotadas, separación entre clientes/empaques y el ejemplo de 629 seriales = 164 + 465.

## Diseño y descarga

El historial se puede contraer con la flecha; al pulsar Ver detalle se oculta para dar espacio al reporte. La tabla replica la referencia con Arial, texto negro, dimensiones y subtotales gris `#E0E0E0`, importes en blanco y bordes negros. Agrupa orden → código → nombre → finca → laguna → fecha → color → producción. Siempre muestra total de ítem por orden y subtotales interiores cuando una dimensión se divide en varios valores. La presentación agrupada no cambia la selección FIFO guardada.

`GET /api/inventory/preloads/:id/report?unit=lbs|kg` genera el modelo único de celdas combinadas para pantalla y descarga, leyendo solo la carga guardada en gerencia. Con `format=pdf` entrega el PDF, con las mismas combinaciones, colores, bordes, cuatro decimales de peso, total y páginas A3 horizontales con encabezados repetidos y numeración. El botón **Descargar PDF** usa la unidad seleccionada. El reporte exportado contiene lo asignado; los faltantes permanecen visibles en el resumen de la carga.

Las pruebas de reporte reproducen las 1,212 unidades y 31,723.2398 libras de la imagen de referencia, verifican los subtotales interiores y que no haya huecos ni solapamientos en celdas combinadas, y abren el PDF generado para comprobar formato y valores.

## Edición de cargas

**Editar carga** permite cambiar el objetivo de seriales y repartirlos manualmente entre producciones del mismo ítem/cliente. Busca en todas las órdenes disponibles con orden válida, incluso fuera de los filtros de orden/fecha originales. Permite mantener o reducir asignaciones históricas que ya no aparecen en inventario, pero valida los aumentos contra las existencias actuales. Los kg y faltantes se recalculan en el servidor y se actualizan en la tabla y el PDF.

Al reducir o quitar una producción se marca **No completar** para impedir que el autocompletado la reponga. La marca se puede desactivar y queda guardada por carga. **Completar con los más antiguos** respeta las cantidades que ya elegiste y agrega solo producto disponible en otras producciones elegibles, por antigüedad.

La migración 18 agrega `revision` a `dashboard_precargas` y crea `dashboard_cargas_ediciones`: guarda motivo, usuario, fecha y snapshots anterior/nuevo en una operación atómica. Si otra persona guardó primero, la edición anterior recibe 409 y no sobrescribe sus cambios. El historial de cambios puede consultarse en la ventana de edición.

- `GET /api/inventory/preloads/:id/edit`: revisión, producciones disponibles/asignadas e historial.
- `PUT /api/inventory/preloads/:id`: `{ revision, notes, reason, lines: [{ key, requested, excludedLots, allocations: [{ key, quantity }] }] }`.

Todas estas escrituras usan exclusivamente la conexión de gerencia. La fecha de creación original de la carga se conserva.
