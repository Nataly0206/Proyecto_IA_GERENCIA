# Documentación Funcional de Módulos — Dashboard Gerencial

> Complementa a [`Documentacion_Completa_BD_STB.md`](./Documentacion_Completa_BD_STB.md)
> (catálogo completo de tablas/vistas/SPs de las bases `PlantaEmpacadora` y
> `STB_data`). **Este documento** responde, módulo por módulo: "¿de dónde
> sale este dato?" — qué vista/tabla SQL, de qué base de datos, con qué
> filtro y qué fórmula. Pensado para que un agente pueda contestar
> preguntas de negocio sin leer el código fuente completo.

## Cómo leer las tablas de cada módulo

| Columna | Significado |
| --- | --- |
| **Dato** | Lo que se ve en el dashboard (tarjeta, columna de tabla, gráfica) |
| **Vista/Tabla SQL** | Objeto real de SQL Server de donde sale, con su esquema (`dbo.`) |
| **Base de datos** | `PlantaEmpacadora` o `STB_data` (misma instancia SQL Server, bases separadas) |
| **Cómo se calcula** | Filtro y fórmula (agregación) que produce el número |
| **Endpoint** | Ruta de la API que lo sirve (todas bajo `/api/dashboard/` salvo que se indique otra) |

---

## 0. Las dos bases de datos

El sistema lee dos bases de SQL Server (misma instancia física):

| Base | Qué guarda | Módulos que la usan |
| --- | --- | --- |
| **`PlantaEmpacadora`** | Producción congelada/IQF, empaque, serialización, envíos/exportación, compra de materia prima, inventario de producto terminado | IQF, Exportaciones, Compra de Materia Prima, Inventario |
| **`STB_data`** | Recepción de finca, descabezado, clasificado por talla, pelado (destajo por empleado) | Recepción, Descabezado, Clasificado, Pelado |

El backend tiene un pool de conexión por base:
`backend/src/services/sql.service.ts` (`runQuery` → `PlantaEmpacadora`) y
`backend/src/services/stb.service.ts` (`runStbQuery` → `STB_data`).

**Patrón general:** el SQL agrega solo hasta la granularidad mínima
(día/turno/línea/estilo); consolidar por día vs. mes y filtrar por turno
se hace después en TypeScript (`backend/src/services/*.service.ts`).

**Tres tipos de endpoint** (para saber qué tan "vivo" es un dato):

- **En vivo** — sin filtros, "hoy"/"semana actual" con `GETDATE()`, caché 60 s.
- **Reporte** — respeta `fechaInicial`/`fechaFinal`/`turno` del filtro, caché 5 min.
- **Mensual** — ventana fija de N meses que termina hoy (ignora el rango de fechas, sí respeta turno), caché 5 min.

---

## 1. IQF (producción congelada)

**Qué responde:** cuánto se congeló neto por proceso, y el rendimiento
(libras/hora) de cada línea IQF. Base: `PlantaEmpacadora`.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras congeladas netas por proceso | `dbo.AV_Produccion_Diaria_Resumen` | `SUM(PesoLibras)` agrupado por `NombreTipoProceso`+`Turno`, filtrando `VaEjecutivo=1, ProcesadaPlanta=1, fkTipo NOT IN (2,4)` (excluye RE-EMPAQUE y FRESH TAIL/materia prima) | `GET /libras-netas-proceso` (`-dia`, `-mes`) |
| Rendimiento IQF (libras/hora) por línea | `dbo.AV_Produccion_Diaria_2020` + `dbo.EquiposIQF` (nombre de equipo) | Por grupo línea/estilo/turno/día: `SUM(PesoLibras) / horas trabajadas`; el valor final de cada celda es el **promedio simple** de esos rendimientos por grupo (no libras totales ÷ horas totales); se descartan grupos con ≤15 min de trabajo; línea `SAL` excluida | `GET /iqf-libras-hora-dia` (`-mes`) |
| Contador en vivo por línea IQF (hoy) | `dbo.AV_Produccion_Diaria_2020`, día en curso | `SUM(PesoLibras)` por `LineaEquipoIQF`; "activa" si tuvo caja en los últimos 15 min | `GET /iqf-tiempo-real` |

`fkTipo`: 0=RECEPCIÓN (producción), 1=REPROCESO, 2=RE-EMPAQUE (excluido de netas), 4=REGISTRO FRESCO/FRESH TAIL (excluido, es compra de materia prima).

---

## 2. Pelado

**Qué responde:** producción y personal a destajo de pelado, por estilo,
talla y sala. Base: `STB_data` (más un proxy en `PlantaEmpacadora` para
"actividad en vivo").

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras peladas por estilo / talla (rango, día, mes) | `dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS` + `_DET`; estilo vía `PES_ASIGNACION_RECIPIENTES_LINEAS`→`PES_ESTILOS`; talla vía `DCP_TALLAS` | `SUM(LIBRAS)` del detalle no anulado | `GET /pelado-por-estilo` / `-por-talla` (`-dia`, `-mes`) |
| Personal (headcount) y pago | vista `dbo.V_PagosxPeladoIndividualPBI` | `COUNT(DISTINCT IdEmpleado)`, `SUM(libras)`, `SUM(Valor)` | `GET /pelado-personal` (`-dia`, `-mes`) |
| Libras peladas hoy por estilo / talla | mismo detalle base (`PES_ASIGNACION_LIBRAS_EMPLEADOS[_DET]`), siempre `FECHA = GETDATE()` | `SUM(LIBRAS)`, independiente del filtro de fechas | `GET /pelado-libras-hoy` / `-libras-hoy-talla` |
| Actividad y pago por sala (hoy) | mismo detalle, resuelto vía `DCP_LINEAS.ID_SALA`→`PES_SALAS` | `SUM(LIBRAS)`, `SUM(VALOR)`, `COUNT(DISTINCT empleado)` por sala; libras/hora = libras hoy ÷ horas desde el primer registro del día | `GET /pelado-por-sala` |
| "Órdenes activas" (proxy de actividad, no hay conteo real de personal en planta) | `dbo.AV_Produccion_Diaria_2020` (**PlantaEmpacadora**), `FechaHoraTorre` | Órdenes con lectura en los últimos 15 min y proceso `IQF PEELED / IQF COOK PEELED / PD BLOCK / FRESH PEELED` | `GET /pelado-tiempo-real` |

---

## 3. Recepción de camarón

**Qué responde:** camarón recibido de finca y saldo pendiente de pasar
a proceso. Base: `STB_data`. Sin filtro de turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras recibidas hoy / semana / mes | `dbo.R_REMISIONES_PLANTA` + `dbo.R_REMISIONES_PLANTA_DETALLE` | `SUM(LIBRAS)` de bins no anulados/rechazados (`ANULADA=0 AND RECHAZADA=0`) | `GET /recepcion-resumen` |
| Libras pendientes de procesar (saldo global, sin fecha) | mismas tablas | `SUM(LIBRAS)` donde `CERRADA=0 AND PROCESADO=0` | `GET /recepcion-resumen` |
| Detalle por remisión/finca/laguna: libras remisión, cola, cabeza, basura, rendimientos | vista `dbo.RemisionesPlantaPBI` (misma que Power BI) | `LibrasRemision` se suma; `LibrasCola/Cabeza/Basura` con `MAX` (son constantes por remisión-laguna); rendimiento finca = cola÷remisión; rendimiento planta = cola÷(cola+cabeza) | `GET /recepcion-remisiones` |

Nota: `R_PesadoRecepcion.LibrasNetas` dejó de poblarse en 2026-03; por eso los totales salen del detalle de bins, no de esa tabla.

---

## 4. Descabezado

**Qué responde:** volumen descabezado, dotación de personal y
rendimiento por hora. Base: `STB_data`. Sin filtro de turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras descabezadas hoy/semana/mes + personas hoy | `dbo.DES_ASIG_LBRS_EMPLEADOS` + `_DET`; personas vía `dbo.DES_EMPLEADOS_LINEAS` | `SUM(LIBRAS)` no anulado; personas = `COUNT(DISTINCT ID_EMPLEADO)` | `GET /descabezado-resumen` |
| Cola, cabezas, total, libras/hora por día o mes | vista `dbo.V_TrazabilidadDescabezadoPBI` (libras) + tablas de arriba (personas/horas) | libras/hora = total ÷ horas efectivas (entre primer y último registro del día); en mensual cada persona se cuenta una sola vez por mes | `GET /descabezado-por-dia` (`-mes`) |

---

## 5. Clasificado

**Qué responde:** producto clasificado por talla y mesa, e inventario
clasificado disponible. Base: `STB_data`. Sí respeta turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras clasificadas hoy/semana/mes | `dbo.CL_LLENADO_RECIPIENTES` + `_D` | `SUM(LIBRAS_NETA)` no anulado | `GET /clasificado-resumen` |
| Inventario clasificado disponible (bins, libras, finca, talla) | `dbo.CL_InventarioClasificado` | `EnInventario=1 AND Transferido=0 AND Procesado=0`; `bins=COUNT(*)`, `libras=SUM(LibrasNetas)` por talla (`DCP_TALLAS`) | `GET /clasificado-inventario` |
| Detalle cruzado de inventario (finca/laguna/remisión/lote/talla/destino) | `dbo.CL_InventarioClasificado` + `CL_LLENADO_RECIPIENTES[_D]` + `CL_TipoProducto` | mismo filtro que arriba, desglosado | `GET /clasificado-inventario-detalle` |
| Libras por máquina (responsable de mesa) / por talla | `dbo.CL_LLENADO_RECIPIENTES_D` + `dbo.DCP_RESPONSABLES` (= "máquina") + `DCP_TALLAS` | `SUM(LIBRAS_NETA)` agrupado; turno filtrado en código | `GET /clasificado-por-maquina` / `-por-talla` (`-dia`, `-mes`) |

Nota: "máquina" en la UI es en realidad el responsable de mesa (`DCP_RESPONSABLES`); el campo `ID_TANQUE` ya no se usa desde 2023.

---

## 6. Exportaciones

**Qué responde:** producto despachado por contenedor, cliente y estilo,
y el resumen semanal por destino. Base: `PlantaEmpacadora`. Sin turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras exportadas esta semana por destino (Francia/UK/AC Holding/Terceros) | vista `dbo.AV_Envios` | `SUM(PesoLibras)` con `NumeroContenedor` no vacío; destino por `NombreGrupo LIKE '%FRANCIA%' / '%LFF%' o '%UK%' / '%AC HOLDING%'`; Terceros = el resto | `GET /exportaciones-resumen` |
| Libras exportadas por estilo (rango) | `dbo.AV_Envios` | `SUM(PesoLibras)` agrupado por `EstiloFinal` | `GET /exportaciones-por-estilo` |
| Detalle por contenedor (másteres, anillos/máster, libras) | `dbo.AV_Envios` | agrupado por contenedor + estilo + cliente; `Másteres=COUNT(DISTINCT CodigoMaster)` | `GET /exportaciones-contenedores` |
| Contenedores por cliente y mes (últimos 6 meses) | `dbo.AV_Envios` | `COUNT(DISTINCT contenedor)` por mes/cliente | `GET /exportaciones-por-cliente-mes` |

**"Libras que faltan por exportar":** hoy **no existe** un endpoint
dedicado para esto — hubo una tabla "Órdenes Pendientes de Exportación"
(basada en la vista `dbo.AV_OrdenesCompraClientes`, columnas
`AnillosXMaster`/`KGFaltantes`) que se eliminó por completo del
dashboard. Lo más cercano disponible hoy es el módulo **Inventario**
(sección 8): `GET /api/inventory` filtrado por `disponibilidad =
DISPONIBLE` muestra el producto terminado que ya está listo en bodega y
todavía no se ha despachado (no tiene `FkEnvio`), que es conceptualmente
"lo que falta por exportar" del producto ya producido.

---

## 7. Compra de materia prima

**Qué responde:** camarón entero recibido en la semana/mes en curso, y
su desglose por mes, gramaje y proveedor. Base: `PlantaEmpacadora`. Sin turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras recibidas hoy/semana/mes + promedio semanal | vista `dbo.AV_MateriaPrima` (única fuente) | `SUM(PesoLibras)`; "hoy" = última fecha con filas en la vista (no `GETDATE()` directo, porque la recepción se registra con hasta 5 días de rezago) | `GET /compra-mp-resumen` |
| Libras por proveedor (rango) | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)`; proveedor = `NombrePropietario` o, si vacío, `NombreGrupo` | `GET /compra-mp-por-proveedor` |
| Por tipo/proveedor/item | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)`, `SUM(CantidadSerial)` agrupado por `TipoMateria`, proveedor, `Item` | `GET /compra-mp-por-item` |
| Matriz proveedor × talla (gramaje) | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)` por proveedor y `Talla` (gramaje, ej. "51/60") | `GET /compra-mp-por-talla` |
| Por mes/gramaje/proveedor (últimos 3 meses **con datos**) | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)` agregado por mes+gramaje+proveedor | `GET /compra-mp-materia-prima` |

Nota: NO se usa la tabla `dbo.MateriaPrima` (es de otro dominio —
liquidación de exportación WSO/embarque— y no tiene el gramaje de
recepción).

---

## 8. Inventario (producto terminado disponible)

**Qué responde:** producto terminado que ya no está en proceso pero
todavía no se ha despachado (lo que hay disponible en bodega ahora
mismo). Base: `PlantaEmpacadora`. Sin filtro de fechas ni turno — es una
foto del inventario actual, explorable como tabla pivote en el navegador.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Producto disponible en máster (peso, cliente, item, talla, disponibilidad, etc.) | `dbo.Seriales` → `OrdenesProduccion` → `AV_LotesRemision` → `AV_Items` → `Masteres` → `Localidades` → `Empresas`/`ClientesProduccion` | filtro `FkEnvio IS NULL` (no despachado), `FkTipo < 4`, `NoOrdenCompra <> ''`; `SUM(PesoKilos)`, `SUM(CantidadSerial)` | `GET /api/inventory` |
| Producto disponible sin máster (seriales sobrantes) | `dbo.Seriales` → `SerialesSobrantes` → `OrdenesProduccion` → `AV_Items` → `Freezers`/`Torres` | filtro `FkMaster IS NULL`; cada serial cuenta como 1 unidad | `GET /api/inventory` (misma respuesta, unida con `UNION ALL`) |
| Disponibilidad (`DISPONIBLE`/`PENDIENTE`/`RETENIDO`/`CUARENTENADO`) | `OrdenesProduccion.FkStatus` | mapeo directo 1→DISPONIBLE, 2→PENDIENTE, 3→RETENIDO, 4→CUARENTENADO | `GET /api/inventory` |

---

## 9. Resumen rápido: ¿dónde busco...?

| Pregunta de negocio | Módulo | Vista/tabla principal | Base |
| --- | --- | --- | --- |
| ¿Cuánto se congeló hoy/este mes? | IQF | `AV_Produccion_Diaria_Resumen` | PlantaEmpacadora |
| ¿Cómo va el rendimiento de una línea IQF? | IQF | `AV_Produccion_Diaria_2020` + `EquiposIQF` | PlantaEmpacadora |
| ¿Cuánto se peló y quién lo peló? | Pelado | `PES_ASIGNACION_LIBRAS_EMPLEADOS[_DET]`, `V_PagosxPeladoIndividualPBI` | STB_data |
| ¿Cuánto camarón llegó de finca? | Recepción | `R_REMISIONES_PLANTA[_DETALLE]`, vista `RemisionesPlantaPBI` | STB_data |
| ¿Cuánto se descabezó y con cuánta gente? | Descabezado | `DES_ASIG_LBRS_EMPLEADOS[_DET]`, `V_TrazabilidadDescabezadoPBI` | STB_data |
| ¿Qué inventario clasificado hay disponible por talla? | Clasificado | `CL_InventarioClasificado` | STB_data |
| ¿Qué se exportó y a quién? | Exportaciones | vista `AV_Envios` | PlantaEmpacadora |
| ¿Cuánta materia prima (camarón entero) entró? | Compra de Materia Prima | vista `AV_MateriaPrima` | PlantaEmpacadora |
| ¿Qué producto terminado hay listo sin despachar? | Inventario | `Seriales`, `OrdenesProduccion`, `AV_Items`, `Masteres` | PlantaEmpacadora |

---

Para el catálogo exhaustivo de columnas, tamaños y procedimientos
almacenados de ambas bases, ver
[`docs/Documentacion_Completa_BD_STB.md`](./Documentacion_Completa_BD_STB.md).
