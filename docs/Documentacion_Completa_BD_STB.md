# Documentación Completa de Bases de Datos — STB
## Service and Trading Business S.A. de C.V. | Sistema Camaronero Honduras

> **Motor:** Microsoft SQL Server 2019  
> **Bases de datos:** `PlantaEmpacadora` (27 GB) · `STB_data` (13 GB)  
> **Fecha:** 2026-06-23  
> **Uso:** Contexto completo para agente de IA

---

## INSTRUCCIONES PARA EL AGENTE

Eres un asistente experto en las bases de datos de STB (empresa camaronera hondureña). El sistema controla todo el proceso productivo: desde la cosecha de camarón en la finca hasta la exportación del producto terminado.

### Reglas fundamentales

1. Siempre usa `[dbo].[NombreTabla]` en los FROM/JOIN
2. Para consultas entre ambas bases: `PlantaEmpacadora.dbo.Tabla` y `STB_data.dbo.Tabla`
3. Las FKs se nombran con prefijo `fk*` o `FK*` → son claves foráneas hacia otras tablas
4. Los IDs de usuario de auditoría están en `AddUser`/`EditUser` (integer, no nombre)
5. Las fechas de auditoría son `Created` y `LastUpdated`
6. El sistema trabaja en **libras**. Conversión: libras / 2.20462 = kilos
7. Las tallas de camarón son count/pound: "21-25" = 21 a 25 camarones por libra. A mayor número = camarón más pequeño
8. La moneda base es **Lempiras hondureños (HNL / L/)**. Tasa de cambio aproximada: L/24-25 por USD
9. **Día de producción** en PlantaEmpacadora va de 6:00 AM a 5:59 AM del día siguiente — usar `CAST(DATEADD(MINUTE,-359,Seriales.Created) AS DATE)`, NO `FechaProduccion`
10. Las tablas `OrdenesProduccion_copy_240326` e `Items_todo` son backups — NO usar para datos actuales
11. La columna `fkCliente` puede apuntar a `ClientesPrincipales` o `ClientesProduccion` según el contexto — verificar la tabla de origen
12. Cuando hagas JOINs con tablas de catálogo que pueden estar vacías, usar `LEFT JOIN`
13. Pago a destajo: `LIBRAS × PrecioLibra = VALOR` en lempiras
14. Certificación ASC: campos `EsASC` / `CodigoASC` indican trazabilidad para exportación sostenible

### Qué base de datos usar

| Si el usuario pregunta sobre... | Base de datos |
|---|---|
| Seriales, masteres, paletas, packing lists, facturas, inventario de producto terminado, envíos | **PlantaEmpacadora** |
| Recepción de camarón de fincas, clasificado por talla, descabezado, pesado IQF, pago a empleados, costos diarios | **STB_data** |
| Remisiones: la cabecera operativa está en STB_data, el registro oficial en PlantaEmpacadora | **Ambas** |
| Fincas y lagunas: el catálogo maestro en PlantaEmpacadora, el catálogo operativo en STB_data (R_Fincas / R_Lagunas) | **Ambas** |

### ⚠️ Qué procedimiento almacenado usar para consultas de producción

> **REGLA CRÍTICA:** Cuando el usuario pregunte sobre **libras empacadas**, **libras producidas**, **rendimientos IQF**, **libras por hora**, **producción descongelada vs. fresca**, o cualquier análisis de **eficiencia de equipos IQF/torres/salmuera**, debes consultar directamente el procedimiento almacenado `a_Fill_Produccion_Diaria_lectura_dos` de la base de datos `PlantaEmpacadora`. Ver sección 2.4.1 para documentación completa.

| Si el usuario pregunta sobre... | Procedimiento a usar | Modo (@Resumen) |
|---|---|---|
| **Libras empacadas** por día / rango de fechas | `a_Fill_Produccion_Diaria_lectura_dos` | 27 |
| Libras producidas por día / rango de fechas (con turno correcto) | `a_Fill_Produccion_Diaria_lectura` | 1 |
| Rendimiento IQF por hora (libras/hora por equipo) | `a_Fill_Produccion_Diaria_lectura_dos` | **23** |
| Rendimiento IQF sin desglose por grupo de cliente | `a_Fill_Produccion_Diaria_lectura_dos` | 27 |
| Horas trabajadas por equipo IQF | `a_Fill_Produccion_Diaria_lectura_dos` | 30 |
| Libras descongeladas vs. frescas enviadas | `a_Fill_Produccion_Diaria_lectura_dos` | 28 |
| Script base de rendimientos (detalle por OP y ship) | `a_Fill_Produccion_Diaria_lectura_dos` | 24 |
| Libras distribuidas proporcionalmente por envío | `a_Fill_Produccion_Diaria_lectura_dos` | 25 |
| Producción por tipo de proceso (IQF, Salmuera, etc.) | `a_Fill_Produccion_Diaria_lectura` | 3 |
| Detalle serial por serial con turno | `a_Fill_Produccion_Diaria_lectura` | 0 |

**Por qué `lectura_dos` y no consultas directas a tablas:** Este SP consolida cálculos complejos (tiempos de torre, distribución proporcional de libras por ship, separación PROGRAMA vs RECHAZO) que son imposibles de reproducir correctamente con una consulta ad-hoc sobre `Seriales` o `AV_Produccion_Diaria_2020` sin conocer toda la lógica interna. Usar el SP garantiza resultados correctos y consistentes con los reportes oficiales de la empresa.

---

## 1. RESUMEN EJECUTIVO DEL SISTEMA

STB opera una empresa camaronera integrada verticalmente en Honduras. El camarón se cultiva en lagunas propias y de terceros, se procesa en la planta y se exporta principalmente a mercados europeos y norteamericanos.

### Las dos bases de datos y su rol

| Base de datos | Propósito | Tablas con datos |
|---|---|---|
| **PlantaEmpacadora** | Empaque, serialización, inventario de producto terminado, packing lists, facturas de exportación, trazabilidad serial→finca | ~100 con datos, 107 vacías |
| **STB_data** | Recepción de camarón vivo, clasificado por talla, descabezado, pesado IQF/pelado, pago a destajo de empleados, costos de producción, control biométrico | ~109 con datos, 239 vacías |

### Flujo de producción de alto nivel

```
FINCA / LAGUNA (cosecha de camarón)
        │
        ▼
STB_data: R_REMISIONES_PLANTA          ← Camión llega, se registra la remisión
        │  (REMISION_GENERAL = STB000XXXX-YY)
        │  (IdRemisionPlantaEmp → PlantaEmpacadora.Remisiones.ID)
        ▼
STB_data: R_PesadoRecepcion            ← Pesado en báscula de entrada
        │
        ├── DESCABEZADO ──► Des_PesadoCola / DES_ASIG_LBRS_EMPLEADOS_DET (pago por libra)
        │
        ├── CLASIFICADO ──► CL_LLENADO_RECIPIENTES / CL_LLENADO_RECIPIENTES_D
        │                   CL_InventarioClasificado (inventario listo)
        │
        └── PESADO IQF/PELADO ──► PES_LLENADO_RECIPIENTES / PES_ASIGNACION_LIBRAS_EMPLEADOS_DET
        │
PlantaEmpacadora: Remisiones / LotesRemision / OrdenesProduccion
        │
        ├── EMPAQUE ──► Seriales (cajitas) → Masteres (cajas) → Paletas → Envios
        │
        ├── EXPORTACIÓN ──► PackingList → Facturacion → ClientesPrincipales
        │
        └── COSTOS ──► STB_data: DCP_* / CF_* / CTB_*
```

---

## 2. BASE DE DATOS: PLANTA EMPACADORA

### 2.1 Jerarquía de empaque (concepto clave)

```
Serial (S00XXXXXXX) = una cajita individual empacada  ~13 GB, tabla MÁS GRANDE
  └── Master (M000XXXXXX) = cartón máster con N seriales  ~4 GB
        └── Paleta (P000XXXXXX) = plataforma con N masteres  ~130 MB
              └── Envío (RENE-000XXX) = ship/contenedor con N paletas
                    └── PackingList (CLIENTE-000XXX) → Factura (00001XXX)
```

---

### 2.2 TABLAS CON DATOS — Planta Empacadora

---

#### `Seriales` ⚠️ TABLA MÁS GRANDE (~13 GB, millones de filas)
**Descripción:** Cada serial es una caja/cajita individual de producto terminado. Es el núcleo de la trazabilidad.

| Columna | Tipo | Descripción |
|---|---|---|
| IDSerial | int IDENTITY | PK |
| FkOrdenProduccion | int | FK → OrdenesProduccion |
| NumeroMaster | nvarchar | Código del master contenedor |
| FkTorre | int | FK → Torres (posición en congelador IQF) |
| FkFreezer | int | FK → Freezers |
| FkMaster | int | FK → Masteres |
| FkStatus | int | FK → Estatus |
| FkEnvio | int | FK → Envios |
| AddUser | int | Usuario creador |
| Created | datetime | **Timestamp real de empaque** |
| Eliminado | bit | 1=eliminado |
| EditUser | int | |

> **CRÍTICO:** Para el día de producción usar `CAST(DATEADD(MINUTE,-359,Created) AS DATE)`. El turno va de 6 AM a 5:59 AM del siguiente día.

**Código de serial:** Patrón `S00DDMMNNN` donde DD=día, MM=mes.

---

#### `Masteres` (~4 GB, segunda tabla más grande)
**Descripción:** Caja máster/cartón que contiene múltiples seriales. Código como `M000000973`.

| Columna | Tipo | Descripción |
|---|---|---|
| IDMaster | int IDENTITY | PK |
| NumeroMaster | nvarchar | Código (M000000XXX) |
| Created | datetime | Fecha de creación |
| FkItem | int | FK → Items (producto contenido) |
| FkStatus | int | FK → Estatus |
| FkEnvio | int | FK → Envios |
| fkCliente | int | FK → ClientesProduccion |
| FkPaleta | int | FK → Paletas |
| FkLocalidad | int | FK → Localidades |
| fkEnvioEstiba | int | FK → EnviosEstibas |
| AddUser | int | |
| LastUpdated | datetime | |

**Muestra:** M000000973 (2016-04-09, Item 8, Status 2, 83 seriales)

---

#### `Paletas` (~130 MB)
**Descripción:** Plataforma que agrupa masteres. Código como `P000001731`.

| Columna | Tipo | Descripción |
|---|---|---|
| IDPaleta | int IDENTITY | PK |
| NumeroPaleta | nvarchar | Código (P000XXXXXX) |
| Created | datetime | |
| FkStatus | int | FK → Estatus |
| CantidadMasteres | int | Masteres en esta paleta |
| CantidadUnidades | decimal | Unidades totales |
| fkEnvio | int | FK → Envios |
| AddUser | int | |

**Muestra:** P000001731 (2016-06-21, 195 masteres, 16 unidades/master)

---

#### `OrdenesProduccion` (~250 MB) — TABLA PRINCIPAL DE PRODUCCIÓN
**Descripción:** Cada OP representa un lote de camarón en proceso de empaque. Código como `S002210516`.

| Columna | Tipo | Descripción |
|---|---|---|
| IDOrdenProduccion | int IDENTITY | PK |
| NumeroOP | nvarchar | Código único (ej: S002210516) |
| FkLoteRemision | int | FK → LotesRemision |
| FechaInicio | date | |
| FechaFin | date | |
| FactorRendimiento | decimal | Factor de conversión materia prima |
| FkItem | int | FK → Items (producto a empacar) |
| FkStatus | int | FK → Estatus |
| EsEntero | bit | Si es camarón entero |
| EsCola | bit | Si es cola |
| fkColor | int | FK → Colores |
| fkSabor | int | FK → Sabores |
| fkTipo | int | FK → TiposProceso |
| fkLineaProduccion | int | FK → LineasProduccion |
| fkCompromiso | int | FK → Compromisos |
| AddUser | int | |
| Created | datetime | |

**Muestra:** S002210516 (2016-05-21), LoteRemision=3151, Item=3108, factor=0.4

---

#### `Inventarios` — TABLA CENTRAL DE INVENTARIO
**Descripción:** Estado actual de cada serial/item en bodega. 63 columnas.

| Columna clave | Descripción |
|---|---|
| IDInventario | PK |
| fkTomaInventario | FK → TomaInventarios |
| FkLoteRemision | FK → LotesRemision |
| FkOrdenProduccion | FK → OrdenesProduccion |
| fkPaleta | FK → Paletas |
| fkLocalidad | FK → Localidades |
| fkMaster | FK → Masteres |
| fkEstadoMaster / fkEstadoSerial / fkEstadoOrdenProduccion | Estados |
| (+ 53 cols de cantidades, pesos, estados) | |

---

#### `BitacoradeEventosSeriales` ⚠️ (~5 GB, transaccional más grande)
**Descripción:** Bitácora de TODOS los eventos/movimientos de seriales. Registra cada cambio de estado, localidad y asignación.

| Columna | Tipo | Descripción |
|---|---|---|
| IDBitacora | int IDENTITY | PK |
| fkEvento | int | Tipo de evento |
| fkUltimaLocalidad | int | FK → Localidades |
| fkLocalidadActual | int | FK → Localidades |
| fkUser | int | Usuario |
| Fecha | datetime | Fecha del evento |
| (+ 6 cols adicionales) | | |

---

#### `RegistrodeTransacciones` (~550 MB)
**Descripción:** Registro de todas las transacciones de seriales (vincula seriales con sus movimientos).

| Columna | Tipo | Descripción |
|---|---|---|
| IDRegistro | int IDENTITY | PK |
| fkserial | int | FK → Seriales |
| fktransaccionserial | int | Tipo de transacción |
| (+ fecha, usuario, datos) | | |

---

#### `KardexProduccion`
**Descripción:** Kardex mensual de producción con resumen de entradas, salidas y saldos por año/mes.

| Columna | Tipo | Descripción |
|---|---|---|
| IDKardex | int IDENTITY | PK |
| Año | int | |
| Mes | int | |
| KilosComprados | decimal(18,2) | Total kilos comprados |
| KilosProducidos | decimal(18,2) | Total kilos producidos |
| KilosVendidos | decimal(18,2) | |
| KilosMaquilados | decimal(18,2) | |
| (+ 19 cols de saldos, ajustes, valores) | | |

**Muestra:** 2026-Mes1: 865,015 kg producidos. 2026-Mes2: 245,474 kg. 2025-Mes12: 700,911 kg.

---

#### `Items` — CATÁLOGO MAESTRO DE PRODUCTOS (42 columnas)
**Descripción:** Cada ítem es una SKU específica con todos los atributos de empaque, talla, estilo, marca. Es el catálogo central de productos terminados.

| Columna | Tipo | Descripción |
|---|---|---|
| IDItem | int IDENTITY | PK |
| Codigo | nvarchar | Código del ítem (ej: NABL01-ML) |
| Descripcion | nvarchar | Descripción completa |
| FkTipoItem | int | FK → TiposItem |
| PesoNeto | decimal | Peso neto por caja (kg) |
| PesoBruto | decimal | Peso bruto por caja |
| FkMarca | int | FK → Marcas |
| FkEmpaque | int | FK → Empaques (IR=IQF Crudo, BL=Block, FR=Freezado) |
| FkEstilo | int | FK → Estilos |
| FkTalla | int | FK → Tallas |
| fkUnidaddemedida | int | FK → UnidadesMedida |
| fkTipoMercado | int | FK → TiposMercado |
| fkTipoVenta | int | FK → TiposVentas |
| fkCliente | int | FK → ClientesPrincipales (cliente dueño del item) |
| fkEstiloFinal | int | FK → EstiloFinal |
| fkTipoProceso | int | FK → TiposProceso |
| fkCodigoContable | int | FK → ItemCuentasContables |
| (+ 25 cols de precio, especificaciones técnicas, auditoría) | | |

**Muestra:** `NABL01-ML` = STB BLK 5 LBS PS/ML (Block 5 lbs), `NVFR20-150/200` = STB FREEZADO 20KG COLA 150/200

---

#### `Envios`
**Descripción:** Envíos o despachos de producto terminado. Cada envío agrupa paletas hacia un destino.

| Columna | Tipo | Descripción |
|---|---|---|
| IDEnvio | int IDENTITY | PK |
| NumeroEnvio | nvarchar | Código (ej: RENE-000039, REP23-000353) |
| FechaEnvio | date | Fecha del envío |
| Procesado | bit | |
| Exportacion | bit | Si es para exportación |
| FkEmbarque | int | FK → Embarques |
| fkTipoEnvio | int | FK → TiposEnvios |
| fkTipoVenta | int | FK → TiposVentas |
| AddUser | int | |
| Created | datetime | |
| fkClienteDestino | int | FK → ClientesProduccion |

**Muestra:** RENE-000039 (2024-08-24), REP23-000353 (2024-08-23), ACHME-000051

---

#### `EnviosEstibas`
**Descripción:** Detalle de estibas (posiciones físicas en contenedor) de cada envío.

| Columna | Tipo | Descripción |
|---|---|---|
| IDEstiba | int IDENTITY | PK |
| fkEnvio | int | FK → Envios |
| NumeroEstiba | int | Número de posición |
| Tipo | nvarchar(1) | H=helado, C=congelado |
| CantidadPaletas | int | |
| Cerrado | bit | |

---

#### `PackingList` (44 columnas) — PACKING LIST DE EXPORTACIÓN
**Descripción:** Cada registro es un PL de un embarque al exterior. Código como `COEX1-000259`.

| Columna | Tipo | Descripción |
|---|---|---|
| IDPackingList | int IDENTITY | PK |
| NumeroPackingList | nvarchar | Código (CLIENTE-XXXXXX) |
| Estado | int | |
| Exportacion | bit | |
| fkEmpresa | int | FK → Empresas |
| FechaEmbarque | date | |
| FechaEntrega | date | |
| fkCliente | int | FK → ClientesProduccion |
| fkLineaNaviera | int | FK → Navieras |
| fkExportador | int | FK → Exportadores |
| fkDestinoCarga | int | FK → DestinosCarga |
| fkEnvio | int | FK → Envios |
| fkFactura | int | FK → Facturacion |
| (+ 31 cols de totales, leyendas, navieras, auditoría) | | |

**Muestra:** CARFU-000001 (2016-09-12), NOVAL-000033, COEX1-000187 (para COEXMAR)

---

#### `PackingListDetalle`
**Descripción:** Detalle de cada Packing List — los ítems con cantidades, finca de origen y precio.

| Columna | Tipo | Descripción |
|---|---|---|
| IDDetallePL | int IDENTITY | PK |
| fkPackinList | int | FK → PackingList |
| fkItem | int | FK → Items |
| fkFinca | int | FK → Fincas |
| Cajas | int | |
| KilosNetos | decimal | |
| KilosBrutos | decimal | |
| PrecioUnitario | decimal | |
| ValorTotal | decimal | |
| (+ talla, certificación, auditoría) | | |

---

#### `Facturacion` (46 columnas)
**Descripción:** Facturas de exportación emitidas. Vinculada a un Packing List. Con datos fiscales SAR.

| Columna | Tipo | Descripción |
|---|---|---|
| IDFactura | int IDENTITY | PK |
| NumeroFactura | nvarchar | Número correlativo (ej: 00001493) |
| NumeroFacturaCompleto | nvarchar | Número completo SAR |
| TipoFactura | int | |
| fkCliente | int | FK → ClientesProduccion |
| fkClientePrincipal | int | FK → ClientesPrincipales |
| fkPackingList | int | FK → PackingList |
| FechaFactura | date | |
| fkMoneda | int | FK → TiposMonedas |
| fkCAI | int | FK → CAIConfiguracion |
| fkIncoTerms | int | FK → IncoTerms |
| fkDestinoCarga | int | FK → DestinosCarga |
| fkLineaNaviera | int | FK → Navieras |
| TasaCambio | decimal(18,9) | Tipo de cambio |
| (+ 32 cols adicionales) | | |

**Muestra:** Factura 00001493 (2017-03-16) para COEXMAR, PL COEX1-000259.

---

#### `FacturacionDetalle`
**Descripción:** Líneas de detalle de cada factura: ítems con cantidades y precios.

| Columna | Tipo | Descripción |
|---|---|---|
| IDDetalle | int IDENTITY | PK |
| fkFactura | int | FK → Facturacion |
| fkItem | int | FK → Items |
| Cajas | int | Cantidad de cajas |
| Libras | decimal | Libras/kg |
| PrecioUnitario | decimal | Precio por unidad |
| Total | decimal | Total de la línea |
| fkPrecioClienteP | int | FK → FacturacionPrecios |

---

#### `FacturacionPrecios`
**Descripción:** Lista de precios por cliente para facturación. Define precios por ítem/período.

| Columna | Tipo | Descripción |
|---|---|---|
| IDPrecio | int IDENTITY | PK |
| fkCliente | int | FK → ClientesPrincipales |
| fkItem | int | FK → Items |
| Precio | decimal | Precio unitario |
| FechaVigencia | date | Desde cuándo |

---

#### `FacturacionOtrosProductos`
**Descripción:** Productos adicionales facturados (hielo, material de empaque) no incluidos en el detalle principal.

---

#### `MateriaPrima` (24 columnas)
**Descripción:** Registro de recepciones de materia prima desde proveedores. Vincula lotes de finca con órdenes de compra.

| Columna | Tipo | Descripción |
|---|---|---|
| IDMateriaPrima | int IDENTITY | PK |
| PeriodoCompra | nvarchar | Período (ej: H1-2025) |
| FechaRecepcion | date | |
| fkPropietario | int | FK → Empresas |
| CantidadKilos | decimal | |
| fkFinca | int | FK → Fincas |
| TallaCompra | nvarchar | Talla del camarón comprado |
| PrecioKilo | decimal | |
| PrecioLibra | decimal | |
| PrecioTotal | decimal | |
| NombreProveedor | nvarchar | |

**Muestra:** H1-2025, EXPORT-00180, camarón ANILLOS 61/70, finca 36050, 185 cajas, $185/caja

---

#### `LotesRemision`
**Descripción:** Lotes de camarón asociados a cada remisión. Cada lote identifica una siembra/cosecha específica.

| Columna | Tipo | Descripción |
|---|---|---|
| IDLoteRemision | int IDENTITY | PK |
| fkRemision | int | FK → Remisiones |
| Fksiembra | int | FK → Siembras |
| fkDestino | int | FK → Destinos |
| NoLote | nvarchar | Número de lote |
| Kilos | decimal | Kilos del lote |
| Estado | int | |

---

#### `DetalleRemisiones` (12 columnas)
**Descripción:** Detalle de cada remisión: los lotes individuales de camarón entregados.

| Columna | Tipo | Descripción |
|---|---|---|
| IDDetalle | int IDENTITY | PK |
| Fkloteremision | int | FK → LotesRemision |
| Talla | nvarchar | Talla del camarón |
| PesoNeto | decimal | Kilos netos |
| PesoBruto | decimal | Kilos brutos |
| Entero | bit | 1=entero, 0=cola |
| EsDesecho | bit | Si es desecho |
| IdRemisionSTB | int | FK → Remisiones (ID en STB) |

---

#### `Fincas` (10 columnas)
**Descripción:** Catálogo maestro de fincas/granjas acuícolas proveedoras de camarón.

| Columna | Tipo | Descripción |
|---|---|---|
| IDFinca | int IDENTITY | PK |
| NombreFinca | nvarchar | Nombre de la finca |
| fkEmpresa | int | FK → Empresas (dueño) |
| Codigo | nvarchar | Código corto |
| fkGrupo | int | FK → FincasGrupos |
| fkPropietario | int | FK → Empresas (propietario) |
| Certificada | bit | Si tiene certificación |

**Muestra:** FINCA EL ARROYO, FINCA 02, LOS LOROS

---

#### `Lagunas` (9 columnas)
**Descripción:** Lagunas/estanques dentro de cada finca donde se siembra el camarón.

| Columna | Tipo | Descripción |
|---|---|---|
| IDLaguna | int IDENTITY | PK |
| NombreLaguna | nvarchar | Nombre o código de la laguna |
| fkfinca | int | FK → Fincas |
| HectareasAgua | decimal | Área de agua |
| Activo | bit | |

**Muestra:** Lagunas 0874C (Finca 4169), 31 (Finca 14810), 0216C (Finca 1050)

---

#### `FincasCertificados` (11 columnas)
**Descripción:** Certificaciones vigentes por finca (ASC, orgánico, etc.).

| Columna | Tipo | Descripción |
|---|---|---|
| IDCertificado | int IDENTITY | PK |
| fkFinca | int | FK → Fincas (0=todas las fincas) |
| NumeroCertificado | nvarchar | Número oficial |
| TipoCertificado | nvarchar | CUP, ASC, etc. |
| FechaVigencia | date | |
| FechaVencimiento | date | |

**Muestra:** CUP-C-858849-ASC-01-2019-SH, vigencia 2022-05-28

---

#### `ClientesProduccion` (26 columnas)
**Descripción:** Clientes para el módulo de producción (propietarios del camarón / compradores). IDs comienzan en 1000+.

| Columna | Tipo | Descripción |
|---|---|---|
| IDCliente | int IDENTITY | PK |
| Nombre | nvarchar | Nombre |
| Codigo | nvarchar | Código corto (5 chars) |
| RTN | nvarchar | RTN fiscal |
| ClaseCliente | int | 0=NO_CLASIFICADO, 1=MAQUILA TERCEROS, 2=PROGRAMA |
| EsParaMateriaPrima | bit | |
| EsParaExportacion | bit | |

**Muestra:** ID 1009=AC HOLDING, FRANCIA DP, LFF UK

---

#### `ClientesPrincipales` (24 columnas)
**Descripción:** Clientes de exportación directa. Empresas a las que se factura y exporta el camarón.

| Columna | Tipo | Descripción |
|---|---|---|
| IDClientePrincipal | int IDENTITY | PK |
| Nombre | nvarchar | Nombre del cliente |
| Codigo | nvarchar | Código (ej: COEX1) |
| RTN | nvarchar | RTN |
| CiudadPais | nvarchar | Ciudad y país |
| NumeroExportador | nvarchar | Número SAR |

**Muestra:** COEXMAR (Choluteca/Honduras), AC HOLDING, ACOMAR

---

#### `Compromisos` (13 columnas)
**Descripción:** Compromisos de compra de camarón firmados con proveedores por período.

| Columna | Tipo | Descripción |
|---|---|---|
| IDCompromiso | int IDENTITY | PK |
| fkProveedor | int | FK → ClientesProduccion |
| LibrasEntero | int | Libras comprometidas entero |
| LibrasCola | int | Libras comprometidas cola |
| PctEntero | decimal(9,2) | % entero |
| Exportacion | bit | |
| FechaInicio / FechaFin | date | Período |
| Descripcion | nvarchar | Período (ej: "2024-2025") |

---

#### `OrdenesCompra` (27 columnas)
**Descripción:** Órdenes de compra de materia prima a proveedores.

| Columna | Tipo | Descripción |
|---|---|---|
| IDOrdenCompra | int IDENTITY | PK |
| NumeroOC | nvarchar | Número de la OC |
| FechaOC | date | |
| fkCliente | int | FK → ClientesPrincipales |
| fkClienteProduccion | int | FK → ClientesProduccion |
| fkProducto | int | FK → Items |
| CantidadOrdenada | decimal | Kilos ordenados |
| CantidadRecibida | decimal | |

---

#### `Localidades` (8 columnas)
**Descripción:** Localidades físicas de almacenamiento: cuartos fríos, bodegas, freezers, IQF.

| Columna | Tipo | Descripción |
|---|---|---|
| IDLocalidad | int IDENTITY | PK |
| NombreLocalidad | nvarchar | Nombre descriptivo |
| Tipo | int | Tipo de localidad |
| Capacidad | decimal | Capacidad en kg/lb |
| Activo | bit | |

---

#### `Freezers`
**Descripción:** Congeladores/equipos de congelado IQF.

| Columna | Descripción |
|---|---|
| IDFreezer | PK |
| Nombre | Nombre del equipo |
| fkTipo | FK → TiposFreezer |

---

#### `OPMonitoreo` (23 columnas)
**Descripción:** Monitoreo de parámetros de calidad durante el proceso de una OP (temperatura, rendimiento, etc.).

---

#### `CAIConfiguracion` (14 columnas)
**Descripción:** Certificados de Autorización de Impresión (CAI) del SAR hondureño para facturas.

| Columna | Descripción |
|---|---|
| IDCai | PK |
| NumeroCAI | Código CAI del SAR |
| fkEmpresa | FK → Empresas |
| FechaLimiteEmision | Fecha máxima de uso |
| Activo | Si está vigente |

---

#### `CalendarioContable`
**Descripción:** Períodos contables del año (meses). Muestra: contiene períodos 2025.

---

#### `CierresTiposProceso`
**Descripción:** Cierre de procesos productivos por tipo y período.

| Columna | Descripción |
|---|---|
| fkPeriodo | Período productivo |
| fkTipoProceso | Tipo de proceso |
| Cerrado | Estado |

---

#### `ProductosCliente` (14 columnas)
**Descripción:** Especificaciones de producto por cliente — cómo quiere el cliente su producto.

| Columna | Descripción |
|---|---|
| IDProductoCliente | PK |
| fkClienteEmpresa | FK → Empresas |
| fkClienteProduccion | FK → ClientesProduccion |
| CodigoProducto | Código del cliente |
| fkEstilo | FK → Estilos |
| CantidadPiezas | Piezas por caja |
| PesoNeto | Peso neto |
| GramajeUnidad | Gramaje por pieza |

**Muestra:** MD180114=CCUP 126G PTO 71/90 AM ASC SANS AB (75 piezas, 9.45 oz, 126g)

---

#### `ItemCuentasContables`
**Descripción:** Mapa de cuentas contables para los ítems del sistema.

**Muestra:** 4000-001=MAQUILA LANGOSTA, 4000-002=MAQUILA WSO, 4000-003=MAQUILA PD BLOCK

---

#### `Configuraciones`
**Descripción:** Parámetros del sistema en formato clave-valor.

**Muestra:** ID TIPO ITEM BLOCK=3, ID TIPO ITEM IQF=6, ID TIPO ITEM IQF AL DETALLE=8

---

#### `ISV`
**Descripción:** Porcentajes del Impuesto Sobre la Venta. Muestra: 0% y 15% (exportaciones van al 0%).

---

#### `OCPeriodos`
**Descripción:** Períodos de órdenes de compra (cosechas/temporadas).

**Muestra:** H1-2025 (2025-04-01 a 2025-05-01), H2-2025, Q1Q2-2026

---

#### `PeriodosProduccion`
**Descripción:** Períodos de producción por año. Muestra: H2-2024 (Jul-Dic 2024), Q1Q2-2026, Q3Q4-2026.

---

### 2.3 TABLAS VACÍAS — Planta Empacadora (107 tablas)

> Estas tablas tienen 0 registros en el dump pero son referenciadas por tablas con datos. Al hacer JOINs, usar `LEFT JOIN`.

| Tabla | Propósito |
|---|---|
| `Estatus` | **Catálogo de estados** (referenciado por Masteres, Paletas, Seriales, OrdenesProduccion) |
| `Tallas` | **Catálogo de tallas de camarón** (U/15, 16/20, 21/25, 26/30...) |
| `TiposItem` | **Tipos de ítem** (BLOCK=3, IQF=6, IQF AL DETALLE=8, FREEZADO...) |
| `Estilos` | **Catálogo de estilos** (PD=Peeled-Deveined, WSO=Without Shell On, etc.) |
| `Remisiones` | Remisiones de camarón (datos viven operativamente, verificar si vacía en producción) |
| `Siembras` | Siembras en lagunas |
| `Embarques` | Datos de embarques marítimos |
| `LineasProduccion` | Líneas de producción |
| `Navieras` | Líneas navieras |
| `DestinosCarga` | Destinos de carga de exportación |
| `TomaInventarios` | Encabezados de tomas de inventario |
| `TomaInventariosSeriales` | Seriales en tomas de inventario |
| `Torres` | Torres del sistema IQF |
| `ExistenciasLocalidad` | Existencias por localidad (resumen) |
| `Evaluaciones` | Evaluaciones de calidad |
| `TiposProceso` | Tipos de proceso productivo |
| `TiposEnvios` | Tipos de envíos |
| `TiposVentas` | Tipos de venta |
| `Sabores` | Catálogo de sabores |
| `Empleados` | Empleados de la planta |
| `FacturacionInterna` / `FacturacionInternaDetalle` | Facturación interna |
| `Facturas` | Facturas de clientes locales |
| `MovimientosInvProceso` | Movimientos de inventario en proceso |
| `Bines` | Contenedores tipo bin de recepción |
| `IncoTerms` | Términos INCOTERM (FOB, CIF, EXW...) |
| `UnidadesMedida` | Unidades de medida (KG, LB, etc.) |
| `TiposMonedas` | Monedas (USD, HNL) |
| `Exportadores` | Exportadores registrados |
| `Destinos` | Destinos de materia prima |
| `Mercados` | Mercados destino |
| `FormasPago` / `TerminosPago` | Formas y términos de pago |
| `PaletasReservadas` | Paletas reservadas para envío |
| `OtrosProductos` (tiene datos) | Hielo, material de empaque, etc. |
| (+ 80 tablas más de configuración, catálogos, sistema) | |

---

### 2.4 PROCEDIMIENTOS ALMACENADOS — Planta Empacadora

#### Prefijos y su uso

| Prefijo | Propósito |
|---|---|
| `a_Fill_*` | **Reportes** — retornan SELECT para grillas en app y Power BI |
| `Movil_*` | **App móvil** — CRUD para app de escaneo/movilidad en planta |
| `SP_*` / `sp_*` | **Operaciones del sistema** — INSERT/UPDATE/DELETE de lógica de negocio |

---

#### GRUPO `a_Fill_*` — Reportes de Producción

##### `a_Fill_Produccion_Diaria` / `_B` / `_u`
**Parámetros:** `@Resumen INT`, `@Fecha_Inicial DATE`, `@Fecha_Final DATE` (+ `@Usuario` en variante `_u`)  
**Tablas:** Seriales, Masteres, OrdenesProduccion, Items, LotesRemision, Siembras, Fincas, Lagunas, Empresas, ClientesProduccion, Envios  
**Entrega cuando @Resumen=0:** Detalle serial por serial: CodigoSerial, Item, Talla, Estilo, PesoLibras, FechaProduccion, Finca, Laguna, Ciclo, Empresa, Freezer, Torre, FincaCertificada, LineasProduccion.  
**IMPORTANTE:** Usa `DiaProduccion2024 = CAST(DATEADD(MINUTE,-359,Seriales.Created) AS DATE)` para el día de producción.

##### `a_Fill_Produccion_OP`
**Parámetros:** `@OrdenProduccion CHAR(7)`  
**Entrega:** Todo el detalle de una OP específica: cuántos seriales, peso total, estado, finca de origen.

##### `a_Fill_Produccion_Palet`
**Parámetros:** `@Paleta CHAR(10)`  
**Entrega:** Contenido completo de una paleta: masteres, seriales, libras, item, fecha de producción.

##### `a_Fill_Produccion_Master`
**Parámetros:** `@CodigoMaster CHAR(10)`  
**Entrega:** Contenido de un master: seriales, libras, item.

##### `a_Fill_Produccion_kardex`
**Entrega:** Kardex de movimientos de inventario de producción (entradas, salidas, traslados).

##### `a_Fill_ProductoEnProceso`
**Parámetros:** `@Resumen BIT`  
**Entrega:** Producto actualmente en proceso (seriales creados que no están en inventario ni enviados).

##### `a_Fill_Produccion_Diaria_CERT`
**Entrega:** Producción diaria filtrada solo por fincas certificadas (ASC u otros).

##### `a_Fill_Produccion_Diaria_turno` / `_turno_dos` / `_turno_tres`
**Entrega:** Producción diaria agrupada por turno de producción.

##### `a_Fill_Produccion_Diaria_materia_prima`
**Entrega:** Producción diaria ligando cada serial con la materia prima (finca, laguna, propietario, precio de compra).

##### `a_Fill_Produccion_Diaria_rechazo`
**Entrega:** Producción destinada a rechazo (producto que no cumple estándares).

##### `a_Fill_LecturaTorres` / `_resumen` / `_u`
**Entrega:** Lectura de torres IQF: producto en cada torre, estado, capacidad usada.

##### `a_Fill_Ordenes_Produccion`
**Parámetros:** `@Fecha_Inicial DATE`, `@Fecha_Final DATE`  
**Entrega:** Órdenes de producción en el período con estado, libras, empresa.

---

### 2.4.1 DOCUMENTACIÓN COMPLETA — `a_Fill_Produccion_Diaria_lectura_dos` ⭐

> **Este SP es la fuente canónica para cualquier consulta sobre libras producidas o rendimientos IQF.** Siempre usarlo en lugar de consultas ad-hoc sobre tablas base.

**Autor:** Jairo Hernandez  
**Creado:** 4 de diciembre de 2024  
**Base de datos:** `PlantaEmpacadora`  
**Ejecución:** `EXEC [PlantaEmpacadora].[dbo].[a_Fill_Produccion_Diaria_lectura_dos] @Resumen = N, @Fecha_Inicial = '2025-01-01', @Fecha_Final = '2025-01-31'`

#### Descripción general

Complemento especializado de `a_Fill_Produccion_Diaria_lectura` enfocado en **rendimientos de producción**: rendimiento por hora en equipos IQF, análisis de producto descongelado vs. fresco, y cálculos de eficiencia de proceso. Usa el campo `DiaProducccion2024` (fecha lógica del turno, no `FechaProduccion`) para filtrar correctamente los turnos nocturnos que cruzan la medianoche.

#### Concepto clave: `DiaProducccion2024`
Cuando un turno de noche empieza el lunes y termina el martes, `FechaProduccion` puede registrar el martes, pero `DiaProducccion2024` registra el lunes — el día al que pertenece ese turno lógicamente. Este SP (y `lectura`) corrigen este problema introducido en diciembre 2024.

#### Parámetros

| Parámetro | Tipo | Descripción |
|---|---|---|
| `@Resumen` | INT | Modo de consulta (ver índice abajo) |
| `@Fecha_Inicial` | DATE | Fecha de inicio del rango |
| `@Fecha_Final` | DATE | Fecha de fin del rango |

> **Nota:** Para los modos 24, 25, 28, 29 y 31 el filtro es por `FechaCarga = @Fecha_Inicial` (fecha de envío/despacho), no por fecha de producción.

#### Índice de modos disponibles

| @Resumen | Nombre | Cuándo usar |
|---|---|---|
| 0 | Detalle completo | No se usa en producción (solo diagnóstico) |
| 23 | Rendimientos IQF por hora (con cliente/estilo) | **⭐ Modo por defecto para cualquier consulta de libras/hora IQF** |
| 24 | Script base de rendimientos (detalle por OP y ship) | Ver composición de cada envío descongelado/fresco |
| 25 | Libras distribuidas proporcionalmente | Cuántas libras de cada OP van a cada ship |
| 27 | Rendimientos IQF FLAT 100% (sin NombreGrupo) | Variante simplificada del 23 — omite el desglose por grupo de cliente |
| 28 | Rendimientos descongelado + fresco agrupado | Resumen por fecha de carga y estilo |
| 29 | Detalle libras SHIP descongelado puntual | Debug/análisis puntual (hardcoded) |
| 30 | Horas trabajadas por equipo IQF | Ver cuánto tiempo operó cada equipo |
| 31 | Detalle libras SHIP fresco puntual | Debug/análisis puntual (hardcoded) |

---

#### Modo 0 — Detalle completo (diagnóstico)
**Vista:** `AV_Produccion_Diaria_2020`  
**Filtro:** `CAST(DiaProducccion2024 AS DATE) = @Fecha_Inicial AND fkTipo < 4`  
No se usa en producción. Mismo esquema que `a_Fill_Produccion_Diaria @Resumen=0`.

---

#### Modo 23 — Rendimientos IQF por hora ⭐ MODO POR DEFECTO

> **Usar este modo por defecto** cuando el usuario pida libras por hora de los IQF, rendimiento de equipos IQF, o cualquier consulta relacionada con eficiencia de líneas IQF en un rango de fechas.

**Vistas:** `AV_Produccion_Diaria_2020` UNION ALL con `AV_Produccion_Diaria_2020 INNER JOIN EquiposIQF`  
**Filtro:** `DiaProducccion2024 BETWEEN fechas AND fkTipo < 4 AND CategoriaLinea LIKE '%IQF%'` + `HAVING minutos > 15`

Calcula cuántas libras por hora produce cada línea IQF combinando:
1. Líneas IQF directas (CategoriaLinea contiene 'IQF')
2. Salmueras procesadas en equipos IQF (via tabla `EquiposIQF`)

Solo incluye turnos con más de 15 minutos de duración (evita datos espurios de arranque/parada).

**Campos retornados:**

| Campo | Descripción |
|---|---|
| `CategoriaLinea` | Nombre de la línea/equipo IQF |
| `EstiloFinal` | Estilo final del producto |
| `NombreEjecutivo` | Cliente/ejecutivo |
| `NombreGrupo` | Grupo del cliente |
| `Turno` | Turno de producción |
| `DiaProducccion2024` | Día lógico del turno |
| `TotalLibras` | SUM(PesoLibras) — libras totales producidas |
| `Minimo` | MIN(FechaHoraTorre) — primera hora de salida de torre |
| `Maximo` | MAX(FechaHoraTorre) — última hora de salida de torre |
| `TiempoHorasMinutos` | Tiempo transcurrido en formato HH:MM |
| `TiempoHorasDecimales` | Tiempo en horas decimales (ej: 2.5) |
| `RendimientoLibrasPorHora` | TotalLibras / TiempoHorasDecimales |

**Fórmulas internas:**
- Tiempo: `DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre))`
- Rendimiento: `SUM(PesoLibras) / (minutos / 60)` → retorna 0 si tiempo = 0

**Ejemplo de consulta:**
```sql
EXEC [PlantaEmpacadora].[dbo].[a_Fill_Produccion_Diaria_lectura_dos]
    @Resumen = 23,
    @Fecha_Inicial = '2025-06-01',
    @Fecha_Final = '2025-06-30'
```

---

#### Modo 27 — Rendimientos IQF FLAT 100% (variante simplificada del modo 23)
**Descripción:** Versión simplificada del modo 23. Usar solo cuando no se necesite desglose por grupo de cliente; en cualquier otro caso, preferir el modo 23. Sin el campo `NombreGrupo` en el agrupamiento.

**Campos retornados:** Iguales al modo 23 **excepto que no incluye `NombreGrupo`**:

| Campo | Descripción |
|---|---|
| `CategoriaLinea` | Nombre del equipo IQF |
| `EstiloFinal` | Estilo final del producto |
| `NombreEjecutivo` | Cliente/ejecutivo |
| `Turno` | Turno |
| `DiaProducccion2024` | Día lógico del turno |
| `TotalLibras` | Libras producidas |
| `Minimo` | Primera hora de torre |
| `Maximo` | Última hora de torre |
| `TiempoHorasMinutos` | Tiempo HH:MM |
| `TiempoHorasDecimales` | Tiempo decimal |
| `RendimientoLibrasPorHora` | Libras por hora |

**Ejemplo de consulta:**
```sql
EXEC [PlantaEmpacadora].[dbo].[a_Fill_Produccion_Diaria_lectura_dos]
    @Resumen = 27,
    @Fecha_Inicial = '2025-06-01',
    @Fecha_Final = '2025-06-30'
```

---

#### Modo 30 — Horas trabajadas por equipo IQF (sin desglose por cliente)
**Vista:** `AV_Produccion_Diaria_2020`  
**Filtro:** `DiaProducccion2024 BETWEEN fechas AND fkTipo < 4 AND CategoriaLinea LIKE '%IQF%'` + `HAVING minutos > 15`

Versión ultra-simplificada del modo 23. Agrupa únicamente por `CategoriaLinea`, `Turno` y `DiaProducccion2024`. Ideal para ver el tiempo de operación de cada equipo sin importar el cliente o estilo.

**Campos retornados:**

| Campo | Descripción |
|---|---|
| `CategoriaLinea` | Nombre del equipo/línea IQF |
| `Turno` | Turno |
| `DiaProducccion2024` | Día lógico |
| `TotalLibras` | Libras totales |
| `Minimo` | Primera hora de torre |
| `Maximo` | Última hora de torre |
| `TiempoHorasMinutos` | HH:MM |
| `TiempoHorasDecimales` | Horas decimales |
| `RendimientoLibrasPorHora` | Libras por hora |

---

#### Modo 24 — Script base de rendimientos (detalle por OP y ship)
**Fuentes:** `AV_Ship_TotalLibras` → `OPship` → `AV_OrdenesProducccion_TotalLibras` → `AV_LotesRemision`  
**Filtro:** `FechaCarga = @Fecha_Inicial` (una sola fecha de despacho)  
**UNION ALL con:** `AV_Ship_TotalLibras_fresco` (para producto fresco)

Lista las libras enviadas en los SHIPs de descongelado/reempaque y fresco, junto con las OPs que componen cada envío. Es el script base para calcular rendimientos de cuánto salió vs. cuánto entró como materia prima.

**Flujo de datos:**
```
AV_Ship_TotalLibras (descongelado+reempaque, TipoDestino 2 y 3)
    │ JOIN OPship (por ReferenciaEnvio)
    │ JOIN AV_OrdenesProducccion_TotalLibras (por OrdenProduccion)
    │ JOIN AV_LotesRemision (por FkLoteRemision)
UNION ALL
AV_Ship_TotalLibras_fresco (fresco, TipoDestino = 4)
    │ (mismos joins)
```

**Campos retornados:**

| Campo | Fuente | Descripción |
|---|---|---|
| `IdEnvio` | AV_Ship_TotalLibras | ID del envío |
| `ReferenciaEnvio` | Ship | Referencia (ej: `DESGDO-00037`) |
| `FechaCarga` | Ship | Fecha del envío |
| `TipoDestinoTexto` | Ship | DESCONGELADO, REEMPAQUE o FRESCO |
| `TipoEstilo` | Ship | Código de estilo |
| `TipoEstiloTexto` | Ship | Descripción del estilo |
| `OrdenProduccion` | OP | Número de OP |
| `FechaProduccion` | OP | Fecha de producción |
| `fkItem` | OP | ID del item |
| `CodigoItem` | OP | Código del item |
| `DescripcionItem` | OP | Descripción del producto |
| `fkTipo` | OP | Tipo de OP |
| `FkLoteRemision` | OP | Lote de remisión (materia prima) |
| `ClaseClienteTexto` | AV_LotesRemision | `'PROGRAMA'` o `'RECHAZO'` |
| `LibrasShip` | Ship.TotalLibras | Libras del envío completo |
| `TotalLibras` | OP.TotalLibras | Libras de la orden de producción |

**Orden:** `ReferenciaEnvio, OrdenProduccion`

---

#### Modo 25 — Libras distribuidas proporcionalmente
**Descripción:** Extiende el modo 24 calculando cuántas libras de cada OP le corresponden a cada envío de forma proporcional. Útil cuando una OP alimenta múltiples envíos.

**Fórmula de distribución:**
```
LibrasDistribuidas = OP.TotalLibras × Ship.TotalLibras / TotalLibrasReferencia
```
donde `TotalLibrasReferencia` = suma de todas las OPs de esa referencia de envío.

**Campos adicionales vs modo 24:**

| Campo | Descripción |
|---|---|
| `LibrasDistribuidas` | Libras de la OP atribuibles proporcionalmente a este envío |
| `PromedioGeneral` | 0.0 — placeholder para cálculos externos |
| `Promedio_PRO` | 0.0 — placeholder |
| `Promedio_REC` | 0.0 — placeholder |
| `TotalLibrasProd` | 0.0 — placeholder |

**Orden:** `FechaCarga, ReferenciaEnvio`

---

#### Modo 28 — Rendimientos descongelado + fresco agrupados
**Descripción:** Agrupado por `FechaCarga + TipoDestinoTexto + TipoEstiloTexto`. Separa libras de PROGRAMA vs. RECHAZO y calcula libras descongeladas distribuidas proporcionalmente. Combina DESCONGELADO (TipoDestino=2) y FRESCO (TipoDestino=4) con UNION ALL.

**Campos retornados:**

| Campo | Descripción |
|---|---|
| `FechaCarga` | Fecha del envío |
| `TipoDestinoTexto` | `DESCONGELADO` o `FRESCO` |
| `TipoEstiloTexto` | Estilo del producto |
| `TotalLibrasPrograma` | Libras de materia prima tipo PROGRAMA |
| `TotalLibrasRechazo` | Libras de materia prima tipo RECHAZO |
| `TotalLibrasDescongeladas` | Libras distribuidas proporcionalmente |
| `PromedioGeneral` | 0.0 (placeholder) |
| `Promedio_PRO` | 0.0 (placeholder) |
| `Promedio_REC` | 0.0 (placeholder) |
| `TotalLibrasProd` | 0.0 (placeholder) |

**Orden:** `FechaCarga, TipoDestinoTexto, TipoEstiloTexto`

**Ejemplo de consulta:**
```sql
EXEC [PlantaEmpacadora].[dbo].[a_Fill_Produccion_Diaria_lectura_dos]
    @Resumen = 28,
    @Fecha_Inicial = '2025-06-15',
    @Fecha_Final = '2025-06-15'
```

---

#### Modos 29 y 31 — Detalle SHIP puntual (análisis de debug)
**Nota:** Estos modos tienen la referencia hardcoded a `'FRESCO-00041'`. Son modos de análisis puntual, **no de uso general en producción**.

- **Modo 29:** Detalle de libras descongeladas de un SHIP específico via `AV_Ship_TotalLibras`
- **Modo 31:** Detalle de libras del SHIP fresco via `AV_Ship_TotalLibras_fresco`

**Campos comunes:** `IdEnvio`, `ReferenciaEnvio`, `FechaCarga`, `LibrasShip`, `TipoEstiloTexto`, `TipoDestinoTexto`, `OrdenProduccion`, `FechaProduccion`, `fkItem`, `CodigoItem`, `DescripcionItem`, `fkTipo`, `DestinoFinal`, `DestinoProductoTexto`, `TotalLibras`

---

#### Vistas y tablas que usa este SP

| Objeto | Tipo | Propósito |
|---|---|---|
| `AV_Produccion_Diaria_2020` | Vista | Producción a nivel serial (modos 0, 23, 27, 30) |
| `AV_Ship_TotalLibras` | Vista | Totales de libras por envío descongelado/reempaque (modos 24, 25, 28, 29) |
| `AV_Ship_TotalLibras_fresco` | Vista | Totales de libras por envío fresco (modos 24, 25, 28, 31) |
| `AV_OrdenesProducccion_TotalLibras` | Vista | Libras totales por orden de producción (modos 24, 25, 28, 29, 31) |
| `AV_LotesRemision` | Vista | Clase del lote: PROGRAMA o RECHAZO (modos 24, 25, 28) |
| `EquiposIQF` | Tabla | Nombres de equipos IQF para join con salmueras (modos 23, 27) |
| `OPship` | Tabla | Relación OP ↔ envío (modos 24, 25, 28, 29, 31) |

#### Diferencias clave entre los tres SPs de Producción Diaria

| Característica | `a_Fill_Produccion_Diaria` | `a_Fill_Produccion_Diaria_lectura` | `a_Fill_Produccion_Diaria_lectura_dos` |
|---|---|---|---|
| Campo fecha | `FechaProduccion` | `DiaProducccion2024` | `DiaProducccion2024` |
| Creado | Nov 2015 | Dic 2024 | Dic 2024 |
| Turnos nocturnos | ❌ No corrige | ✅ Corrige | ✅ Corrige |
| Campo `Turno` | ❌ No incluye | ✅ Incluye | ✅ Incluye |
| Rendimientos IQF | ❌ No | ❌ No | ✅ Sí (modos 23, 27, 30) |
| Análisis descongelado/fresco | ❌ No | ❌ No | ✅ Sí (modos 24, 25, 28) |
| Modos más usados | 0, 1, 3, 5 | 1, 3, 4, 5 | **23, 28, 30** |

---

#### GRUPO `a_Fill_*` — Inventario

##### `a_Fill_InventarioActual` / `_u` / `aFill_InventarioActual`
**Parámetros:** `@Resumen INT` (+ `@Usuario` en variante `_u`)  
**Tablas:** Inventarios, Seriales, Masteres, Paletas, Localidades, OrdenesProduccion, Items, LotesRemision, Siembras, Fincas, Empresas  
**Entrega:**
- `@Resumen=0`: Detalle por serial con finca, laguna, ciclo, item, talla, localidad
- `@Resumen=1`: Agrupado por item/talla
- Niveles superiores: más agregación  
**Uso principal:** Ver qué hay en bodega ahora mismo.

##### `a_Fill_InventarioActual_fkEmpresa`
**Parámetros:** `@fkEmpresa INTEGER`  
**Entrega:** Inventario filtrado para una empresa/cliente específico.

##### `a_Fill_InventarioActual_toPackingList`
**Parámetros:** `@fkEmpresa INTEGER`  
**Entrega:** Inventario disponible para asignar a un packing list.

##### `ConsultaInventarioActual`
**Entrega:** Consulta rápida del inventario actual (variante simplificada).

---

#### GRUPO `a_Fill_*` — Envíos

##### `a_Fill_Envios`
**Parámetros:** `@Resumen INTEGER`, `@Fecha_Inicial DATE`, `@Fecha_Final DATE`  
**Tablas:** AV_Envios (view que une Seriales + Masteres + Paletas + Envios + OrdenesProduccion + Items + LotesRemision + Siembras + Fincas + Lagunas + Empresas)  
**Entrega:**
- `@Resumen=0`: Detalle serial por serial — CodigoSerial, Item, Talla, Estilo, Finca, Laguna, Ciclo, Empresa, NumeroContenedor, PrecioCliente, SubTotal, FincaCertificada
- `@Resumen=1` (default): Resumen por Empresa / FechaCarga / Referencia / OP / Item / Talla
- `@Resumen=3`: Agrupado para preparar datos de materia prima por Propietario / Finca / TallaExport

##### `a_Fill_Envio_detalle`
**Parámetros:** `@fkEnvio INT`  
**Entrega:** Desglose de UN envío específico por item: TotalLibras, TotalKilos, Masteres, Cajas, TallaExport, PacketsQty.

##### `a_Fill_Envios_estiba`
**Parámetros:** `@Tipo INTEGER`, `@IdEnvio INTEGER`, fechas  
**Entrega:** Detalle de estibas (mapa de carga del contenedor).

---

#### GRUPO `a_Fill_*` — Facturación y Contabilidad

##### `a_Fill_contabilidad`
**Parámetros:** `@TipoReporte INTEGER`, `@Fecha_Inicial DATE`, `@Fecha_Final DATE`  
**Tablas:** AV_Facturacion_all_items, AV_Facturacion_all_otros_prod, AV_Produccion_Diaria_Resumen  
**Entrega según tipo:**
- `Tipo=0`: Detalle puro de todas las líneas de factura activas
- `Tipo=1`: Total facturado por factura (libras, SubTotalItems, SubTotalOtros, TotalFactura en USD y HNL, TasaCambio)
- `Tipo=2`: Resumen mensual por cliente de producción
- `Tipo=3`: Resumen por fecha y cliente con TasaDeCambio
- `Tipo=4`: Maquila de terceros (tipo MAQUILA TERCEROS)  
**Es el principal reporte contable de la empresa.**

##### `a_Fill_Facturacion_all_items`
**Entrega:** Todas las líneas de factura por item en el período.

##### `a_Fill_Facturacion_Exportar_PT`
**Entrega:** Facturación para exportar a producto terminado (para contabilidad externa).

##### `a_Fill_PackingList_Full` / `a_Fill_PackingListDetalle` / `a_Fill_PackingListDetalle_Resumen`
**Entrega:** Packing lists completos, detalle por item, resumen de pesos.

##### `a_Fill_PackingExport_Detalle`
**Parámetros:** `@fkPackingList INT`  
**Entrega:** Detalle de un packing list de exportación específico.

---

#### GRUPO `a_Fill_*` — Materia Prima y Liquidaciones

##### `a_Fill_MateriaPrima`
**Parámetros:** `@TipoReporte INTEGER`, `@Fecha_Inicial DATE`, `@Fecha_Final DATE`  
**Entrega:** Materia prima comprada en el período: por propietario, finca, laguna, ciclo, talla, libras, precio de compra.

##### `a_Fill_LiquidacionLaguna_ENC`
**Parámetros:** `@fkSiembra INT`  
**Entrega:** Encabezado de la liquidación de una siembra (laguna): finca, laguna, ciclo, fechas, propietario.

##### `a_Fill_LiquidacionLaguna_detalle` / `_total`
**Parámetros:** `@fkSiembra INT`, `@NoRemision`, `@fkLote`  
**Entrega:** Detalle y total consolidado de lo producido de una siembra específica.

##### `a_Fill_LibrasRecibidas_Vrs_LibrasProcesadas`
**Entrega:** Comparativo libras recibidas vs libras procesadas (rendimiento general).

##### `a_Fill_LibrasRecibidas_Vrs_LibrasProcesadas_CLI`
**Entrega:** Igual pero agrupado por cliente.

##### `a_Fill_CierresTiposProces`
**Parámetros:** `@Anio INT`  
**Entrega:** Rendimientos de cierre mensual por año y tipo de proceso (AROS vs PPV).

---

#### GRUPO `a_Fill_*` — Clientes y Usuarios

##### `a_Fill_ClientesUsuario`
**Parámetros:** `@Usuario VARCHAR(20)`  
**Tablas:** Empresas, EmpresasUsuario  
**Entrega:** Lista de empresas/clientes que puede ver el usuario (control de acceso).

##### `a_Fill_ClientesUsuarioDisponibles`
**Parámetros:** `@Usuario VARCHAR(20)`  
**Entrega:** Empresas disponibles para asignar al usuario (las que aún NO tiene).

---

#### GRUPO `Movil_*` — App Móvil

| Procedimiento | Propósito |
|---|---|
| `Movil_InsertSerial` | Crea un nuevo serial (cajita). Afecta: Seriales, BitacoradeEventosSeriales, Masteres |
| `Movil_InsertMaster` / `_MasterBlock` | Crea un master (caja maestra) |
| `Movil_InsertPalet` | Crea una paleta |
| `Movil_MasterizarSerial` / `_Union` | Asigna serial a un master / combina dos masters |
| `Movil_GetMasterInfo` | Info completa de un master: seriales, item, finca, laguna, ciclo, estado |
| `Movil_GetSerialesMaster` | Lista de seriales en un master |
| `Movil_GetPaletID` / `_MasterID` / `_SerialID` / `_OPID` | Obtiene ID por código de barras |
| `Movil_CambiarLocalidadMaster` / `_Palet` | Mover master o paleta a otra localidad |
| `Movil_PutMasterIntoInventory` / `_PaletIntoInventory` | Registrar en inventario al salir de producción |
| `Movil_PutMasterIntoEstibaShip` / `_PaletIntoShip` / `_CajitaIntoShip` | Asignar al ship/envío |
| `Movil_BorrarMaster` / `_Palet` / `_SerialTorre` / `_Torre` | Eliminar objetos (con validaciones) |
| `Movil_SacarMasterdePalet` | Quitar master de una paleta |
| `Movil_OrdenesProduccionSelect` | OPs disponibles para empacar |
| `Movil_TomaInventariosConsulta` | Inventario para toma física |
| `Movil_EnviosEstibasInsert` / `_Delete` / `_Listado` | CRUD de estibas en envíos |

---

#### GRUPO `SP_*` / `sp_*` — Operaciones del Sistema

| Procedimiento | Propósito |
|---|---|
| `SP_InsertSerial` | Insertar serial (versión escritorio con más validaciones) |
| `SP_InsertMaster` / `_deSeriales` | Crear master; `_deSeriales` desde lista de seriales |
| `SP_InsertPalet2` | Crear paleta con validaciones |
| `SP_CerrarPalet` | Cerrar paleta (ya no acepta más masteres) |
| `sp_GetSerialInfo` | Info completa de un serial: OP, Item, Talla, Estilo, Peso, Finca, Laguna, Ciclo, Master, Paleta, Localidad, Envío, FechaProduccion |
| `sp_GetMasterInfo` / `_Contain` | Info del master y su contenido |
| `sp_GetPaletInfo` / `_Contain` | Info de paleta y todos sus masteres |
| `sp_GetShipInfo` / `_Contain` | Contenido completo de un envío |
| `sp_GetFullSerialInfo` | Info completa de un serial incluyendo toda la jerarquía |
| `sp_HallarSerial` | Encontrar un serial por código en todas las tablas |
| `sp_InsertarRemision` / `_EditarRemisiones` / `_EliminarRemisiones` | CRUD de remisiones |
| `sp_ListadeCarga` / `sp_PackingList` | Lista de carga / packing list para impresión |
| `sp_ProcesarTorre` | Procesar una torre IQF completa |
| `SP_InsertEvento` / `_EventoLiberacion` | Registrar eventos en bitácora de seriales |
| `SP_InsertTransSerial` / `_InstransReprSerial` | Transacciones de seriales (movimientos, reprocesos) |
| `A_actualizar_palet` | Corregir asignación de paleta a envío |
| `a_Update_DescongelarPalet` | Registra paleta como descongelada |

---

### 2.5 VISTAS PRINCIPALES — Planta Empacadora (Power BI / reportes)

| Vista | Propósito |
|---|---|
| `AV_Produccion_Diaria` | Producción diaria consolidada (vista principal para reportes) |
| `AV_Produccion_Diaria_Resumen` | Producción diaria resumida |
| `AV_Envios` | Todos los envíos con trazabilidad completa (serial→finca) |
| `AV_EnviosTotalesItems` | Totales de items en envíos |
| `AV_OrdenesProduccion` | Órdenes de producción con estado actual |
| `AV_MateriaPrima` | Materia prima recibida con costos |
| `AV_LotesRemision` | Lotes de remisión con finca/laguna/ciclo/empresa/certificación |
| `AV_RecepcionLibras` | Libras recibidas por remisión |
| `AV_LibrasProcesadas` | Libras procesadas (empacadas) por período |
| `AV_Facturacion_all_items` | Todos los items de facturas activas |
| `AV_Facturas` | Facturas con totales |
| `AV_PackingList` / `AV_PackingListExport` | Packing lists internos / de exportación |
| `AV_ProductoEmpacado` | Producto empacado por serie/talla/empresa |
| `AV_Cosechas` | Cosechas registradas con finca/laguna/ciclo |
| `Q_Remisiones` | Remisiones con finca, laguna, siembra, empresa |
| `AV_Remisiones` | Remisiones con campos decodificados (estado, tipo de entero) |
| `AV_ClientesProduccion` | Clientes con clase decodificada |
| `AV_Clientes_full` | Vista completa de clientes joining Empresas + ClientesProduccion |

---

## 3. BASE DE DATOS: STB_DATA

### 3.1 Módulos del sistema

| Prefijo | Módulo | Descripción |
|---|---|---|
| `R_` | Recepción | Remisiones de finca, pesado recepción, catálogos de fincas/lagunas |
| `CL_` / `Cl_` | Clasificación | Clasificado de camarón por talla, inventario clasificado, remisiones de clasificado |
| `DES_` / `Des_` | Descabezado | Pesado de cola, asignación libras descabezado, pago a empleados |
| `PES_` / `Pes_` | Pesado IQF / Pelado | Llenado de recipientes IQF, asignación libras pelado, bonos |
| `DCP_` / `Dcp_` | Control Producción | Biométrico, pagos diarios, procesos, tallas, insumos, líneas |
| `CF_` | Costos Financieros | Costos diarios por proceso, energía, tasa de cambio |
| `CTB_` | Contabilidad | Centros de costo, prorrateo de planilla |
| `MT_` | Máquinas IQF | Monitoreo de túneles de congelamiento |
| `PRO_` | Salud Ocupacional | Monitoreo de salidas de empleados durante jornada, enfermería |
| `SG_` | Seguridad / Apps | Apps móviles STB, menús, perfiles de usuario |
| `EW_` | WhatsApp | Log de mensajes automáticos por WhatsApp |
| `RPT_` | Reportes | Categorías de líneas para reportes |
| `RH_` | Recursos Humanos | Asistencia evaluada, rutas de transporte |

---

### 3.2 TABLAS CON DATOS — STB_data

---

#### MÓDULO R — RECEPCIÓN DE CAMARÓN DE FINCAS

---

##### `R_REMISIONES_PLANTA` (38 columnas)
**Descripción:** Registro principal de remisiones de camarón que llegan desde las fincas. Es el punto de entrada de todo el proceso operativo.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_REMISION_PLANTA | int IDENTITY | PK |
| ID_LAGUNA | int | FK → R_Lagunas |
| ID_LAGUNA_CICLO | int | FK → R_LagunaCiclos |
| ID_PLANTA | int | Planta destino |
| ID_VEHICULO | int | FK → Vehiculos |
| ES_COLA | bit | 1=es cola de camarón, 0=entero |
| HORA_SALIDA_FINCA | time | Hora de salida desde la finca |
| REMISION_PLANTA | int | Número de remisión en planta |
| **REMISION_GENERAL** | varchar(100) | **Número general ej: "STB0000154-21"** — vínculo con PlantaEmpacadora |
| CONDUCTOR | varchar(100) | Nombre del conductor |
| COSTO_VIAJE | numeric(18,2) | Costo del flete |
| FECHA_REMISION | date | Fecha de llegada a planta |
| FECHA_COSECHA | date | Fecha de cosecha en finca |
| ANULADA | bit | 1=anulada |
| RECHAZADA | bit | 1=rechazada |
| CERRADA | bit | 1=procesada/cerrada |
| NumGuiasa | varchar(100) | Número de guía GUIASA |
| IdTipoProceso | int | FK → R_TiposProceso |
| NombreCliente | varchar(max) | Nombre del cliente/finca |
| Ciclo | varchar(max) | Ciclo productivo |
| IdTanque | int | Tanque asignado en planta |
| **IdRemisionPlantaEmp** | int | **FK → PlantaEmpacadora.Remisiones.ID** ← VÍNCULO CLAVE ENTRE BASES |
| LibrasRechazo | numeric(18,2) | Libras rechazadas |
| IdTipoOrigen | int | FK → R_TiposOrigen |
| EsASC | bit | Es camarón con certificación ASC |
| CodigoASC | varchar(max) | Código de trazabilidad ASC |
| FechaRechazo | date | Fecha de rechazo si aplica |

**Muestra:** `ID=1445, Laguna 41314, "STB0000154-21", Conductor: "Chofer Prueba", 2021-08-18, Cerrada=1`

---

##### `R_REMISIONES_PLANTA_DETALLE` (10 columnas)
**Descripción:** Detalle de bins/cajas por remisión — cada bin con su peso y estado de procesamiento.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_REMISION_PLANTA_DETALLE | int IDENTITY | PK |
| ID_REMISION_PLANTA | int | FK → R_REMISIONES_PLANTA |
| NUM_BIN | int | Número del bin dentro de la remisión |
| LIBRAS | numeric | Libras de ese bin |
| PROCESADO | bit | 1=ya procesado |
| ID_PROCESO | int | Proceso al que fue enviado |
| IdTalla | int | Talla del camarón en ese bin |
| FechaProceso | date | Fecha en que fue procesado |
| Hora | time | Hora de proceso |

---

##### `R_PesadoRecepcion` (14 columnas)
**Descripción:** Registro de pesado al momento de recepción en planta (báscula de entrada).

| Columna | Tipo | Descripción |
|---|---|---|
| IdPesadoR | int IDENTITY | PK |
| IdProceso | int | Proceso de destino |
| Fecha | date | Fecha del pesado |
| RemisionPlanta | varchar(50) | Número de remisión |
| LibrasBrutas | numeric(18,2) | Libras brutas (con tara) |
| LibrasNetas | numeric(18,2) | Libras netas (sin tara) |
| Cerrado | bit | 1=cerrado |
| RemisionGuiasa | varchar(max) | Número guía GUIASA |
| IdRemisionPlanta | int | FK → R_REMISIONES_PLANTA |
| IdLineaProduccion | int | Línea de producción |

---

##### `R_PesadoRecepcionD` (9 columnas)
**Descripción:** Detalle de pesadas individuales de recepción (cada evento de báscula).

| Columna | Descripción |
|---|---|
| IdPesadoRD | PK |
| IdPesadoR | FK → R_PesadoRecepcion |
| Hora / LibrasBrutas / LibrasNetas | Medidas de la pesada |
| Anulada / Manual | Flags |
| IdTurno | FK → Cl_Turnos |

---

##### `R_Fincas` (10 columnas)
**Descripción:** Catálogo operativo de fincas en STB_data. Tiene vínculo con PlantaEmpacadora.

| Columna | Descripción |
|---|---|
| IdFinca | PK |
| Finca | Nombre de la finca |
| EsPropia | Si es finca propia de STB |
| Activa | |
| IdClienteFinca | FK → R_ClientesFincas |
| **IdFincaPlanta** | **FK → PlantaEmpacadora.Fincas.IDFinca** ← VÍNCULO CLAVE |
| CodigoASC | |

**Muestra:** Finca 31 = "GRANJAS MARINAS DEL SUR"

---

##### `R_Lagunas` (8 columnas)
**Descripción:** Catálogo operativo de lagunas en STB_data.

| Columna | Descripción |
|---|---|
| IdLaguna | PK |
| IdFinca | FK → R_Fincas |
| Laguna | Nombre de la laguna |
| Activa | |
| **IdLagunaPlanta** | **FK → PlantaEmpacadora.Lagunas.IDLaguna** ← VÍNCULO CLAVE |

---

##### `R_LagunaCiclos` (8 columnas)
**Descripción:** Ciclos productivos (cosechas) por laguna.

| Columna | Descripción |
|---|---|
| IdLagunaCiclo | PK |
| IdLaguna | FK → R_Lagunas |
| LagunaCiclo | Código único laguna+ciclo |
| Ciclo | Número de ciclo |
| Anio | Año |
| Activo | |

---

##### `R_ClientesFincas`
**Descripción:** Propietarios/clientes de fincas (quién es dueño de qué finca).

| Columna | Descripción |
|---|---|
| IdClienteFinca | PK |
| Nombre | Nombre del cliente/propietario |
| RTN | RTN fiscal |
| CuentaSAG | Cuenta en SAG (Secretaría de Agricultura) |

---

##### `R_TiposProceso`
**Descripción:** Tipos de proceso de producción en recepción.

**Muestra:** `1=COL (Cola Clasificada)`, `2=EV (Entero Vivo)`

---

##### `R_TiposOrigen`
**Descripción:** Tipos de origen del camarón que entra a planta.

**Muestra:** `1=ENTERO TRADICIONAL`, `2=COLA CLASIFICADA`

---

#### MÓDULO CL — CLASIFICACIÓN DE CAMARÓN

---

##### `CL_LLENADO_RECIPIENTES` (25 columnas) — CABECERA DE CLASIFICACIÓN
**Descripción:** Cada registro representa un lote de clasificación de camarón por talla. Es el registro maestro de la mesa de clasificación.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_LLENADO_RECIPIENTE | int IDENTITY | PK |
| NUM_DOCUMENTO | int | Número de documento/lote |
| TEMPERATURA | numeric(6,2) | Temperatura del camarón (°C) |
| FECHA | date | Fecha de clasificación |
| ID_RESPONSABLE | int | FK → DCP_RESPONSABLES |
| ID_LAGCICLO | int | FK → R_LagunaCiclos |
| ID_TANQUE | int | FK → CL_TANQUES |
| ID_SUPERVISOR | int | FK → DCP_SUPERVISORES |
| ENTERO | bit | 1=camarón entero |
| CERRADO | bit | 1=proceso cerrado |
| Remision | varchar(50) | Número de remisión "STB0000329-21" |
| IdTipoProducto | int | FK → CL_TipoProducto |
| FincaPBI | varchar(50) | Finca de referencia PBI |
| IdPesadoCola | int | FK → Des_PesadoCola (si es cola) |
| IdLineaProduccion | int | Línea de producción |

---

##### `CL_LLENADO_RECIPIENTES_D` (27 columnas) — DETALLE DE CLASIFICACIÓN
**Descripción:** Cada bin/recipiente clasificado con su peso y talla. Detalle del proceso.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_LLENADO_RECIPIENTE_D | int IDENTITY | PK |
| ID_LLENADO_RECIPIENTE | int | FK → CL_LLENADO_RECIPIENTES |
| ID_TALLA | int | FK → DCP_TALLAS (talla del camarón) |
| BIN | varchar(max) | Código del bin/recipiente |
| LIBRAS_BRUTO | numeric(12,3) | Libras brutas |
| LIBRAS_NETA | numeric(12,3) | Libras netas |
| HORA_INICIO / HORA_FINAL | time | Horario de clasificación |
| PROCESADO / ACTIVO / ANULADO / CERRADO | bit | Estados del registro |
| TallaPromedio | varchar | Talla promedio (ej: "451") |
| IdTurno | int | FK → Cl_Turnos |
| PorcAgua | numeric(18,2) | Porcentaje de agua/glaseado |

**Muestra:** `BIN='451', LibrasBruto=223, LibrasNeta=219, TallaPromedio='451', PorcAgua=0.02`

---

##### `CL_InventarioClasificado` (29 columnas) — INVENTARIO DISPONIBLE
**Descripción:** Inventario de camarón ya clasificado por talla y proceso. Rastrea qué hay disponible para enviar a empaque.

| Columna | Descripción |
|---|---|
| IdInventarioClasificado | PK |
| IdLLenadoRecipienteD | FK → CL_LLENADO_RECIPIENTES_D |
| IdProceso | Proceso de clasificación |
| IdLagCiclo | FK → R_LagunaCiclos |
| Fecha | Fecha de clasificación |
| BIN | Código del bin |
| LibrasBruto / LibrasNetas | Pesos |
| **EnInventario** | 1=está disponible |
| **Transferido** | 1=fue transferido |
| **Procesado** | 1=fue procesado (enviado a empaque) |
| FincaPBI / LagunaPBI | Trazabilidad de finca/laguna |
| IdTallaFinal | Talla final asignada |

**Muestra:** `Fecha=2025-04-12, BIN='295', LibrasBruto=938, LibrasNeta=910, Finca='GRANJAS MARINAS DEL SUR'`

> **Para ver inventario disponible:** `WHERE EnInventario=1 AND Transferido=0 AND Procesado=0`

---

##### `CL_TANQUES`
**Descripción:** Catálogo de tanques/contenedores de clasificación.

| Columna | Descripción |
|---|---|
| ID_TANQUE | PK |
| CODIGO_TANQUE | Código |
| NOMBRE_TANQUE | Nombre del tanque |

---

##### `CL_TipoProducto`
**Descripción:** Tipos de producto manejados en clasificación.

| Columna | Descripción |
|---|---|
| IdTipoProducto | PK |
| TipoProducto | Nombre (entero, cola, pelado, etc.) |
| EsRechazo / EsReproceso | Flags |

---

##### `Cl_Turnos`
**Descripción:** Catálogo de turnos de producción. Todos los módulos lo referencian.

| Columna | Descripción |
|---|---|
| IdTurno | PK |
| Turno | Nombre del turno |

---

#### MÓDULO DES — DESCABEZADO

---

##### `Des_PesadoCola` (17 columnas)
**Descripción:** Registro de pesado de cola (camarón descabezado). Cada registro es un lote de cola pesado en báscula antes de enviarlo a clasificación o pesado IQF.

| Columna | Tipo | Descripción |
|---|---|---|
| IdPesadoCola | int IDENTITY | PK |
| IdProceso | int | Proceso de descabezado |
| IdPesadoColaHeader | int | FK → Des_PesadoColaHeader |
| Fecha | date | Fecha del pesado |
| LibrasBrutas | numeric(18,2) | Libras brutas total |
| LibrasNetas | numeric(18,2) | Libras netas total |
| Cerrado | bit | 1=cerrado |
| Bin | varchar(max) | Bins incluidos |
| IdTanque | int | Tanque destino |
| IdLineaProduccion | int | Línea de producción |
| Enviado | bit | 1=enviado a siguiente proceso |
| FechaProceso | datetime | Fecha/hora de procesamiento |

**Muestra:** `LibrasBrutas=1156.84, LibrasNetas=1127, 2021-06-22, Proceso=3, Cerrado=1`

---

##### `Des_PesadoColaD` (9 columnas)
**Descripción:** Detalle de pesadas individuales de cola (cada evento de báscula en descabezado).

| Columna | Descripción |
|---|---|
| IdPesadoColaD | PK |
| IdPesadoCola | FK → Des_PesadoCola |
| Hora / LibrasBrutas / LibrasNetas | Medidas |
| Anulada / Manual | Flags |
| IdTurno | FK → Cl_Turnos |

---

##### `Des_InformacionLineas` (9 columnas)
**Descripción:** Información de líneas de descabezado — precio, talla y estado de cada línea en un turno.

| Columna | Descripción |
|---|---|
| IdLineaInformacion | PK |
| IdLinea | Línea de producción |
| IdPesadoR | FK → R_PesadoRecepcion |
| IdTalla | Talla trabajada |
| IdLineaProduccion | Línea de producción DCP |
| Precio | Precio por libra en ese momento |
| Cerrada / Fecha / FechaHora | Estado y tiempo |

---

##### `DES_ASIG_LBRS_EMPLEADOS_DET` ⚠️ (~670 MB, TABLA PRINCIPAL DE PAGO DESCABEZADO)
**Descripción:** Asignación detallada de libras por empleado en descabezado. Cada fila = libras que un empleado procesó en un intervalo. Es la base para el pago a destajo en descabezado.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_ASIG_LBRS_EMPLEADO_DET | int IDENTITY | PK |
| ID_ASIG_LBRS_EMPLEADO | int | FK → DES_ASIG_LBRS_EMPLEADOS (header) |
| ID_EMPLEADO_LINEA | int | FK → DES_EMPLEADOS_LINEAS |
| LIBRAS | numeric | Libras asignadas al empleado |
| PrecioLibra | numeric | Precio por libra en ese momento |
| HORA | time | Hora del registro |
| ID_TALLA | int | FK → DCP_TALLAS (talla trabajada) |
| VALOR | numeric | **Pago = LIBRAS × PrecioLibra** |
| ANULADO | bit | 1=anulado |
| ID_TURNO | int | FK → Cl_Turnos |
| MANUAL | bit | 1=entrada manual |
| PorAgua | numeric | % agua/glaseado |
| IdLineaInformacion | int | FK → Des_InformacionLineas |

---

##### `DES_EMPLEADOS_LINEAS`
**Descripción:** Asignación de empleados a líneas de descabezado.

| Columna | Descripción |
|---|---|
| ID_EMPLEADO_LINEA | PK |
| ID_LINEA | Línea de producción |
| ID_EMPLEADO | Empleado (de RRHH) |
| ACTIVO | 1=activo |

---

#### MÓDULO PES — PESADO IQF / PELADO

---

##### `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET` ⚠️ (~3.2 GB, TABLA MÁS GRANDE DE STB_DATA)
**Descripción:** Detalle de asignación de libras por empleado en pesado IQF/pelado. Millones de registros de pago a destajo por empleado, turno, talla y estilo.

| Columna | Tipo | Descripción |
|---|---|---|
| ID_ASIGNACION_LIBRAS_EMPLEADO_DET | int IDENTITY | PK |
| ID_ASIGNACION_LIBRAS_EMPLEADO | int | FK → PES_ASIGNACION_LIBRAS_EMPLEADOS |
| ID_ASIGNACION_RECIPIENTE_LINEA | int | FK → PES_ASIGNACION_RECIPIENTES_LINEAS |
| ID_EMPLEADO_LINEA | int | Empleado en su línea |
| LIBRAS | numeric(7,2) | Libras procesadas |
| VALOR | numeric(7,2) | **Pago = LIBRAS × PRECIO_LIBRA** |
| HORA | time | Hora del registro |
| ID_TALLA | int | FK → DCP_TALLAS |
| ID_ESTILO | int | Estilo del producto |
| PRECIO_LIBRA | numeric(5,2) | Precio por libra |
| MANUAL | bit | 1=ingreso manual |
| LOTE | varchar(15) | Lote de producción |
| ANULADO | bit | 1=anulado |
| ID_LINEA_ACTUAL | int | Línea actual del empleado |
| ID_TURNO | int | FK → Cl_Turnos |
| ID_DEPARTAMENTO | int | Departamento del empleado |

---

##### `PES_LLENADO_RECIPIENTES` (16 columnas)
**Descripción:** Llenado de recipientes en la línea de pesado IQF/pelado. Cada registro = recipiente lleno.

| Columna | Descripción |
|---|---|
| ID_LLENADO_RECIPIENTE | PK |
| ID_RECIPIENTE | Recipiente físico usado |
| TEMPERATURA | Temperatura del camarón |
| ID_ESTILO | Estilo del producto |
| LIBRAS_TOTAL / LIBRAS_NETAS | Libras |
| FECHA | Fecha |
| ID_SUPERVISOR | Supervisor responsable |
| ID_TALLA | Talla FK → DCP_TALLAS |
| HORA_INICIO / HORA_FINAL | Horario |
| PROCESADO / Anulado | Estados |

**Muestra:** `Recipiente=10, Estilo=2, Libras=702.89, 2022-02-23, HORA_INICIO=11:08`

---

##### `PES_LLENADO_RECIPIENTES_DET` (~1.87 GB, segunda más grande de STB_data)
**Descripción:** Detalle por empleado de cada recipiente llenado. Cada fila = cuántas libras aportó un empleado específico a un recipiente.

| Columna | Descripción |
|---|---|
| ID_LLENADO_RECIPIENTES_DET | PK |
| ID_LLENADO_RECIPIENTE | FK → PES_LLENADO_RECIPIENTES |
| ID_ASIGNACION_LINEA_RECIPIENTE | |
| LIBRAS | Libras del empleado |
| HORA | |
| ANULADO | |

---

##### `PES_ASIGNACION_LIBRAS_EMPLEADOS` (6 columnas)
**Descripción:** Cabecera de asignación de libras para empleados del área de pelado/IQF.

| Columna | Descripción |
|---|---|
| ID_ASIGNACION_LIBRAS_EMPLEADO | PK |
| FECHA | Fecha del turno |
| ID_SUPERVISOR | Supervisor |
| IdLineaProduccion | Línea de producción |

---

#### MÓDULO DCP — CONTROL DE PRODUCCIÓN Y PLANILLA

---

##### `DCP_MarcaBiometrico` ⚠️ (~1.45 GB)
**Descripción:** Registro de marcas biométricas (huellas/facial) de empleados. Cada fila = una marca de entrada/salida. Base para calcular asistencia y horas trabajadas.

| Columna | Tipo | Descripción |
|---|---|---|
| IdMarcaBiometrico | int IDENTITY | PK |
| IDEmpleado | int | ID del empleado (de sistema RRHH) |
| Fecha | datetime | Timestamp exacto de la marca |

**Muestra:** `Empleado=1983, Fecha=2021-08-13T03:00:31` (turno madrugada)

> **Para calcular horas trabajadas:** MIN(Fecha) = primera marca, MAX(Fecha) = última marca, DATEDIFF(MINUTE,...) = minutos trabajados

---

##### `DCP_EmpleadosDeptosFechas` (~1.2 GB)
**Descripción:** Asignación histórica DIARIA de empleados a departamentos/procesos/puestos. Cada fila registra en qué proceso trabajó un empleado en una fecha específica.

| Columna | Tipo | Descripción |
|---|---|---|
| IdEmpleadoDepto | int IDENTITY | PK |
| IdEmpleado | int | ID del empleado (de RRHH) |
| IdProceso | int | FK → DCP_PROCESOS |
| IdPuesto | int | Puesto de trabajo |
| IdTipoPlanilla | int | Tipo de planilla |
| NombreEmpleado | varchar | Nombre completo |
| Identidad | varchar | Número de identidad hondureño |
| IdTurno | int | FK → Cl_Turnos |
| Fecha | date | **Fecha de la asignación** |

**Muestra:** `Empleado=4039 "IRIS ISABEL MEJIA QUIROZ" STB200359, Proceso=4, 2021-04-13`

> **IMPORTANTE:** Esta es la tabla HISTÓRICA. `DCP_EmpleadosDeptos` es la asignación ACTUAL (sin historial por fecha). Para auditorías usar siempre `DCP_EmpleadosDeptosFechas`.

---

##### `Dcp_AjusteTiempoReal` (~1.2 GB)
**Descripción:** Ajustes de producción en tiempo real — libras producidas, ajuste, porcentaje por empleado y línea.

| Columna | Descripción |
|---|---|
| IdAjusteTiempoReal | PK |
| Fecha | Fecha |
| IdEmpleado | Empleado |
| IdLineaProduccion | Línea de producción |
| Valor | Valor calculado |
| Ajuste | Ajuste aplicado |
| Libras | Libras base |
| Porcentaje | % de ajuste |

**Muestra:** `Fecha=2022-04-05, Empleado=12636, Línea=54, Valor=224.08, Ajuste=92.81, Libras=67.35, %=1.00`

---

##### `Dcp_PagosDiasGeneral` (~170 MB) — TABLA DE PAGOS DIARIOS
**Descripción:** Registro general de pagos diarios por empleado — pago a destajo + hora, proceso, línea, cuenta contable.

| Columna | Descripción |
|---|---|
| IdPagoDia | PK |
| Nombre_proceso | Nombre del proceso |
| LineaProduccion | Línea |
| IdEmpleado | Empleado |
| Identidad / NombreEmpleado | Identificación |
| libras / factor | Libras y factor |
| Valor | Pago en lempiras |
| Horas | Horas trabajadas |
| Fecha | Fecha |
| AplicaGrupal | Si es pago grupal |
| cuentacontable / TipoCuenta | Contabilidad |
| CLIENTE / Finca / laguna | Trazabilidad |
| Turno | Turno de trabajo |

**Muestra:** `"DANIEL ERODY CARRANZA MARADIAGA" STB170123, Proceso=PRODUCCION, Valor=300.00, Horas=8, 2021-06-30`

---

##### `DCP_PagoGrupalAsistencias` (11 columnas)
**Descripción:** Cabecera de pagos grupales por asistencia — bono por presentarse al trabajo.

| Columna | Descripción |
|---|---|
| IdPagoGrupalAsistencia | PK |
| IdLineaProduccion | Línea de producción |
| Fecha | Fecha |
| Libras | Libras base para el cálculo |
| Factor | Factor de pago |
| Cerrado | 1=cerrado |

---

##### `DCP_PagoGrupalAsistenciasDetalle` (9 columnas)
**Descripción:** Detalle de pagos grupales — cada empleado con su valor dentro del pago grupal.

| Columna | Descripción |
|---|---|
| IdPagoGrupalAsistenciaDetalle | PK |
| IdPagoGrupalAsistencia | FK → cabecera |
| IdEmpleado | Empleado |
| HoraDesde / HoraHasta | Horario |
| Factor | Factor individual |
| Valor | Pago en lempiras |
| idActividad | Actividad |

---

##### `DCP_CalculoExtraProceso` (12 columnas)
**Descripción:** Cálculo de pagos extra por proceso — bonificaciones sobre rendimiento.

| Columna | Descripción |
|---|---|
| IdCalculoExtra | PK |
| IdEmpleado | Empleado |
| IdProceso | Proceso |
| Fecha | Fecha |
| Monto | Monto base |
| PorcentajeExtra | % extra |
| Extra | Valor extra calculado |
| Total | Total a pagar |
| Cerrado | 1=cerrado |

---

##### `DCP_PROCESOS`
**Descripción:** Catálogo maestro de procesos productivos de la planta.

| Columna | Descripción |
|---|---|
| ID_PROCESO | PK |
| CODIGO_PROCESO | Código corto |
| NOMBRE_PROCESO | Nombre descriptivo |
| Recepcion | Si aplica a recepción |
| Pesado | Si aplica a pesado |
| AplicaConsumo | Si registra consumo de insumos |
| AplicaRechazo | Si registra rechazo |
| EsProduccion | Si es proceso de producción |
| Activo | Si está activo |

---

##### `DCP_TALLAS`
**Descripción:** Catálogo de tallas de camarón en STB_data (equivalente a `Tallas` de PlantaEmpacadora).

| Columna | Descripción |
|---|---|
| ID_TALLA | PK |
| ID_PROCESO | Proceso al que pertenece |
| CODIGO_TALLA | Código (ej: 2125) |
| NOMBRE_TALLA | Nombre (ej: "21-25") |
| CODIGO_BARRA | Código de barras |
| ES_COMUN / ES_ENTERO / ES_LARVA | Flags de tipo |
| Activa | Si está activa |

**Muestra:** `Talla=2125 → "21-25 count/lb"`, `Talla=2630 → "26-30 count/lb"`

---

##### `DCP_RESPONSABLES`
**Descripción:** Catálogo de responsables de área en producción.

**Muestra:** `1, Empleado=1, "KATY SALINAS", EsResponsable=1`

---

##### `DCP_SUPERVISORES`
**Descripción:** Catálogo de supervisores de línea.

| Columna | Descripción |
|---|---|
| IdSupervisor | PK |
| IdEmpleado | Empleado |
| Cargo | "SUPERVISOR" |
| Activo | |

---

##### `DCP_RECIPIENTES`
**Descripción:** Catálogo de recipientes/bandejas usados en producción.

| Columna | Descripción |
|---|---|
| ID_RECIPIENTE | PK |
| ID_TIPO_RECIPIENTE | FK → DCP_TIPO_RECIPIENTES |
| LIMITE_LIBRAS | Límite de peso del recipiente |
| ACTIVO | |
| CODIGOBARRA | Código de barras |

---

##### `DCP_ULTIMOS_PESOS`
**Descripción:** Cache en tiempo real del último peso registrado por cada báscula.

---

##### `DCP_PARAMETROS_PROCESOS`
**Descripción:** Parámetros de configuración de cada proceso (precios por libra, factores, límites).

---

##### `Dcp_PagosDiasGeneral`
Ver descripción arriba (tablas con datos - pagos).

---

##### `Dcp_TasaCambio`
**Descripción:** Tasas de cambio Lempira/USD por mes y año.

**Muestra:** `Año=2021, Mes=11, TasaCambio=24.10`

---

##### `dcp_MovimientosInventarios` / `Dcp_MovimientosInventariosDet`
**Descripción:** Movimientos de inventario entre procesos — trazabilidad cuando un lote pasa de clasificación a pesado, de descabezado a clasificación, etc.

| Columna | Descripción |
|---|---|
| IdMovimientoInventario | PK |
| IdProcesoOrigen / IdProcesoDestino | Procesos involucrados |
| RemisionPlanta | Número de remisión |
| Fecha | |
| IdInventario | Inventario afectado |
| Anulado | |

---

#### MÓDULO CTB — CONTABILIDAD DE COSTOS

---

##### `CTB_ProgramaCosto`
**Descripción:** Catálogo de programas/centros de costo contables.

| Columna | Descripción |
|---|---|
| IdProgramaCosto | PK |
| CodigoPrograma | char(3) — código del centro |
| CuentaPrograma | Cuenta contable |
| PrefijoCuentaDetalle | Prefijo de cuentas |
| DescripcionPrograma | Descripción |
| Activo | |

---

##### `CTB_ProrateoPlanillaDetalle` (17 columnas)
**Descripción:** Prorrateo detallado de planilla por empleado, período, concepto y programa de costo. Base para la distribución contable de costos de mano de obra.

| Columna | Descripción |
|---|---|
| IdProrrateoPlanillaDetalle | bigint PK |
| IdTituloPlanilla | Título de planilla |
| FechaDesde / FechaHasta | Período de la planilla |
| IdEmpleado | Empleado |
| IdConceptoOrigen / IdConceptoCosto | Conceptos involucrados |
| IdProgramaCosto | FK → CTB_ProgramaCosto |
| BaseDistribucionPrograma | Base de distribución |
| PorcentajeDistribucion | % asignado |
| MontoOriginalEmpleadoConcepto | Monto original |
| MontoProrrateado | Monto después de prorrateo |

---

#### MÓDULO PRO — SALUD OCUPACIONAL

---

##### `PRO_MonitoreoSalidas` ⚠️ (~950 MB)
**Descripción:** Registro de cada salida y regreso de empleados durante la jornada (permisos para baño, médico, etc.). Base para control de ausentismo.

| Columna | Tipo | Descripción |
|---|---|---|
| IdMonitoreoSalida | int IDENTITY | PK |
| IdEmpleado | int | ID del empleado |
| IdTipoSalida | int | FK → PRO_TiposSalidas |
| Fecha | date | Fecha de la salida |
| HS | time | Hora de salida |
| HE | time | Hora de regreso |
| FechaHora | datetime | Timestamp exacto |
| Activo | bit | 1=aún afuera |
| Usuario | varchar | Quien autorizó |
| FechaHoraEntrada | datetime | Timestamp de regreso |
| Anulado | bit | |

**Muestra:** `Empleado=24091, TipoSalida=2, 2024-11-19, HS=10:56:59, HE=11:23:55, Equipo='Calidad2'`

---

##### `PRO_TiposSalidas`
**Descripción:** Tipos de salida durante jornada (baño, médico, emergencia, etc.).

| Columna | Descripción |
|---|---|
| IdTipoSalida | PK |
| CodTipoSalida | Código |
| TipoSalida | Descripción |
| EsVisita | Si es visita de servicio |

---

##### `PRO_VisitasEnfermeria` (12 columnas)
**Descripción:** Registro de visitas a enfermería, vinculado con MonitoreoSalidas.

| Columna | Descripción |
|---|---|
| IdVisitaEnfermeria | PK |
| IdMonitoreoSalida | FK → PRO_MonitoreoSalidas |
| IdEmpleado | Empleado |
| Fecha / HoraAtencion | Cuándo |

---

#### MÓDULO MT — MÁQUINAS / TÚNELES IQF

---

##### `MT_Maquinas`
**Descripción:** Catálogo de máquinas IQF (túneles de congelamiento individual).

| Columna | Descripción |
|---|---|
| IdMaquina | PK |
| CodMaquina | Código |
| Maquina | Nombre de la máquina |
| Activo | |

---

##### `MT_InformacionesMaquinasMaster` (6 columnas)
**Descripción:** Registro de producción de máquinas — cada entrada de producto a un túnel IQF con su master.

| Columna | Descripción |
|---|---|
| IdRegistroProduccion | PK |
| IdInformacionMaquina | FK máquina |
| Master | Número de master |
| Hora | Hora de entrada |
| Anulado | |

---

##### `MT_MaquinasFlujoMedia`
**Descripción:** Configuración de flujo media por tipo de producto y máquina (libras/hora esperadas).

| Columna | Descripción |
|---|---|
| IdAsignacionFlujomedia | PK |
| IdTipoProducto | Tipo de producto |
| IdMaquina | Máquina |
| Valor | Libras/hora esperadas |

---

#### MÓDULO SG — SEGURIDAD / APPS MÓVILES

---

##### `SG_Apps`
**Descripción:** Catálogo de aplicaciones móviles del sistema STB.

**Muestra:** `1=STB App`, `2=SISPROP`

---

##### `SG_MenuMoviles` / `SG_MenuMovilesPerfiles` / `SG_AsigLineaProduccionUsuarios`
**Descripción:** Menús de apps móviles, perfiles de acceso y asignación de líneas por usuario.

---

#### CATÁLOGOS GENERALES — STB_data

| Tabla | Descripción |
|---|---|
| `Vehiculos` | Catálogo de vehículos que transportan camarón (placa, tipo, propietario) |
| `TiposVehiculos` | Tipos de vehículos (camión refrigerado, pick-up, trailer) |
| `Propietarios` | Propietarios de vehículos |
| `Notificaciones` / `NotificacionesUsuario` | Sistema de notificaciones internas |
| `TokenMsj` | Tokens para notificaciones push a móviles |
| `VersionesApps` | Control de versiones de apps móviles |
| `EW_EnviosMensajesWhatsapp` | Log de mensajes WhatsApp automáticos |
| `RPT_CategoriaLineas` | Categorías de líneas para reportes |
| `RPT_CategoriaLineasAsignaciones` | Asignación de líneas a categorías |

---

### 3.3 TABLAS VACÍAS — STB_data (239 tablas)

> Definidas en el esquema pero sin datos en el dump. Al hacer JOINs usar `LEFT JOIN`.

**Módulo CF (Costos Financieros) — todas vacías:**  
CF_CostosConceptos, CF_CostosProduccionProcesosDiario, CF_CostosProduccionProcesosDiarioDet, CF_DsitribucionEnergiaElectrica, CF_TasasCambioDiario, CF_CostosConceptosMeses, CF_ParametrosGenerales _(y 9 más)_

**Módulo CC (Control de Calidad) — todas vacías:**  
CC_Calidades, CC_CalidadesD, CC_ListaCalidades, CC_TipoProductos

**Módulo CL — vacías (algunas pueden usarse en producción):**  
CL_EnviosClasificado, CL_EnviosClasificadoDet, CL_FACTURAS, CL_REMISIONES, CL_REMISIONES_DET, CL_DISTRIBUCION_TALLAS_REMISIONES_D, CL_InventarioClasificadoH _(y ~25 más)_

**Módulo DCP — vacías (muchas son catálogos y proyecciones):**  
dcp_LineasProduccion, DCP_ALIMENTOS, DCP_ConsumosArticulos, DCP_ConsumosArticulosDet, DCP_CuentasContables, DCP_ProyeccionesInsumos, DCP_ProyeccionMaestra, DCP_ProyeccionesManoObra, DCP_LIBRAS_BASURA, DCP_DIAS _(y ~50 más)_

**Módulo DES — vacías:**  
DES_ASIG_LBRS_EMPLEADOS, DES_MUESTREOS_CONTROL, DES_PARAMETROS_PRECIOS, DES_PARAMETROS_TURNOS

**Módulo PES — vacías:**  
PES_EMPLEADOS_LINEAS, PES_ESTILOS, PES_SALAS, PES_PARAMETROS_PRECIOS, PES_PARAMETROS_TURNOS

**Módulo Ice (Hielo) — todas vacías:**  
Ice_ProduccionHielo, Ice_DistrubucionHieloProcesos, Ice_Bodegas _(y 6 más)_

**Módulo RH — todas vacías:**  
RH_AsistenciaEmpleadosEvaluada, RH_EmpleadosRutasDiarios, RH_Rutas

**Tablas compartidas con PlantaEmpacadora — vacías en STB_data (datos en PlantaEmpacadora):**  
Fincas, Lagunas, Remisiones, DetalleRemisiones, LotesRemision, Siembras, Empresas, PlantaDescabezado, Destinos, VehiculosRemisiones

---

### 3.4 PROCEDIMIENTOS ALMACENADOS — STB_data

---

#### GRUPO R — Recepción

| Procedimiento | Propósito |
|---|---|
| `CARGA_LAGUNAS_DETALLE` | Carga el detalle de lagunas en una remisión |
| `CARGA_LAGUNAS_DETALLE_actualizar` | Actualiza el detalle de lagunas |
| `ACTUALIZAR_DETALLE_BINES` | Actualiza el peso de bins en R_REMISIONES_PLANTA_DETALLE |
| `ACTUALIZAR_DETALLE_BINES_I` | Insertar bins en el detalle |
| `ACTUALIZAR_DETALLE_LAGUNA` | Actualiza datos de laguna en una remisión |
| `ACTUALIZAR_HEADER` | Actualiza la cabecera de una remisión de planta |
| `ACTUALIZA_RECHAZO` | Registra/actualiza el rechazo de una remisión |

---

#### GRUPO CL — Clasificado

| Procedimiento | Parámetros | Propósito |
|---|---|---|
| `CL_LLENADO_RECIPIENTES_INSERT` | | Crea registro de llenado de recipiente |
| `CL_LLENADO_RECIPIENTES_D_INSERT` | | Registra una pesada en el recipiente |
| `CL_LLENADO_RECIPIENTES_D_UPDATE_AL_CERRAR` | | Actualiza detalle al cerrar recipiente |
| `CL_LLENADO_RECIPIENTES_D_MOSTRAR` / `_ANULADO` / `_PROCESADO` | | Ver pesadas: activas / anuladas / procesadas |
| `CL_LLENADO_RECIPIENTES_D_RESUMEN_BINES` | `@IdLlenadoRecipiente`, `@Modo` | Resumen de bins en el llenado |
| `CL_LLENADO_RECIPIENTES_RESUMEN_RESUMEN` | | Resumen general de recipientes activos |
| `CL_VALIDAR_ASIG_RECIPIENTES` / `_web` | IdRecipiente, IdLinea, IdTalla | Valida si recipiente puede asignarse a línea |
| `CL_CAMBIO_RECIPIENTES_LLENAR` / `_MOVIL` | IdRecipiente, IdLinea | Cambia el recipiente activo de una línea |
| `CL_InventarioClasificadoPantalla` | | Vista del inventario clasificado actual para pantalla |
| `CL_InventarioClasificadoPantallaProcesado` | | Inventario clasificado ya procesado |
| `Cl_InvetarioActualReporte` | modo | Reporte formal de inventario clasificado |
| `CL_REMISIONES_INSERT` | | Crea remisión de clasificado |
| `CL_REMISIONES_UPDATE` / `_DELETE` | | Actualiza/elimina remisión |
| `CL_HISTORIAL_PESADAS` / `_ANULADAS` | fechas, línea | Historial de pesadas del clasificado |
| `CL_VISOR_REMISION` | IdRemision | Vista completa de una remisión: bins, libras por talla, destino |
| `CL_REPORTE_REMISION` / `_II` | fechas, proceso | Reporte de remisiones de clasificado |
| `CL_REPORTE_RESUMEN_REMISION` / `_CALIDAD` | | Resumen de remisiones / con calidades |
| `CL_BusquedaLaguna` | fechas, laguna, tipo | Búsqueda de remisiones/clasificado por laguna |
| `CL_MOSTRAR_REMISIONES` | | Lista de remisiones de clasificado |
| `CL_MOSTRAR_HEADER_REMISION` | | Encabezado de una remisión |
| `CL_MOSTRAR_LOTES_REMISION` | | Lotes de una remisión |
| `CL_EnviosClasificadoInsert` | | Crea envío de clasificado hacia bodega/empaque. Afecta CL_EnviosClasificado, CL_InventarioClasificado |
| `CL_ENVIOS_PREPARADOS` | | Envíos del clasificado listos para despacho |
| `cl_VerificaBinInventario` / `_web` | @NUM_BIN | Verifica si un bin está en inventario |
| `CL_ActualizacionBinTalla` | | Actualiza la talla asignada a un bin |
| `CL_CARGAR_TALLAS` | | Carga tallas disponibles para clasificado |
| `CL_MUESTREO_SELECT` | fechas, línea | Muestreos de control de calidad del clasificado |
| `CL_LOTES_INFLADOS_CURSOR` | | Detecta lotes con peso "inflado" para corrección |
| `CL_FACTURAS_INSERT` / `_SELECT` / `_SELECT_REPORTE` | | CRUD de facturas del clasificado |
| `CL_FACTURA_PROFORMA_CURSOR_proshrimp` / `_PREFACTURADA` | | Generación de facturas proforma |
| `CL_MOSTRAR_FACTURAS_PROFORMA` / `_IMPRIMIR` | | Proformas para pantalla / impresión |
| `CL_PendientesCerrarLgaunasSAP` | | Lagunas con remisiones pendientes de cerrar en SAP |
| `CL_ROL_TRANSPORTISTAS_INSERT` / `_SIG` / `_UPDATE` | | CRUD del rol de transportistas |
| `CL_DISTRIBUCION_TALLAS_REMISIONES_D_INSERT_CAD` | | Inserta distribución de tallas en remisión |
| `CL_TANQUES_INSERT` | | Registra un nuevo tanque |

---

#### GRUPO DCP — Control de Producción y Planilla

| Procedimiento | Propósito |
|---|---|
| `DCP_ActualizaEmpleadosDeptos` | Sincroniza empleados con sus departamentos/procesos desde RRHH |
| `DCP_ActualizaLibrasPagosGrupalesFactor` | Recalcula libras y factores de pagos grupales masivamente |
| `DCP_ActualizaLibrasPagosGrupalesFactorFecha` | Igual pero para un rango de fechas específico |
| `DCP_CalculopMontosExtraFechas` | Cálculo de montos extra por empleado y proceso en el período |
| `DCP_ComparativoInsumosPresupuestovsEjecutado` | Comparativo insumos presupuestados vs realmente ejecutados |
| `DCP_ConsumosArticulosDetInsertar` | Insertar detalle de consumo de artículos |
| `DCP_ArticulosProcesosSelect` | Artículos/insumos asignados a un proceso con nombre, unidad, costo |
| `Dcp_AsistenciaBiometricoReporte` | Reporte detallado de asistencia: horas trabajadas, horas extra, evaluación |
| `Dcp_AsistenciaporPuestoFechaReporte` | Asistencia agrupada por puesto y fecha |
| `ActualizaAsistenciaBiometrico` | Procesa marcas biométricas → actualiza RH_AsistenciaEmpleadosEvaluada |
| `AlertadeLineassinAsistencia` | Líneas de producción sin asistencia registrada (alerta de control) |
| `AsignarcostoRutaporempleado` | Asigna costo de ruta de transporte a cada empleado |
| `DatosPlanillaIntegracionReporte` | Datos para integración con sistema de planilla (distribución costos personales) |
| `ArticulosSodisaSelect` | Artículos disponibles del sistema SAP/Sodisa para consumos |
| `DCP_CAMBIARCONTRA` | Cambiar contraseña de usuario del sistema |
| `DCP_ALIMENTOS_INSERT` | Insertar alimentos en DCP_ALIMENTOS |

---

#### GRUPO CF — Costos y Finanzas

| Procedimiento | Propósito |
|---|---|
| `CF_CostosConceptosFechasInsert` | Inserta costos de conceptos para fechas específicas |
| `CF_CostosConceptosFechasSelect` | Costos de conceptos distribuidos en el mes/año indicado |
| `CF_CostosConceptosMesesSelect` | Costos mensuales consolidados por concepto |
| `CF_CostosConceptosSelectActivo` | Conceptos de costo activos con tipos y cuentas contables |
| `CF_DistribucionEnergiaSelect` | Distribución de energía eléctrica por proceso: KWH y costo asignado |
| `CF_DistribuirFechasProcesos` | Distribuye costos mensuales en fechas individuales de producción |
| `CF_TasasCambioDiarioSelect` | Tasas de cambio diarias del período solicitado (USD/Lempira) |

---

#### GRUPO CPP — Parámetros de Control de Producción

| Procedimiento | Propósito |
|---|---|
| `CPP__PARAMETROS_BASCULAS_INSERT` | Insertar parámetros de básculas |
| `CPP_PARAMETROS_LIBRAS_MOSTRAR` / `_BASCULA_MOSTRAR` | Parámetros de límites de libras y básculas |
| `CPP_PARAMETROS_LIMITE_LIBRAS_INSERT` | Insertar parámetros de límite de libras por talla |
| `CPP_PESO_PRODUCTO_MOSTRAR` | Pesadas de producto con talla asignada |
| `CPP_PRODUCTO_UPDATE_ANULAR` | Anular una pesada de producto |
| `CPP_R_PESO_PRODUCTO` | Reporte de pesadas de producto en el período |
| `CPP_UPDATE_PUERTOS` | Actualizar puertos de comunicación para básculas |
| `CPP_DEPARTAMENTO_NOMBRE` / `_COMBO` | Nombre/lista de departamentos |

---

### 3.5 VISTAS PRINCIPALES — STB_data (Power BI / reportes)

| Vista | Propósito |
|---|---|
| `V_RECEPCION_INFO` | Consolida R_REMISIONES_PLANTA + Detalle + Finca/Laguna: REMISION_GENERAL, CLIENTE, Laguna, LIBRAS_REMISION, LIBRAS_RECHAZO, TipoOrigen, TipoProceso |
| `V_InformacionPagosPesado` | UNION de pagos de Descabezado + Pelado + Asistencia Grupal |
| `V_Pagosxdia` | Pagos por día por empleado desde DCP_PagoGrupalAsistencias |
| `V_PagosxFactor` | Pagos por factor (líneas grupales) |
| `CC_LAGUNASCICLOS` | R_Fincas + R_Lagunas + R_LagunaCiclos + R_ClientesFincas → incluye **IdFincaPlanta** e **IdLagunaPlanta** |
| `VR_REMISIONES_PLANTAII` | REMISION_GENERAL, SUM(LIBRAS), ID_LAGUNA_CICLO, ID_REMISION_PLANTA |
| `V_PagosxDiaFactorTodosPBI` | Pagos de todos los procesos por día (Power BI) |
| `V_PagosxDiaFactorPBI` | Pagos por factor (Power BI) |
| `V_PagosxPeladoIndividualPBI` | Pagos de pelado individual (Power BI) |
| `V_PagosxDescabezadoIndividualPBI` | Pagos de descabezado individual (Power BI) |
| `RemisionesPlantaPBI` | Remisiones de planta para Power BI |
| `PBIInventarios` | Inventarios para Power BI |
| `VRendimientosFlujosMaquinas` | Rendimientos de máquinas IQF |
| `VRendimientosColaDiarios` | Rendimientos de cola diarios |
| `VrendimientosClasificadoDiario` | Rendimientos de clasificado diario |
| `VPesadoColaPBI` / `VPesadoCabezaPBI` | Pesados de cola/cabeza para Power BI |
| `VR_PesadoRecepcion` | Pesado de recepción resumido |

---

## 4. RELACIÓN ENTRE AMBAS BASES DE DATOS

### 4.1 Puntos de integración directa

STB_data es el sistema **UPSTREAM** (aguas arriba) de PlantaEmpacadora. La información fluye de STB_data hacia PlantaEmpacadora.

| Campo en STB_data | Campo en PlantaEmpacadora | Descripción del vínculo |
|---|---|---|
| `R_REMISIONES_PLANTA.REMISION_GENERAL` | `Remisiones.Correlativo` (o `NoRemision`) | Número de remisión coincide en ambas BD. Formato: "STB0000154-21" |
| `R_REMISIONES_PLANTA.IdRemisionPlantaEmp` | `Remisiones.ID` (IDRemision) | **FK directa** del registro de remisión en PlantaEmpacadora |
| `R_Fincas.IdFincaPlanta` | `Fincas.IDFinca` | Las fincas de STB_data referencian directamente el ID de PlantaEmpacadora |
| `R_Lagunas.IdLagunaPlanta` | `Lagunas.IDLaguna` | Las lagunas de STB_data referencian directamente el ID de PlantaEmpacadora |
| `CL_LLENADO_RECIPIENTES.Remision` | `Remisiones.NoRemision` | Número de remisión como texto en la clasificación |
| `DCP_TALLAS` ↔ `Tallas` | Catálogos sincronizados | Las tallas se coordinan entre ambas BD |
| `CL_InventarioClasificado` | `OrdenesProduccion` | El inventario clasificado alimenta las OPs de empaque |

### 4.2 Diagrama de flujo entre bases

```
STB_data                                     PlantaEmpacadora
════════════════════════════════             ════════════════════════════════════
R_REMISIONES_PLANTA
  REMISION_GENERAL="STB0000154-21" ────────► Remisiones.NoRemision
  IdRemisionPlantaEmp=789          ────────► Remisiones.IDRemision = 789

R_Fincas.IdFinca=31                ────────► Fincas.IDFinca=31
  + IdFincaPlanta = IDFinca en PE              "GRANJAS MARINAS DEL SUR"

R_Lagunas.IdLaguna=41314           ────────► Lagunas.IDLaguna=41314
  + IdLagunaPlanta = IDLaguna en PE

                                             LotesRemision.fkRemision = Remisiones.ID
                                             LotesRemision.Fksiembra = Siembras.Idsiembra

CL_LLENADO_RECIPIENTES (clasificado)         OrdenesProduccion
CL_InventarioClasificado ───────────────────► .FkLoteRemision → LotesRemision
(inventario disponible)                       .FkItem → Items (qué producir)

Des_PesadoCola / DES_ASIG_LBRS_EMPLEADOS_DET
PES_LLENADO_RECIPIENTES / PES_ASIG_LBRS_DET
(pago a empleados - SOLO en STB_data)

DCP_PagoGrupalAsistencias                    Seriales → Masteres → Paletas
Dcp_PagosDiasGeneral                         (empaque físico - SOLO en PlantaEmpacadora)
(costos de mano de obra)
                                             PackingList → Facturacion
CF_CostosProduccionProcesosDiario            (exportación y cobro)
(costos por proceso)
```

### 4.3 Tabla de equivalencias de terminología

| STB_data | PlantaEmpacadora | Significado real |
|---|---|---|
| `R_REMISIONES_PLANTA` | `Remisiones` | Llegada de camarón de finca (registro operativo vs. oficial) |
| `R_Fincas` | `Fincas` | Catálogo de fincas (operativo vs. maestro) |
| `R_Lagunas` | `Lagunas` | Catálogo de lagunas (operativo vs. maestro) |
| `R_LagunaCiclos` | `Siembras` | Ciclo de cultivo por laguna |
| `DCP_PROCESOS` | `TiposProceso` | Tipo de proceso (IQF, block, pelado) |
| `DCP_TALLAS` | `Tallas` | Tallas de camarón (count/lb) |
| `CL_InventarioClasificado` | `Inventarios` | Inventario disponible (materia prima clasificada vs. producto terminado) |
| `NUM_BIN` | — | Número de bin físico (contenedor de camarón) — solo existe en STB_data |
| `dcp_LineasProduccion` | `LineasProduccion` | Líneas de producción en planta |
| `DES_ASIG_LBRS_EMPLEADOS_DET.VALOR` | — | Pago a destajo descabezado (solo en STB_data) |
| `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET.VALOR` | — | Pago a destajo pelado/IQF (solo en STB_data) |
| `Dcp_PagosDiasGeneral` | — | Resumen diario de pagos por empleado (solo en STB_data) |

### 4.4 Identificación de empleados

Los empleados en STB_data están identificados por:
- `IdEmpleado` (integer) — ID en el sistema de RRHH
- Número de identidad hondureño (18 dígitos)
- Código STB (ej: "STB170123") — código de nómina en RRHH

**No existe una tabla `Empleados` con datos en STB_data**. Los nombres y datos de los empleados vienen de `DCP_EmpleadosDeptosFechas.NombreEmpleado` o de `Dcp_PagosDiasGeneral.NombreEmpleado`.

---

## 5. FLUJO COMPLETO DE PRODUCCIÓN (7 fases)

### Fase 1: Cosecha y Llegada a Planta

1. El camarón se cosecha en una laguna (ciclo activo en `R_LagunaCiclos`)
2. El camión sale de la finca → se registra en **STB_data:** `R_REMISIONES_PLANTA` (estado: `CERRADA=0`)
3. Al llegar a planta: pesado en báscula → `R_PesadoRecepcion` + `R_PesadoRecepcionD`
4. Paralelamente en **PlantaEmpacadora:** se crea `Remisiones` con `NoRemision = REMISION_GENERAL` de STB_data
5. Se crean `LotesRemision` (cada lote = una siembra `Siembras`)

### Fase 2: Descabezado (STB_data)

1. Se abre una sesión de trabajo: `Des_InformacionLineas` (línea + talla + precio)
2. Los empleados se asignan a líneas: `DES_EMPLEADOS_LINEAS`
3. Se registran libras procesadas por empleado: `DES_ASIG_LBRS_EMPLEADOS` + `DES_ASIG_LBRS_EMPLEADOS_DET`
4. Pago = `LIBRAS × PrecioLibra = VALOR` (en lempiras)
5. El camarón descabezado se pesa: `Des_PesadoCola` + `Des_PesadoColaD`

### Fase 3: Clasificado por Talla (STB_data)

1. Se abre lote de clasificación: `CL_LLENADO_RECIPIENTES` (cabecera)
2. Por cada bin clasificado: `CL_LLENADO_RECIPIENTES_D` (bin, libras, talla)
3. El bin entra al inventario: `CL_InventarioClasificado` (`EnInventario=1`)
4. Se crean remisiones hacia empaque: `CL_REMISIONES` + `CL_REMISIONES_DET`
5. Se despacha: `CL_EnviosClasificado`

### Fase 4: Pesado IQF / Pelado (STB_data)

1. Se asignan recipientes a líneas: `PES_ASIGNACION_RECIPIENTES_LINEAS`
2. Se llenan los recipientes: `PES_LLENADO_RECIPIENTES` + `PES_LLENADO_RECIPIENTES_DET`
3. Se registran libras por empleado: `PES_ASIGNACION_LIBRAS_EMPLEADOS` + `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET`
4. Pago = `LIBRAS × PRECIO_LIBRA = VALOR`
5. Los túneles IQF se monitorean: `MT_InformacionesMaquinasMaster`

### Fase 5: Empaque y Serialización (PlantaEmpacadora)

1. Se crea la Orden de Producción: `OrdenesProduccion` (`FkItem` + `FkLoteRemision`)
2. Los operarios empacan cajitas individuales (seriales): `Seriales`
3. Se forman cartones master (N seriales): `Masteres`
4. Se arman paletas (N masters): `Paletas`
5. El producto pasa a inventario: `Inventarios`
6. Cada movimiento queda en: `BitacoradeEventosSeriales`

### Fase 6: Envío y Exportación (PlantaEmpacadora)

1. Se crea el ship/envío: `Envios`
2. Se asignan paletas/masters al envío: `Masteres.FkEnvio` / `Paletas.FkEnvio`
3. Se genera el packing list: `PackingList` + `PackingListDetalle`
4. Se emite la factura SAR: `Facturacion` + `FacturacionDetalle`

### Fase 7: Costos y Finanzas (STB_data)

1. Mano de obra descabezado: SUMA de `DES_ASIG_LBRS_EMPLEADOS_DET.VALOR`
2. Mano de obra pelado/IQF: SUMA de `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET.VALOR`
3. Pagos grupales: `DCP_PagoGrupalAsistencias` + `DCP_PagoGrupalAsistenciasDetalle`
4. Consumos de insumos: `DCP_ConsumosArticulosDet`
5. Energía eléctrica: `CF_DsitribucionEnergiaElectrica`
6. Hielo: `Ice_DistrubucionHieloProcesos`
7. Costo por libra: `CF_CostosProduccionProcesosDiario.CostoXLibra`
8. Tasa de cambio: `Dcp_TasaCambio` (mensual) / `CF_TasasCambioDiario` (diaria)
9. Prorrateo de planilla: `CTB_ProrateoPlanillaDetalle`

---

## 6. GUÍA RÁPIDA — QUÉ CONSULTAR PARA CADA PREGUNTA

### Producción

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Cuánto se produjo (empacó) en el período? | PlantaEmpacadora | `a_Fill_Produccion_Diaria` (@Resumen=1, fechas) |
| ¿Producción por finca/laguna? | PlantaEmpacadora | `a_Fill_Produccion_Diaria` + filtro Finca |
| ¿Producción por empresa/cliente? | PlantaEmpacadora | `a_Fill_Produccion_Diaria_u` (@Usuario=CodEmpresa) |
| ¿Qué contiene la OP S002210516? | PlantaEmpacadora | `a_Fill_Produccion_OP` ('S002210516') |
| ¿Cuánto se descabezó hoy? | STB_data | `DES_ASIG_LBRS_EMPLEADOS_DET` + filtro fecha |
| ¿Cuánto se clasificó esta semana por talla? | STB_data | `CL_LLENADO_RECIPIENTES_D` JOIN `DCP_TALLAS` |
| ¿Cuánto se procesó en IQF/pelado? | STB_data | `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET` + fecha |
| ¿Rendimiento total (kg recibido vs. producido)? | PlantaEmpacadora | `a_Fill_LibrasRecibidas_Vrs_LibrasProcesadas` |
| ¿Qué está en producción ahora? | PlantaEmpacadora | `a_Fill_ProductoEnProceso` |
| ¿KG producidos por mes? | PlantaEmpacadora | `KardexProduccion` ORDER BY Año DESC, Mes DESC |

### Trazabilidad de Producto

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿De qué finca viene el serial S001234? | PlantaEmpacadora | `sp_GetFullSerialInfo` / `sp_GetSerialInfo` |
| ¿Qué hay en el master M000000973? | PlantaEmpacadora | `sp_GetMasterContain` / `Movil_GetMasterInfo` |
| ¿Qué contiene la paleta P000001731? | PlantaEmpacadora | `sp_GetPaletContain` |
| ¿Dónde está el serial S001234 ahora? | PlantaEmpacadora | `sp_GetSerialInfo` → campo Localidad |
| ¿La finca X tiene certificación ASC? | PlantaEmpacadora | `FincasCertificados WHERE fkFinca=X AND TipoCertificado='ASC'` |
| ¿Qué ciclo/siembra produjo la OP X? | PlantaEmpacadora | `OrdenesProduccion` JOIN `LotesRemision` JOIN `Siembras` |

### Inventario

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Qué hay en bodega de producto terminado? | PlantaEmpacadora | `a_Fill_InventarioActual` (@Resumen=1) |
| ¿Inventario de la empresa/cliente X? | PlantaEmpacadora | `a_Fill_InventarioActual_fkEmpresa` (fkEmpresa) |
| ¿Qué hay disponible para armar packing list? | PlantaEmpacadora | `a_Fill_InventarioActual_toPackingList` (fkEmpresa) |
| ¿Cuánto camarón clasificado está disponible? | STB_data | `CL_InventarioClasificadoPantalla` |
| ¿Inventario clasificado por talla y proceso? | STB_data | `Cl_InvetarioActualReporte` (0) |
| ¿Cuántas libras hay por talla del camarón? | STB_data | `CL_InventarioClasificado WHERE EnInventario=1` JOIN `DCP_TALLAS` |
| ¿Un bin específico está en inventario? | STB_data | `cl_VerificaBinInventario` (@NUM_BIN) |

### Envíos y Exportación

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Qué se despachó en el período? | PlantaEmpacadora | `a_Fill_Envios` (@Resumen=1, fechas) |
| ¿Qué contiene el envío/ship #162? | PlantaEmpacadora | `a_Fill_Envio_detalle` (162) |
| ¿Cómo está organizado el contenedor (estibas)? | PlantaEmpacadora | `a_Fill_Envios_estiba` (@Tipo=0, @IdEnvio=X) |
| ¿Packing list del embarque COEX1-000187? | PlantaEmpacadora | `a_Fill_PackingExport_Detalle` (fkPackingList) |
| ¿Todos los packing lists del mes? | PlantaEmpacadora | `a_Fill_PackingList_Export_Full` (fechas) |

### Facturación y Contabilidad

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Cuánto se facturó en el período? | PlantaEmpacadora | `a_Fill_contabilidad` (@Tipo=1, fechas) |
| ¿Resumen mensual por cliente? | PlantaEmpacadora | `a_Fill_contabilidad` (@Tipo=2, fechas) |
| ¿Facturación diaria con tasa de cambio? | PlantaEmpacadora | `a_Fill_contabilidad` (@Tipo=3, fechas) |
| ¿Maquila de terceros? | PlantaEmpacadora | `a_Fill_contabilidad` (@Tipo=4, fechas) |
| ¿Detalle de una factura específica? | PlantaEmpacadora | `FacturacionDetalle WHERE fkFactura=X` |
| ¿Precios acordados con un cliente? | PlantaEmpacadora | `FacturacionPrecios WHERE fkCliente=X` |

### Materia Prima y Liquidaciones

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Qué materia prima compré en el período? | PlantaEmpacadora | `a_Fill_MateriaPrima` (tipo, fechas) |
| ¿Liquidación de la siembra laguna5-ciclo2? | PlantaEmpacadora | `a_Fill_LiquidacionLaguna_ENC` + `_detalle_total` |
| ¿Remisiones recibidas en los últimos 7 días? | STB_data | `R_REMISIONES_PLANTA WHERE FECHA_REMISION >= DATEADD(DAY,-7,GETDATE())` |
| ¿Cuántas libras llegaron de la finca X? | STB_data | `R_REMISIONES_PLANTA_DETALLE` JOIN `R_LagunaCiclos` JOIN `R_Fincas` |
| ¿Camarón clasificado por laguna? | STB_data | `CL_BusquedaLaguna` (fechas, laguna) |

### Empleados y Pago a Destajo

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Cuántas libras procesó el empleado X en descabezado? | STB_data | `DES_ASIG_LBRS_EMPLEADOS_DET` JOIN `DCP_EmpleadosDeptosFechas` |
| ¿Cuántas libras procesó el empleado X en pelado/IQF? | STB_data | `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET` + IdEmpleado |
| ¿Cuánto ganó el empleado X esta semana? | STB_data | `Dcp_PagosDiasGeneral WHERE IdEmpleado=X AND Fecha BETWEEN...` |
| ¿Asistencia del día de los empleados? | STB_data | `Dcp_AsistenciaBiometricoReporte` (fechas) |
| ¿Marcas biométricas de hoy? | STB_data | `DCP_MarcaBiometrico WHERE CAST(Fecha AS DATE)=CAST(GETDATE() AS DATE)` |
| ¿Pagos grupales de la línea X? | STB_data | `DCP_PagoGrupalAsistencias` + `DCP_PagoGrupalAsistenciasDetalle` |
| ¿Salidas durante la jornada (baño, médico)? | STB_data | `PRO_MonitoreoSalidas` JOIN `PRO_TiposSalidas` |
| ¿Visitas a enfermería del mes? | STB_data | `PRO_VisitasEnfermeria` + `PRO_MonitoreoSalidas` |

### Costos de Producción

| Consulta | Base de datos | Tabla/Procedimiento |
|---|---|---|
| ¿Costo total de mano de obra del mes? | STB_data | SUM(`DES_ASIG_LBRS_EMPLEADOS_DET.VALOR`) + SUM(`PES_ASIGNACION_LIBRAS_EMPLEADOS_DET.VALOR`) |
| ¿Cuánto costó procesar una libra? | STB_data | `CF_CostosConceptosMesesSelect` (año, mes) |
| ¿Distribución de energía eléctrica? | STB_data | `CF_DistribucionEnergiaSelect` (año, mes) |
| ¿Insumos presupuestados vs ejecutados? | STB_data | `DCP_ComparativoInsumosPresupuestovsEjecutado` |
| ¿Tasa de cambio del mes? | STB_data | `Dcp_TasaCambio WHERE Año=X AND Mes=Y` |
| ¿Distribución contable de planilla? | STB_data | `CTB_ProrateoPlanillaDetalle WHERE FechaDesde=...` |
| ¿Rendimiento de máquinas IQF? | STB_data | `MT_InformacionesMaquinasMaster` JOIN `MT_Maquinas` |

---

## 7. CONSULTAS SQL DE EJEMPLO

### Producción diaria por finca y talla (PlantaEmpacadora)

```sql
SELECT 
    CAST(DATEADD(MINUTE,-359,s.Created) AS DATE) AS DiaProduccion,
    f.NombreFinca,
    l.NombreLaguna,
    i.Descripcion AS Producto,
    COUNT(s.IDSerial) AS TotalCajitas,
    SUM(i.PesoNeto) AS TotalKilos
FROM [PlantaEmpacadora].[dbo].[Seriales] s
JOIN [PlantaEmpacadora].[dbo].[OrdenesProduccion] op ON op.IDOrdenProduccion = s.FkOrdenProduccion
JOIN [PlantaEmpacadora].[dbo].[Items] i ON i.IDItem = op.FkItem
JOIN [PlantaEmpacadora].[dbo].[LotesRemision] lr ON lr.IDLoteRemision = op.FkLoteRemision
JOIN [PlantaEmpacadora].[dbo].[Siembras] si ON si.Idsiembra = lr.Fksiembra
JOIN [PlantaEmpacadora].[dbo].[Lagunas] l ON l.IDLaguna = si.fklaguna
JOIN [PlantaEmpacadora].[dbo].[Fincas] f ON f.IDFinca = l.fkfinca
WHERE s.Eliminado = 0
  AND CAST(DATEADD(MINUTE,-359,s.Created) AS DATE) 
      BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY CAST(DATEADD(MINUTE,-359,s.Created) AS DATE), f.NombreFinca, l.NombreLaguna, i.Descripcion
ORDER BY DiaProduccion DESC, TotalKilos DESC
```

---

### Inventario actual de producto terminado (PlantaEmpacadora)

```sql
SELECT 
    i.Codigo AS CodigoItem,
    i.Descripcion AS Producto,
    lo.NombreLocalidad AS Bodega,
    COUNT(m.IDMaster) AS TotalMasters,
    SUM(i.PesoNeto) AS TotalKilosEstimados
FROM [PlantaEmpacadora].[dbo].[Masteres] m
JOIN [PlantaEmpacadora].[dbo].[Items] i ON i.IDItem = m.FkItem
JOIN [PlantaEmpacadora].[dbo].[Localidades] lo ON lo.IDLocalidad = m.FkLocalidad
WHERE m.FkEnvio IS NULL  -- no ha sido despachado
  AND m.FkPaleta IS NULL -- no está en paleta (ajustar según lógica de negocio)
GROUP BY i.Codigo, i.Descripcion, lo.NombreLocalidad
ORDER BY TotalKilosEstimados DESC
```

---

### Packing lists del último año con cliente y totales (PlantaEmpacadora)

```sql
SELECT 
    pl.NumeroPackingList,
    pl.FechaEmbarque,
    cp.Nombre AS Cliente,
    pl.TotalCajas,
    pl.TotalKilos,
    f.NumeroFactura
FROM [PlantaEmpacadora].[dbo].[PackingList] pl
JOIN [PlantaEmpacadora].[dbo].[ClientesProduccion] cp ON cp.IDCliente = pl.fkCliente
LEFT JOIN [PlantaEmpacadora].[dbo].[Facturacion] f ON f.fkPackingList = pl.IDPackingList
WHERE pl.FechaEmbarque >= DATEADD(YEAR, -1, GETDATE())
ORDER BY pl.FechaEmbarque DESC
```

---

### Remisiones recibidas en los últimos 7 días con finca y libras (STB_data)

```sql
SELECT 
    rp.REMISION_GENERAL AS NumRemision,
    rp.FECHA_REMISION,
    rf.Finca,
    rl.Laguna,
    lc.LagunaCiclo,
    SUM(rpd.LIBRAS) AS TotalLibras,
    rp.CONDUCTOR,
    rp.CERRADA,
    tp.Nombre AS TipoProceso
FROM [STB_data].[dbo].[R_REMISIONES_PLANTA] rp
JOIN [STB_data].[dbo].[R_REMISIONES_PLANTA_DETALLE] rpd 
    ON rp.ID_REMISION_PLANTA = rpd.ID_REMISION_PLANTA
JOIN [STB_data].[dbo].[R_LagunaCiclos] lc 
    ON rp.ID_LAGUNA_CICLO = lc.IdLagunaCiclo
JOIN [STB_data].[dbo].[R_Lagunas] rl ON lc.IdLaguna = rl.IdLaguna
JOIN [STB_data].[dbo].[R_Fincas] rf ON rl.IdFinca = rf.IdFinca
JOIN [STB_data].[dbo].[R_TiposProceso] tp ON rp.IdTipoProceso = tp.IdTipoProceso
WHERE rp.FECHA_REMISION >= DATEADD(DAY, -7, GETDATE())
  AND rp.ANULADA = 0
GROUP BY rp.REMISION_GENERAL, rp.FECHA_REMISION, rf.Finca, rl.Laguna, 
         lc.LagunaCiclo, rp.CONDUCTOR, rp.CERRADA, tp.Nombre
ORDER BY rp.FECHA_REMISION DESC
```

---

### Libras clasificadas hoy por finca y talla (STB_data)

```sql
SELECT 
    rf.Finca,
    t.NOMBRE_TALLA AS Talla,
    COUNT(*) AS NumBins,
    SUM(cld.LIBRAS_NETA) AS LibrasClasificadas,
    AVG(cld.LIBRAS_NETA) AS LibrasPromedioPorBin
FROM [STB_data].[dbo].[CL_LLENADO_RECIPIENTES_D] cld
JOIN [STB_data].[dbo].[CL_LLENADO_RECIPIENTES] cl 
    ON cld.ID_LLENADO_RECIPIENTE = cl.ID_LLENADO_RECIPIENTE
JOIN [STB_data].[dbo].[R_LagunaCiclos] lc ON cl.ID_LAGCICLO = lc.IdLagunaCiclo
JOIN [STB_data].[dbo].[R_Lagunas] rl ON lc.IdLaguna = rl.IdLaguna
JOIN [STB_data].[dbo].[R_Fincas] rf ON rl.IdFinca = rf.IdFinca
JOIN [STB_data].[dbo].[DCP_TALLAS] t ON cld.ID_TALLA = t.ID_TALLA
WHERE cl.FECHA = CAST(GETDATE() AS DATE)
  AND cld.ANULADO = 0
GROUP BY rf.Finca, t.NOMBRE_TALLA
ORDER BY LibrasClasificadas DESC
```

---

### Pago a empleados de descabezado hoy (STB_data)

```sql
SELECT 
    e.NombreEmpleado,
    e.Identidad,
    t.NOMBRE_TALLA AS Talla,
    SUM(d.LIBRAS) AS TotalLibras,
    AVG(d.PrecioLibra) AS PrecioPromedio,
    SUM(d.VALOR) AS TotalPagoLempiras,
    SUM(d.VALOR) / 24.5 AS TotalPagoUSD  -- ajustar tasa de cambio
FROM [STB_data].[dbo].[DES_ASIG_LBRS_EMPLEADOS_DET] d
JOIN [STB_data].[dbo].[DCP_EmpleadosDeptosFechas] e 
    ON d.ID_EMPLEADO_LINEA = e.IdEmpleadoDepto
JOIN [STB_data].[dbo].[DCP_TALLAS] t ON d.ID_TALLA = t.ID_TALLA
WHERE e.Fecha = CAST(GETDATE() AS DATE)
  AND d.ANULADO = 0
GROUP BY e.NombreEmpleado, e.Identidad, t.NOMBRE_TALLA
ORDER BY TotalLibras DESC
```

---

### Inventario de camarón clasificado disponible (STB_data)

```sql
SELECT 
    ic.Fecha,
    ic.BIN,
    t.NOMBRE_TALLA AS Talla,
    ic.LibrasNetas,
    ic.FincaPBI AS Finca,
    ic.LagunaPBI AS Laguna,
    ic.Destino
FROM [STB_data].[dbo].[CL_InventarioClasificado] ic
LEFT JOIN [STB_data].[dbo].[DCP_TALLAS] t ON ic.IdTallaFinal = t.ID_TALLA
WHERE ic.EnInventario = 1
  AND ic.Transferido = 0
  AND ic.Procesado = 0
ORDER BY ic.Fecha DESC, ic.LibrasNetas DESC
```

---

### Asistencia del día por empleado (STB_data)

```sql
SELECT 
    IDEmpleado,
    MIN(Fecha) AS PrimeraMarca,
    MAX(Fecha) AS UltimaMarca,
    COUNT(*) AS TotalMarcas,
    DATEDIFF(MINUTE, MIN(Fecha), MAX(Fecha)) / 60.0 AS HorasTrabajadas
FROM [STB_data].[dbo].[DCP_MarcaBiometrico]
WHERE CAST(Fecha AS DATE) = CAST(GETDATE() AS DATE)
GROUP BY IDEmpleado
HAVING COUNT(*) >= 2  -- al menos entrada y salida
ORDER BY PrimeraMarca
```

---

### Cross-database: Remisiones cruzando ambas BD

```sql
-- Remisiones que aparecen en ambos sistemas
SELECT 
    rp.REMISION_GENERAL AS RemisionSTB,
    rp.FECHA_REMISION,
    rp.IdRemisionPlantaEmp AS IDenPlantaEmpacadora,
    rf.Finca,
    rl.Laguna,
    rp.CONDUCTOR,
    SUM(rpd.LIBRAS) AS TotalLibrasSTB
FROM [STB_data].[dbo].[R_REMISIONES_PLANTA] rp
JOIN [STB_data].[dbo].[R_REMISIONES_PLANTA_DETALLE] rpd 
    ON rp.ID_REMISION_PLANTA = rpd.ID_REMISION_PLANTA
JOIN [STB_data].[dbo].[R_LagunaCiclos] lc 
    ON rp.ID_LAGUNA_CICLO = lc.IdLagunaCiclo
JOIN [STB_data].[dbo].[R_Lagunas] rl ON lc.IdLaguna = rl.IdLaguna
JOIN [STB_data].[dbo].[R_Fincas] rf ON rl.IdFinca = rf.IdFinca
WHERE rp.FECHA_REMISION >= '2025-01-01'
  AND rp.ANULADA = 0
GROUP BY rp.REMISION_GENERAL, rp.FECHA_REMISION, rp.IdRemisionPlantaEmp,
         rf.Finca, rl.Laguna, rp.CONDUCTOR
ORDER BY rp.FECHA_REMISION DESC
```

---

### Kardex mensual de producción (PlantaEmpacadora)

```sql
SELECT 
    Año,
    Mes,
    KilosComprados,
    KilosProducidos,
    KilosVendidos,
    KilosMaquilados,
    (KilosProducidos - KilosVendidos) AS SaldoKilos
FROM [PlantaEmpacadora].[dbo].[KardexProduccion]
ORDER BY Año DESC, Mes DESC
```

---

## 8. NOTAS CRÍTICAS PARA EL AGENTE

### Sobre las tablas

1. **Tablas de catálogo vacías en PlantaEmpacadora:** `Estatus`, `Tallas`, `TiposItem`, `Estilos`, `Remisiones`, `Siembras`, `LineasProduccion`, `Navieras`, `DestinosCarga`, `IncoTerms` — usar LEFT JOIN cuando se incluyan.

2. **Tablas de backup — NO usar para consultas:** `OrdenesProduccion_copy_240326`, `Items_todo` en PlantaEmpacadora.

3. **Tablas compartidas en STB_data están vacías:** `Fincas`, `Lagunas`, `Remisiones`, `Siembras`, `Empresas` en STB_data están vacías — los datos maestros viven en PlantaEmpacadora. STB_data usa sus propias tablas `R_Fincas`, `R_Lagunas`, etc.

### Sobre procedimientos almacenados de producción

3.5. **`a_Fill_Produccion_Diaria_lectura_dos` — SP canónico para libras empacadas, libras producidas e IQF:** Para cualquier consulta sobre libras empacadas por día, libras producidas por período, rendimiento de equipos IQF (libras/hora), horas trabajadas por torre/salmuera, o análisis de producto descongelado vs. fresco, SIEMPRE usar este SP en lugar de consultas directas a tablas. Los modos más importantes son:
   - `@Resumen = 27` → rendimiento IQF por hora (versión producción, sin NombreGrupo)
   - `@Resumen = 23` → igual que 27 pero con desglose por NombreGrupo
   - `@Resumen = 30` → horas trabajadas por equipo IQF sin desglose por cliente
   - `@Resumen = 28` → libras descongeladas vs. frescas agrupadas por fecha de carga
   - `@Resumen = 24` → detalle de OPs que componen cada envío descongelado/fresco
   - Ver sección 2.4.1 para documentación completa de todos los modos.

### Sobre las unidades y fechas

4. **Unidades:** Todo el sistema opera en **libras**. Los precios de compra están en libras. Para convertir a kilos: `libras / 2.20462`.

5. **Día de producción:** La jornada va de 6:00 AM a 5:59 AM del siguiente día. SIEMPRE usar `CAST(DATEADD(MINUTE,-359,Seriales.Created) AS DATE)` — nunca `FechaProduccion` de OrdenesProduccion.

6. **Formato fechas SQL Server:** Usar `'2025-01-01'` (ISO) o `CAST(N'2025-01-01' AS DATE)`.

### Sobre clientes y empresas

7. **`fkCliente` en contextos distintos:**
   - En `PackingList.fkCliente` → `ClientesProduccion`
   - En `Facturacion.fkClientePrincipal` → `ClientesPrincipales`
   - En `Items.fkCliente` → `ClientesPrincipales` (cliente dueño del item)
   - En `Masteres.fkCliente` → `ClientesProduccion`

8. **`Empresas` vs `ClientesProduccion`:** `Empresas` = propietarios del camarón (mandan la finca). `ClientesProduccion` = compradores del producto terminado. Una empresa se liga a un cliente de producción mediante `Empresas.fkClienteProduccion`.

9. **Números de documentos — patrones:**
   - Seriales: `S00DDMMNNN`
   - Masteres: `M000000XXX`
   - Paletas: `P000000XXX`
   - PackingList: `CODCLIENTE-000XXX` (ej: `COEX1-000187`)
   - Remisiones STB: `STB0000154-21` (número-año)
   - OP: `S002210516` (S+fecha+seq)

### Sobre STB_data

10. **Empleados:** No hay tabla `Empleados` con datos. Los nombres vienen de `DCP_EmpleadosDeptosFechas.NombreEmpleado` o `Dcp_PagosDiasGeneral.NombreEmpleado`. Identificadores: `IdEmpleado` (int), identidad hondureña (18 dígitos), código STB (ej: "STB170123").

11. **Asignación actual vs. histórica de empleados:**
    - `DCP_EmpleadosDeptos` = asignación ACTUAL (sin historial de fecha)
    - `DCP_EmpleadosDeptosFechas` = historial completo por fecha → usar siempre para auditorías

12. **Turnos:** La planta opera múltiples turnos. Las marcas biométricas van desde las 3 AM (turno madrugada) hasta las 23:00. El turno madrugada cruza la medianoche.

13. **Certificación ASC:** `EsASC=1` y `CodigoASC` en `R_REMISIONES_PLANTA` indica que ese lote de camarón tiene trazabilidad de certificación Aquaculture Stewardship Council — es un requisito para exportación a ciertos mercados (Europa).

14. **Períodos de producción:** Nomenclatura: H1-YYYY (primera mitad del año), H2-YYYY (segunda mitad), Q1Q2-YYYY, Q3Q4-YYYY.

---

*Documentación unificada generada el 2026-06-23.*  
*Fuentes: `DDL planta empacadora.sql` (33.7M líneas) · `DDL stbdata.sql` (20.7M líneas) · Análisis de procedimientos almacenados, vistas y datos de muestra.*  
*Cubre: PlantaEmpacadora (~280 tablas, 500+ procedimientos) y STB_data (~348 tablas, 200+ procedimientos).*
