# Documentación Funcional de Módulos — Dashboard Gerencial

Este documento es una guía independiente para ubicar, interpretar y consultar los datos del Dashboard Gerencial. Incluye la ubicación en pantalla, el comportamiento de los filtros, las fuentes SQL, las fórmulas y ejemplos de consultas. No requiere leer otra documentación ni el código para usarlo.

**Alcance:** los ocho módulos de datos: IQF, Pelado, Recepción, Descabezado, Clasificado, Exportaciones, Compra de Materia Prima e Inventario. Las funciones descritas corresponden al código revisado el 17 de septiembre de 2026; la mayoría de los indicadores se revisaron desde el código. Las horas IQF del 1 al 15 de enero de 2026 sí se verificaron contra PlantaEmpacadora, como se detalla en su sección.

## Propuesta de menú de consulta rápida por módulo

**Estado: especificación para implementar.** El menú y los botones descritos aquí todavía no están implementados. Utilizan las fuentes y endpoints existentes del dashboard; no requieren leer otra documentación para saber de dónde obtener cada indicador.

### Opciones y navegación

El botón **Menú** abre ocho opciones, sin Usuarios: **Compra de Materia Prima, Recepción, Descabezado, Clasificado, Pelado, IQF, Exportaciones e Inventario**. Mostrar únicamente módulos permitidos al usuario. Al seleccionar uno, consultar su resumen actual y mostrarlo en un mensaje o tarjeta, con unidad, período y hora de consulta.

Debajo del resumen, proponer botones **Actualizar**, **Ver detalle**, **Consultar período** cuando corresponda y **Volver al menú**. Usar texto junto al icono para que la acción sea comprensible. Actualizar repite la consulta del módulo; Ver detalle muestra un desglose; Consultar período solicita Desde/Hasta y turno cuando el reporte lo admite. No aplicar un rango histórico al endpoint de resumen actual.

### Qué muestra cada opción y dónde obtenerlo

Todas las consultas son GET. Las fuentes SQL, uniones y condiciones completas de estos indicadores se describen en las secciones técnicas de cada módulo de este documento.

| Opción del menú | Resumen que debe mostrar al seleccionarla | Endpoint y campos | Base / fuente principal |
| --- | --- | --- | --- |
| **IQF** | IQF 1, IQF 2 e IQF 3: libras acumuladas hoy, última lectura y estado de actividad. **Total de los tres IQF** en libras | `/api/dashboard/iqf-tiempo-real`: `dia`, `actualizado`, `lineas[].linea`, `.libras`, `.ultimaCaja`, `.activa`; total calculado sobre las tres líneas seleccionadas | `PlantaEmpacadora.dbo.AV_Produccion_Diaria_2020`; `SUM(PesoLibras)` por `LineaEquipoIQF` para hoy |
| **Pelado** | Libras peladas hoy por estilo, total del día y libras por hora promedio. Ver detalle permite abrir tallas o salas, con libras, personas registradas y pago por sala | `/api/dashboard/pelado-libras-hoy`: `dia`, `actualizado`, `estilos`, `total`, `librasPorHoraPromedio`; detalle con `/api/dashboard/pelado-libras-hoy-talla` y `/api/dashboard/pelado-por-sala` | `STB_data.dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS` y `dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET`, catálogos de estilo/talla/sala |
| **Recepción** | Libras recibidas HOSO hoy, semana y mes; libras pendientes de procesar, identificadas como saldo global | `/api/dashboard/recepcion-resumen`: `dia`, `actualizado`, `librasRecibidasHoy`, `librasRecibidasSemana`, `librasRecibidasMes`, `librasPendientesProcesar` | `STB_data.dbo.R_REMISIONES_PLANTA` y `dbo.R_REMISIONES_PLANTA_DETALLE` |
| **Descabezado** | Libras descabezadas hoy, semana y mes; personas que registraron descabezado hoy; libras promedio por hora de hoy | `/api/dashboard/descabezado-resumen`: `dia`, `actualizado`, `librasDescabezadasDia`, `librasDescabezadasSemana`, `librasDescabezadasMes`, `personasDia`, `librasPromedioPorHora` | Asignaciones: `STB_data.dbo.DES_ASIG_LBRS_EMPLEADOS`, `_DET` y `dbo.DES_EMPLEADOS_LINEAS`; total entero: `dbo.V_TrazabilidadDescabezadoPBI` |
| **Clasificado** | Libras clasificadas hoy, semana y mes; libras clasificadas por hora de hoy. Ver detalle ofrece inventario clasificado disponible por talla, en bins y libras | `/api/dashboard/clasificado-resumen`: `dia`, `actualizado`, `librasClasificadasHoy`, `librasClasificadasSemana`, `librasClasificadasMes`, `librasClasificadasPorHora`; existencias con `/api/dashboard/clasificado-inventario` | `STB_data.dbo.CL_LLENADO_RECIPIENTES` y `dbo.CL_LLENADO_RECIPIENTES_D`; existencias desde `dbo.CL_InventarioClasificado` |
| **Exportaciones** | Libras de la semana actual a Francia, UK, AC Holding y terceros; total exportado. Encabezado con inicio y fin de semana | `/api/dashboard/exportaciones-resumen`: `semanaInicio`, `semanaFin`, `actualizado`, `librasFrancia`, `librasUK`, `librasACHolding`, `librasTerceros`, `librasTotal` | Tablas base de envíos, másteres y seriales en `PlantaEmpacadora`; fecha `Envios.FechaCarga`, contenedor no vacío |
| **Compra de Materia Prima** | Libras recibidas en el día efectivo, su semana y mes; promedio semanal. Etiquetar el día como **última fecha registrada**, ya que puede ser anterior a hoy | `/api/dashboard/compra-mp-resumen`: `librasRecibidasHoy`, `librasRecibidasSemana`, `librasRecibidasMes`, `librasPromedioSemana`, `semanaInicio`, `semanaFin`, `actualizado`. **Mejora necesaria:** exponer `HoyEfectivo` en la respuesta para mostrar la fecha exacta; actualmente el servicio no lo devuelve | `PlantaEmpacadora.dbo.AV_MateriaPrima`; fecha `DiaProduccion2024`, resumen anclado a la última fecha registrada limitada a hoy |
| **Inventario** | Peso kilos y cantidad serial del producto terminado actual, separados por DISPONIBLE, PENDIENTE, RETENIDO y CUARENTENADO. Destacar el total DISPONIBLE | `/api/inventory`: `items[].disponibilidad`, `.pesoKilos`, `.cantidadSerial`; agrupar y sumar por disponibilidad en el consumidor | `PlantaEmpacadora.dbo.Seriales` y uniones descritas en Inventario; es una foto actual |

### IQF: contrato del resumen de los tres equipos

El endpoint devuelve un catálogo dinámico de líneas; no garantiza exactamente tres elementos. Antes de implementar el menú, configurar la correspondencia entre los nombres reales de `lineas[].linea` y **IQF 1, IQF 2, IQF 3**. No tomar simplemente los primeros tres registros, ni sumar líneas ajenas a esos equipos. Cada registro se incorpora una sola vez al total.

**Total de los tres IQF = libras IQF 1 + libras IQF 2 + libras IQF 3.** Este total corresponde al volumen de los contadores, con `fkTipo < 4`; no equivale necesariamente a libras netas por proceso, que excluyen reempaque. Estado activo significa última lectura hace 15 minutos o menos, no presencia confirmada de personal.

Una línea devuelta por el servicio con cero libras y sin lectura puede mostrarse como **Sin lecturas hoy**. Si un equipo configurado no aparece en la respuesta, mostrar **Sin información del equipo** y advertir que el total está incompleto; no convertir su ausencia o un error de consulta en un cero confirmado.

Ejemplo de formato, con marcadores y sin cifras inventadas:

```text
IQF — Producción de hoy [fecha]
IQF 1: [libras] lb · Última lectura [hora] · [estado]
IQF 2: [libras] lb · Última lectura [hora] · [estado]
IQF 3: [libras] lb · Última lectura [hora] · [estado]
Total de los tres IQF: [suma] lb
Consultado: [hora]
[Actualizar] [Ver detalle] [Consultar período] [Volver al menú]
```

Estos datos son acumulados del día, no un listado de lecturas individuales. El endpoint devuelve la última hora de lectura y libras agregadas; no devuelve un historial de cada caja. Los campos `cajas` y `librasUltimaHora` actualmente se rellenan con cero en el servicio y no deben presentarse como mediciones reales.

### Destino técnico de los botones de detalle y período

| Módulo | Ver detalle | Consultar período |
| --- | --- | --- |
| IQF | Misma respuesta de `/api/dashboard/iqf-tiempo-real` por equipo; opcionalmente rendimiento diario, identificado como lbs/h | Producción completa histórica por equipo requiere implementar un endpoint parametrizado con el SQL del caso «producción de los IQF del día X» de este documento. Ya existen `/api/dashboard/libras-netas-proceso` para netas por proceso e `/api/dashboard/iqf-libras-hora-dia` para rendimiento; ofrecerlos con esos nombres precisos |
| Pelado | `/api/dashboard/pelado-libras-hoy-talla` o `/api/dashboard/pelado-por-sala` | `/api/dashboard/pelado-por-estilo`, `/api/dashboard/pelado-por-talla` o sus variantes `-dia`; fechas y turno opcional |
| Recepción | `/api/dashboard/recepcion-remisiones` con Desde/Hasta iguales a hoy | Mismo endpoint con las fechas solicitadas; sin turno |
| Descabezado | `/api/dashboard/descabezado-por-dia` con Desde/Hasta iguales a hoy | Mismo endpoint con el rango solicitado; sin turno |
| Clasificado | `/api/dashboard/clasificado-inventario` y `/api/dashboard/clasificado-inventario-detalle`, sin fechas | `/api/dashboard/clasificado-por-talla`, `/api/dashboard/clasificado-por-maquina` o `/api/dashboard/clasificado-por-talla-dia`; fechas y turno opcional |
| Exportaciones | `/api/dashboard/exportaciones-contenedores` con fechas de la semana del resumen | Mismo endpoint o `/api/dashboard/exportaciones-por-estilo` con el rango solicitado; sin turno |
| Compra de Materia Prima | `/api/dashboard/compra-mp-por-talla` con fechas explícitas; no asumir hoy como fecha del resumen efectivo | Mismo endpoint o `/api/dashboard/compra-mp-por-proveedor`; fechas solicitadas y sin turno |
| Inventario | Filtrar `items` por cliente, estilo, talla y disponibilidad | No ofrecer período histórico. Ofrecer **Filtrar inventario** sobre existencias actuales |

**Reglas de actualización:** al abrir una opción consultar datos; Actualizar solicita nueva consulta y, para endpoints del dashboard, puede enviar `refresh=true`. El dashboard actual se consulta cada cinco minutos y tiene caché; el nuevo menú debe definir su frecuencia según el canal donde se implemente. Mostrar período y hora de consulta, sin prometer lecturas segundo a segundo. En Inventario, calcular el resumen desde la respuesta completa, sin heredar silenciosamente los filtros iniciales de clientes de la página pivote. No sumar producción, recepción, compra y exportación entre módulos: son etapas distintas y pueden representar el mismo producto.


## Referencia técnica: resolver una solicitud de datos

Para resolver una solicitud, identificar **indicador + dimensión + período + turno** y elegir la fuente correspondiente. “Producción IQF” puede referirse a libras por equipo, libras netas por proceso o rendimiento; son consultas distintas. Las rutas de esta sección son completas.

### Caso: «Quiero ver la producción de los IQF del día X»

**Interpretación:** libras producidas por línea/equipo durante el día solicitado, no libras por hora. Si se pide un IQF específico, agregar el criterio de línea.

| Elemento técnico | Ubicación / regla |
| --- | --- |
| Base de datos | `PlantaEmpacadora` |
| Vista fuente | `dbo.AV_Produccion_Diaria_2020` |
| Fecha de producción | `DiaProduccion2024` |
| Identificador mostrado en los contadores | `LineaEquipoIQF` |
| Medida | `PesoLibras`, agregada con `SUM` por línea |
| Filtros de los contadores actuales | `fkTipo < 4`, línea no nula y día actual |
| Turno | Campo `Turno`; añadir filtro solo cuando la solicitud lo requiera |
| Endpoint para hoy | `GET /api/dashboard/iqf-tiempo-real`; respuesta: `dia`, `actualizado`, `lineas`, con `linea` y `libras` por línea |
| Ubicación en pantalla para hoy | IQF → contadores en vivo por línea |
| Endpoint equivalente para un día histórico | **No existe uno dedicado que reproduzca los contadores para una fecha arbitraria.** El endpoint en vivo fija hoy con `GETDATE()` e ignora Desde/Hasta |
| Cómo obtener el día histórico completo | Consultar la vista con el rango del día, siguiendo el SQL de abajo. Requiere acceso SQL; no es una ruta API implementada |

**SQL de referencia para reproducir el volumen de los contadores en un día elegido:**

```sql
USE PlantaEmpacadora;
DECLARE @Dia date = '2026-08-15'; -- Sustituir por el día solicitado.

SELECT
    a.LineaEquipoIQF AS linea,
    SUM(a.PesoLibras) AS libras
FROM dbo.AV_Produccion_Diaria_2020 AS a
WHERE a.DiaProduccion2024 >= @Dia
  AND a.DiaProduccion2024 < DATEADD(day, 1, @Dia)
  AND a.fkTipo < 4
  AND a.LineaEquipoIQF IS NOT NULL
GROUP BY a.LineaEquipoIQF
ORDER BY a.LineaEquipoIQF;
```

Para una línea específica, agregar `AND a.LineaEquipoIQF = @Linea` con un parámetro del tipo correspondiente al campo. Para un rango, usar `>= @FechaInicial` y `< DATEADD(day, 1, @FechaFinal)`; agregar el día a SELECT y GROUP BY si se solicita desglose diario. Para turno, filtrar el campo `Turno` según sus valores almacenados; la API normaliza A/B, por lo que no debe suponerse que SQL almacena esas letras sin prefijo.

**Diferencia con el reporte de rendimiento:** `GET /api/dashboard/iqf-libras-hora-dia?fechaInicial=2026-08-15&fechaFinal=2026-08-15` devuelve por `periodo` y `linea` los campos `libras`, `horas`, `grupos` y `librasPorHora`. Sus libras solo incluyen grupos que superan 15 minutos entre primer y último registro. Además, construye líneas con `CategoriaLinea` y `EquiposIQF.NombreIQF` mediante dos ramas `UNION ALL`. Por ello, ese campo `libras` no debe presentarse como el volumen completo equivalente a los contadores ni sumarse entre ramas como si fueran equipos independientes. El indicador de rendimiento es el promedio simple de rendimientos de los grupos válidos.

### Caso verificado en SQL: «Horas trabajadas por IQF entre dos fechas»

**Ubicación en pantalla:** IQF → lista desplegable del reporte diario o mensual. La lista diaria ofrece **Rendimientos IQF x Hora — Diario** y **Horas Trabajadas por IQF — Diario**; la mensual ofrece **Rendimientos IQF x Hora — Mensual** y **Horas Trabajadas por IQF — Mensual**. Cada lista es independiente y muestra los datos de la opción seleccionada. La lista se ajusta al ancho del texto seleccionado; si falta espacio, el texto se distribuye en varias líneas y los botones pasan a la siguiente fila. Los encabezados de equipos en la tabla se muestran como IQF 1, IQF 2, IQF 3, con el nombre completo al pasar el cursor. Ambos indicadores comparten las mismas vistas: Tabla y Gráfica en Diario; Tabla, Gráfica y Tendencia en Mensual. Cambiar el indicador conserva la vista seleccionada. Las gráficas de Horas utilizan los mismos períodos y equipos de la tabla y muestran horas decimales; los promedios se consultan en la vista Tabla.

**Ayuda dentro del módulo:** abrir **Detalles** para ver cómo elegir el indicador, las vistas disponibles, períodos, unidades y promedios. Abrir **Detalles de desarrollador** para ver fuentes SQL, agrupaciones, fórmulas, contratos de API, caché y archivos que implementan ambos reportes. Estos textos corresponden a las listas desplegables actuales, no al antiguo botón de horas.

**Diario:** utiliza Desde/Hasta y Turno del reporte. **Mensual:** utiliza la misma ventana de últimos 12 meses que el rendimiento mensual (hasta hoy), independiente de Desde/Hasta; sí respeta Turno. Promedia las horas diarias por equipo y mes sobre los días con registros válidos; no calcula un intervalo entre primera y última lectura de todo el mes.

Fechas o meses en filas, equipos en columnas y una columna **Promedio** (por día o mes) = suma de horas de equipos con registro en esa fila ÷ cantidad de equipos con registro. No muestra una fila de total del período. Incluye la fila **Promedio diario** o **Promedio mensual** por equipo y promedio general al final = suma de horas de todas las celdas válidas ÷ cantidad de celdas equipo/período válidas. El pie de la columna Promedio muestra la media de los promedios de las filas. Las celdas sin registro se muestran como — y se excluyen de los promedios. No se redondea antes de agregar; se muestran dos decimales.

**API mensual:** `GET /api/dashboard/iqf-horas-trabajadas-mes`; admite `meses` de 1 a 36, predeterminado 12, y turno opcional. Misma estructura de respuesta que Diario, con `periodo` en formato `YYYY-MM`. El mes actual puede estar incompleto.

**Respuesta de la API:** lista de `{ periodo: "YYYY-MM-DD", linea: "nombre del IQF", horas: número }`, una celda por equipo/día después de sumar turnos seleccionados. Validación de fechas, permiso IQF y caché de reporte de cinco minutos; `refresh=true` renueva la caché.


**Verificación directa en PlantaEmpacadora:** para `2026-01-01` a `2026-01-15`, se reprodujeron todos los valores diarios de la imagen de referencia y los totales de IQF 1 = **157.18 h**, IQF 2 = **151.47 h**, IQF 3 = **186.17 h**. Esta comprobación sí consultó la base en vivo.

| Elemento | Fuente exacta |
| --- | --- |
| Procedimiento que contiene el cálculo | `PlantaEmpacadora.dbo.a_Fill_Produccion_Diaria_lectura_dos`, parámetro `@Resumen = 30` |
| Vista consultada por ese modo | `dbo.AV_Produccion_Diaria_2020` |
| Registro original de fecha/hora | `dbo.Seriales.Created`, expuesto en la vista como `FechaHoraTorre` |
| Día lógico | `DiaProduccion2024 = CAST(DATEADD(MINUTE, -359, dbo.Seriales.Created) AS DATE)`; conservar esta regla SQL exacta para asignar registros nocturnos |
| Turno calculado por la vista | A si la hora de `Seriales.Created` está entre `07:00:00` y `18:59:59`; B en los demás casos |
| Equipo / columna del reporte | `CategoriaLinea`, desde `AV_LineasProduccion.CategoriaLinea`; unión por `OrdenesProduccion.fkLineaProduccion = AV_LineasProduccion.IdLineaProduccion` |
| Agrupación inicial | `CategoriaLinea`, `Turno`, `DiaProduccion2024` |
| Horas por grupo | `DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) / 60.0`, campo `TiempoHorasDecimales` |
| Filtros | `DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final`, `fkTipo < 4`, `CategoriaLinea LIKE '%IQF%'`; conservar solo grupos con más de 15 minutos |
| Celda diaria / total | Sumar horas de turnos por día y equipo; total del rango = suma de horas sin redondear, formateada a dos decimales al final |
| Endpoint del dashboard | `GET /api/dashboard/iqf-horas-trabajadas?fechaInicial=INICIO&fechaFinal=FIN` (turno opcional). Implementado con el SELECT equivalente del modo 30. No usar las `horas` del endpoint de rendimiento como equivalentes: ese reporte agrupa adicionalmente por estilo/cliente |

**Son horas estimadas entre lecturas:** el cálculo incluye los intervalos sin lecturas entre el primer y último registro del turno; no descuenta pausas, averías o descansos. Horas decimales no son HH:MM: `7.60 h` corresponde a 7 horas y 36 minutos.

Ejemplo verificado: el 2 de enero, IQF 3 registra 6.8166667 h en turno A y 7.2833333 h en turno B; la suma es **14.10 h**, como en la imagen. No hay grupos válidos el 1 ni el 4 de enero; IQF 1 tampoco tiene grupo válido el día 2. Una celda vacía significa ausencia de grupo válido, no una duración cero medida.

**Estado del procedimiento al verificar:** ejecutar el SP completo falló con `Invalid column name 'ClaseClienteTexto'` en otras ramas. La reproducción se hizo ejecutando directamente el SELECT del modo 30, sin modificar la base. La definición confirma el origen del cálculo; no se inspeccionó la conexión del archivo original de la imagen.

SQL ejecutable que reproduce las celdas y los totales:

```sql
USE PlantaEmpacadora;
DECLARE @Fecha_Inicial date = '2026-01-01';
DECLARE @Fecha_Final date = '2026-01-15';

WITH HorasPorTurno AS (
    SELECT CategoriaLinea, Turno, DiaProduccion2024,
           DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) / 60.0 AS Horas
    FROM dbo.AV_Produccion_Diaria_2020
    WHERE DiaProduccion2024 BETWEEN @Fecha_Inicial AND @Fecha_Final
      AND fkTipo < 4
      AND CategoriaLinea LIKE '%IQF%'
    GROUP BY CategoriaLinea, Turno, DiaProduccion2024
    HAVING DATEDIFF(MINUTE, MIN(FechaHoraTorre), MAX(FechaHoraTorre)) > 15
)
SELECT DiaProduccion2024 AS Fecha, CategoriaLinea AS IQF,
       CAST(SUM(Horas) AS decimal(12, 2)) AS HorasTrabajadas,
       GROUPING(DiaProduccion2024) AS EsTotal
FROM HorasPorTurno
GROUP BY GROUPING SETS (
    (DiaProduccion2024, CategoriaLinea),
    (CategoriaLinea)
)
ORDER BY EsTotal, Fecha, IQF;
```

El SQL de referencia incluye `EsTotal = 1` únicamente para demostrar que los valores reproducen los totales de la imagen usada en la verificación. La pantalla actual no muestra esa fila de total: presenta fecha o mes en filas, IQF en columnas, una columna Promedio y una fila Promedio diario/mensual. Si se requiere un turno en SQL, filtrar `Turno` dentro de `HorasPorTurno` antes de agregar.

### Caso: «Quiero las libras congeladas netas por proceso del día X»

- **Fuente:** `PlantaEmpacadora.dbo.AV_Produccion_Diaria_Resumen`.
- **Campos:** `DiaProduccion2024` (fecha), `NombreTipoProceso` (dimensión), `PesoLibras` (medida), `Turno` (filtro opcional).
- **Condiciones:** `VaEjecutivo = 1`, `ProcesadaPlanta = 1`, `fkTipo NOT IN (2, 4)` y fecha solicitada.
- **Cálculo:** `SUM(PesoLibras)` por proceso después de aplicar turno cuando corresponda.
- **API:** `GET /api/dashboard/libras-netas-proceso?fechaInicial=2026-08-15&fechaFinal=2026-08-15`; añadir `&turno=B` si se pide turno B. Devuelve `proceso`, `libras`, `porcentaje`.
- **Pantalla:** IQF → Libras Congeladas Netas por Tipo de Proceso → modo Total, con Desde y Hasta iguales al día. Esta consulta agrupa por proceso, no por equipo IQF.

### Mapa técnico de las demás solicitudes por rango

Las fuentes de unión y fórmulas ampliadas están incluidas en las secciones de cada módulo de este mismo documento. En las rutas siguientes sustituir INICIO y FIN por fechas `YYYY-MM-DD`; no son parámetros literales.

| Solicitud | Base y fuente principal | Medida / dimensión | Filtro temporal y API |
| --- | --- | --- | --- |
| Libras peladas por estilo | `STB_data.dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS` y `dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET` | `SUM(LIBRAS)` no anuladas; estilo resuelto con `PES_ESTILOS` | Cabecera `FECHA`; `/api/dashboard/pelado-por-estilo?fechaInicial=INICIO&fechaFinal=FIN`; turno opcional |
| Libras peladas por talla | Misma base y detalle de pelado; catálogo `dbo.DCP_TALLAS` | `SUM(LIBRAS)` por talla | Cabecera `FECHA`; `/api/dashboard/pelado-por-talla?fechaInicial=INICIO&fechaFinal=FIN`; turno opcional |
| Personal y pago de pelado | `STB_data.dbo.V_PagosxPeladoIndividualPBI` | Empleados distintos por `IdEmpleado`, `SUM(libras)`, `SUM(Valor)` | `Fecha`; `/api/dashboard/pelado-personal?fechaInicial=INICIO&fechaFinal=FIN`; turno opcional |
| Recepción por remisión/finca/laguna | `STB_data.dbo.RemisionesPlantaPBI` | `LibrasRemision`, `LibrasCola`, `LibrasCabeza`, `LibrasBasura`; agregación descrita en Recepción | `FechaRemision`; `/api/dashboard/recepcion-remisiones?fechaInicial=INICIO&fechaFinal=FIN`; sin turno |
| Descabezado por día | `STB_data.dbo.V_TrazabilidadDescabezadoPBI` y tablas de asignación | Cola, cabeza, total; personas y horas desde asignación | `FECHA_DESCABEZADO` y cabecera `FECHA`; `/api/dashboard/descabezado-por-dia?fechaInicial=INICIO&fechaFinal=FIN`; sin turno |
| Clasificado por talla o máquina | `STB_data.dbo.CL_LLENADO_RECIPIENTES` y `dbo.CL_LLENADO_RECIPIENTES_D` | `SUM(LIBRAS_NETA)` no anuladas; `DCP_TALLAS` o `CL_TANQUES` por `ID_TANQUE` | Cabecera `FECHA`; `/api/dashboard/clasificado-por-talla?fechaInicial=INICIO&fechaFinal=FIN` o `/api/dashboard/clasificado-por-maquina` con las mismas fechas; turno opcional |
| Exportaciones por contenedor/cliente | `Envios` + `Masteres` + `Seriales` + `OrdenesProduccion` + `AV_Items` + `AV_LotesRemision` | Una fila principal por contenedor con libras totales; `detalle` conserva cliente/estilo; contenedor no vacío | `FechaCarga`; `/api/dashboard/exportaciones-contenedores?fechaInicial=INICIO&fechaFinal=FIN`; sin turno |
| Compra por proveedor/talla | `PlantaEmpacadora.dbo.AV_MateriaPrima` | `SUM(PesoLibras)`; proveedor desde `NombrePropietario` o `NombreGrupo`, talla desde `Talla` | `CAST(DiaProduccion2024 AS date)`; `/api/dashboard/compra-mp-por-talla?fechaInicial=INICIO&fechaFinal=FIN`; sin turno |
| Existencias de producto terminado | `PlantaEmpacadora.dbo.Seriales` y uniones de Inventario | `pesoKilos`, `cantidadSerial`; dimensiones y disponibilidad en cada registro | `/api/inventory`, respuesta `items`; sin fechas ni turno. Filtrar registros en el consumidor |

Para límites por categoría o valor numérico, indicar el criterio sobre la respuesta y la granularidad a la que se aplica. Por ejemplo, “días con más de 5,000 libras” exige agrupar primero por día; filtrar filas de estilo antes de sumar responde otra pregunta. No existe un parámetro API global de mínimo/máximo de libras.

## Guía de uso: cómo encontrar el dato solicitado

1. Identificar la operación: recibir de finca, comprar materia prima, descabezar, clasificar, pelar, congelar, exportar o consultar existencias.
2. Abrir el módulo correspondiente desde el menú. Si no aparece, revisar el permiso del usuario con un administrador.
3. Definir qué se necesita: total, detalle por día, comparación mensual o existencias actuales; indicar la unidad (libras, kilos, personas, contenedores o pago).
4. Desplegar la barra **Filtros** con la flecha **Mostrar filtros**, completar **Desde** y **Hasta** y seleccionar **Turno** cuando esté disponible. Los reportes se actualizan automáticamente; no hay botón Aplicar.
5. Leer el bloque apropiado en la siguiente tabla. Confirmar su período antes de comunicar el resultado.

### Ubicación en pantalla y efecto de los filtros

| Módulo | Dato solicitado / bloque donde se encuentra | Desde/Hasta | Turno | Período o acción adicional |
| --- | --- | --- | --- | --- |
| IQF | **Libras Congeladas Netas por Tipo de Proceso**, modo Total | Sí | Sí | Total del rango, separado por proceso |
| IQF | Mismo bloque, modo Día | Sí | Sí | Desglose diario del rango |
| IQF | Mismo bloque, modo Mensual | No | Sí | Últimos 12 meses |
| IQF | **Rendimientos IQF x Hora — Diario** | Sí | Sí | Columna de cada línea; unidad lbs/h |
| IQF | **Rendimientos IQF x Hora — Mensual** | No | Sí | Últimos 12 meses; cada IQF y línea de promedio general por mes |
| IQF | **Horas Trabajadas por IQF — Diario**, lista del reporte diario | Sí | Sí | Horas por equipo/día y promedios |
| IQF | **Horas Trabajadas por IQF — Mensual**, lista del reporte mensual | No | Sí | Últimos 12 meses, promedio de horas trabajadas por día válido de cada mes |
| IQF | Contadores en vivo por línea | No | No | Día actual; actividad reciente |
| Pelado | **Libras Peladas por Estilo** y botón **Ver por talla** | Sí | Sí | Estilos visibles; el botón abre bajo demanda una tabla Talla/Libras/Total con el mismo rango y turno |
| Pelado | **Libras Peladas Hoy por Estilo** y tabla por sala | No | No | Día actual; cards por estilo, total y libras por hora promedio; personal y pago por sala en la tabla |
| Recepción | **Remisiones Recibidas — Detalle** | Sí | No | Una fila por remisión, finca y laguna |
| Recepción | **Recepción de Camarón — Hoy**, contadores | No | No | Libras recibidas HOSO hoy, semana y mes; pendientes = saldo global |
| Descabezado | **Libras Descabezadas — Diario** | Sí | No | Libras, personas y rendimiento por fecha |
| Descabezado | **Libras Descabezadas — Mensual** | No | No | Últimos 12 meses; personas únicas por mes |
| Descabezado | **Descabezado — Hoy**, contadores | No | No | Hoy, semana y mes actuales; personas y libras promedio por hora de hoy |
| Clasificado | **Libras Clasificadas por Máquina** y botón **Ver por talla**; **Clasificado por Talla — Diario** | Sí | Sí | Máquina y detalle emergente por talla usan el rango y turno; desglose diario en la tabla |
| Clasificado | **Clasificado por Talla — Mensual** | No | Sí | Últimos 12 meses |
| Clasificado | **Clasificado — Libras**, contadores | No | No | Hoy, semana y mes actuales; libras clasificadas por hora de hoy |
| Clasificado | **Inventario de Clasificado Disponible** y su detalle | No | No | Existencias actuales por talla; detalle de origen y destino |
| Exportaciones | **Libras Exportadas por Estilo** y **Contenedores Exportados** | Sí | No | Una fila por contenedor con sus libras totales; Ver detalle abre cliente y estilo |
| Exportaciones | **Exportaciones — Semana en curso** | No | No | Lunes a domingo de la semana actual |
| Exportaciones | **Contenedores Exportados por Cliente — Mensual** | No | No | Últimos 6 meses |
| Compra de Materia Prima | **Materia Prima por Proveedor — WSO y Entero** | Sí | No | Una tarjeta por proveedor: WSO y equivalente Entero lado a lado, porcentaje compartido |
| Compra de Materia Prima | **Ver Detalle** → **Detalle de Materia Prima por Talla** | Sí | No | Cruce proveedor × talla |
| Compra de Materia Prima | **Materia Prima por Proveedor/Talla — Mensual**, selector Proveedor/Talla | No | No | Últimos 3 meses con datos; selección local de proveedores |
| Compra de Materia Prima | **Materia Prima HOSO — Día, semana y mes**, contadores | No | No | Libras HOSO = valor de API ÷ 0.65; se anclan a la última fecha registrada, limitada a hoy |
| Inventario | Tabla pivote, columnas **Peso kilos** y **Cantidad serial** | No | No | Existencias actuales; filtros propios por valores de columnas |

**Disponibilidad en API y en pantalla:** Pelado tiene endpoints diarios, mensuales y de personal, pero la página actual solo monta los bloques de hoy, estilo, talla y sala. No indicar al usuario que existe un selector diario/mensual o una tarjeta histórica de personal en esa página. Esos datos se consultan por API. Compra de Materia Prima también tiene un endpoint por item que no está montado como bloque en la página actual.

### Fechas, turno y presentación: reglas precisas

- **Desde/Hasta:** se envían como `fechaInicial` y `fechaFinal`, en formato `YYYY-MM-DD`. Las consultas de rango usan ambos límites mediante `BETWEEN`; la fecha corresponde al evento de cada módulo, descrito más abajo. Para un solo día, usar la misma fecha en ambos campos.
- **Rango válido:** ambas fechas deben existir y Desde no puede ser posterior a Hasta. Con fechas inválidas se muestra un error y no se ejecuta el reporte filtrado.
- **Valor inicial y Limpiar:** Desde vuelve a hoy menos 30 días, Hasta a hoy y Turno a Todos. Con ambos extremos incluidos puede abarcar 31 fechas; Limpiar no consulta toda la historia.
- **Turno:** Todos, Turno A o Turno B. Solo los reportes históricos de IQF, Pelado y Clasificado lo utilizan. Los contadores y los inventarios no cambian por turno. Todos conserva también registros sin turno cuando la fuente los contiene.
- **Filtros compartidos:** las fechas y el turno se conservan al cambiar de módulo durante la sesión. Ocultar el turno en una página no borra la selección; al regresar a IQF, Pelado o Clasificado puede seguir activo.
- **Mensual:** los reportes habituales empiezan el primer día del mes más antiguo y terminan hoy; el mes actual puede estar incompleto. Cambiar Desde/Hasta no mueve esa ventana. Compra de Materia Prima tiene una excepción: busca en los últimos cuatro meses calendario y conserva hasta tres meses con datos, que pueden no ser consecutivos. Si hay menos meses con registros en esa ventana, muestra menos de tres; no busca toda la historia.
- **Ver valores:** muestra u oculta números en las gráficas; no cambia las cifras, los filtros ni el período consultado. Cambiar entre tabla y gráfica tampoco cambia la fuente del dato.
- **Filtros por categoría:** no existe un filtro global por cliente, finca, talla, proveedor, línea, estilo, libras mínimas/máximas o rendimiento mínimo/máximo. Usar el desglose disponible y, cuando haga falta, filtrar la respuesta de la API. No inventar parámetros para esos criterios.

### Ejemplos de solicitudes y cómo resolverlas

Las fechas son ejemplos reproducibles; sustituirlas por las solicitadas.

| Solicitud | Procedimiento | Qué comunicar / cuidado |
| --- | --- | --- |
| “Muéstrame lo congelado del 1 al 15 de agosto, turno B” | IQF → Desde `2026-08-01`, Hasta `2026-08-15`, Turno B → netas modo Total | Libras por proceso y total del rango; modo Día si se pide evolución |
| “Rendimiento de una línea IQF en agosto” | IQF → `2026-08-01` a `2026-08-31` → rendimiento Diario → columna de la línea | Promedio de lbs/h según la fórmula IQF; no sumar rendimientos diarios |
| “Cuánto se peló de talla 31/35 entre dos fechas” | Pelado → fijar fechas y turno → Detalle por Talla → ubicar 31/35 | Total de esa talla; para desglose diario usar `/pelado-por-talla-dia` por API |
| “Cuánto recibió una finca en agosto y qué rendimiento tuvo” | Recepción → fijar agosto → Remisiones Recibidas — Detalle → seleccionar sus filas en la respuesta si se requiere consolidar | Separar libras remisión, cola y cabeza; recalcular el rendimiento con totales, no promediar porcentajes sin ponderación |
| “Cuántas personas descabezaron durante agosto” | Consultar `/descabezado-por-dia-mes` y ubicar agosto si está en la ventana | Personas únicas del mes; sumar personas diarias repetiría empleados |
| “Clasificado de talla 41/50 del turno A en una semana” | Clasificado → fijar fechas, Turno A → tarjeta por talla o tabla diaria | Producción del rango; el inventario clasificado es un dato distinto |
| “Qué se exportó a un cliente en agosto” | Exportaciones → fijar agosto → Contenedores Exportados → Ver detalle en cada contenedor | La tabla principal da libras por contenedor; el diálogo permite comprobar cliente y estilo sin duplicar el contenedor en la vista principal |
| “Materia prima de un proveedor por talla en agosto” | Compra → fijar agosto → Ver Detalle → cruce proveedor/talla | Libras WSO registradas; Entero es una conversión, no una segunda recepción |
| “Inventario disponible para un cliente y una talla” | Inventario → agregar Cliente, Talla y Disponibilidad a FILAS → filtrar columnas → DISPONIBLE y valores solicitados | Peso en kilos y cantidad serial actuales; revisar otros filtros activos |
| “Datos con 1,000 a 5,000 libras” | Consultar el endpoint del rango de fechas; conservar filas cuyo valor `libras` esté entre esos límites | Es un filtro numérico adicional sobre resultados, no los campos Desde/Hasta; aclarar si el límite aplica al día, talla, proceso o total |
| “Comparación mensual de enero a marzo de un año fuera de la ventana actual” | Consultar endpoints diarios del rango exacto y agrupar por mes cuando existan | No usar el reporte mensual fijo como si aceptara el rango. Recepción y Exportaciones ofrecen detalle del rango; personal único requiere una consulta que preserve identidad del empleado |
| “Cuánto inventario había al cierre del 31 de agosto” | El inventario actual no resuelve la solicitud | Se necesita una fuente histórica; filtrar Fecha producción no reconstruye existencias pasadas |

Al entregar un resultado, indicar: **módulo, indicador, unidad, Desde/Hasta o ventana fija, turno, categoría seleccionada y fecha de actualización**. Distinguir un cero reportado, una respuesta sin filas y un error de carga; no interpretar un error como producción cero.

### Inventario: filtros propios, unidades y totales

En **CAMPOS**, arrastrar las dimensiones requeridas a **FILAS**. El orden determina la agrupación. Abrir el icono **Filtrar** del encabezado y marcar valores; escribir en Buscar valores solo ayuda a encontrarlos, la selección es la que filtra. Varios valores de una columna se aceptan como alternativas; los filtros de columnas distintas se deben cumplir simultáneamente. **Limpiar** dentro de ese filtro quita únicamente la restricción de esa columna.

Dimensiones disponibles: Nombre cliente, Nombre cliente principal, N.º orden compra, Código externo, Fecha producción, Código item, Estilo final, Nombre item, Marca, Talla, Empaque, Tipo item y Disponibilidad. Fecha producción filtra valores concretos de fecha, no un intervalo Desde/Hasta. No hay filtro numérico en Peso kilos o Cantidad serial.

La vista conserva las preferencias en la cuenta del usuario mediante `dbo.dashboard_inventario_preferencias`, por lo que se recuperan también en otros navegadores o dispositivos. `localStorage` se usa solo como respaldo y para migrar selecciones anteriores. Sin preferencias activas se inicia con los clientes **FRANCIA DP 2026 FRESCO** y **LFF UK 2026 FRESCO**; por ello la vista inicial puede mostrar solo parte de la bodega. Revisar el filtro de cliente antes de afirmar que el Gran total representa todo el inventario. Quitar un campo de FILAS no borra un filtro guardado de ese campo; volver a agregarlo para revisar o limpiar su restricción.

**Gran total** suma los registros que cumplen los filtros; no sumar otra vez las filas de subtotal. **Peso kilos** es kg; para comparar con libras, convertir kg × 2.2046226218 e indicar la conversión. **Cantidad serial** no equivale automáticamente a másteres o contenedores. **Actualizar** vuelve a cargar existencias actuales.

## Consultas por API sin depender de otra documentación

Un endpoint es la ruta que devuelve los datos de un bloque. Todas las rutas abreviadas de las tablas siguientes se completan con `/api/dashboard`; por ejemplo, `/pelado-por-talla` significa `/api/dashboard/pelado-por-talla`. Inventario usa `/api/inventory` y devuelve los registros en `items`. Se requiere acceso autenticado y el permiso del módulo; estas rutas no son públicas.

```http
GET /api/dashboard/libras-netas-proceso?fechaInicial=2026-08-01&fechaFinal=2026-08-15&turno=B
GET /api/dashboard/pelado-por-talla-dia?fechaInicial=2026-08-01&fechaFinal=2026-08-31&turno=A
GET /api/dashboard/exportaciones-contenedores?fechaInicial=2026-08-01&fechaFinal=2026-08-31
GET /api/dashboard/compra-mp-por-talla?fechaInicial=2026-08-01&fechaFinal=2026-08-31
GET /api/inventory
```

Para Todos, omitir `turno`; la API acepta `A`, `B`, `Turno A` o `Turno B`. Omitir fechas en un reporte usa el rango predeterminado de hoy menos 30 días a hoy. Los endpoints mensuales habituales aceptan `meses` de 1 a 36 (predeterminado 12; Exportaciones 6), pero siempre terminan en la fecha actual: `meses` no permite elegir un período histórico arbitrario. Compra de Materia Prima fija sus tres meses con datos en el servicio aunque se envíe `meses`.

Los bloques del dashboard se consultan automáticamente cada cinco minutos; “en vivo” no significa actualización segundo a segundo. La caché del servidor dura 60 segundos para contadores y cinco minutos para reportes. La API admite `refresh=true` para solicitar renovación de su caché principal; la fecha de actualización de la pantalla no garantiza que el último evento de planta ya esté registrado.

Los endpoints de resumen/en vivo y los de inventario clasificado ignoran fechas y turno. Los de reportes mensuales validan las fechas recibidas aunque no las usen para elegir su ventana. No enviar un rango inválido.

### Campo de fecha que delimita cada reporte

| Módulo | Campo de la fuente usado para el período | Interpretación |
| --- | --- | --- |
| IQF | `DiaProduccion2024` | Día de producción; `FechaHoraTorre` mide tiempos y actividad reciente |
| Pelado, libras por estilo/talla | Cabecera `PES_ASIGNACION_LIBRAS_EMPLEADOS.FECHA` | Fecha de asignación de libras |
| Pelado, personal/pago | `V_PagosxPeladoIndividualPBI.Fecha` | Fecha del registro de destajo |
| Recepción, detalle | `RemisionesPlantaPBI.FechaRemision` | Fecha de remisión; la vista limita internamente a fechas posteriores a `2025-01-01` |
| Descabezado | `V_TrazabilidadDescabezadoPBI.FECHA_DESCABEZADO`; cabecera de asignación `FECHA` para personal/horas | Día descabezado y día de asignación, según indicador |
| Clasificado | `CL_LLENADO_RECIPIENTES.FECHA` | Día del llenado/clasificado |
| Exportaciones | `Envios.FechaCarga` | Fecha de carga, no fecha de orden de compra ni producción |
| Compra de Materia Prima | `CAST(AV_MateriaPrima.DiaProduccion2024 AS date)` | Fecha registrada de materia prima |
| Inventario | Sin rango en API | Existencia actual; Fecha producción es una dimensión local |

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
se hace en varios reportes después en TypeScript (`backend/src/services/*.service.ts`).

**Tres tipos de endpoint** (para saber qué tan "vivo" es un dato):

- **En vivo** — sin filtros, "hoy"/"semana actual" con `GETDATE()`, caché 60 s.
- **Reporte** — respeta `fechaInicial`/`fechaFinal`/`turno` del filtro, caché 5 min.
- **Mensual** — ventana fija de N meses que termina hoy (ignora el rango de fechas; respeta turno únicamente en IQF, Pelado y Clasificado), caché 5 min. Compra de Materia Prima usa tres meses con datos.

---

## 1. IQF (producción congelada)

**Qué responde:** cuánto se congeló neto por proceso, y el rendimiento
(libras/hora) de cada línea IQF. Base: `PlantaEmpacadora`.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras congeladas netas por proceso | `dbo.AV_Produccion_Diaria_Resumen` | `SUM(PesoLibras)` agrupado por `NombreTipoProceso`+`Turno`, filtrando `VaEjecutivo=1, ProcesadaPlanta=1, fkTipo NOT IN (2,4)` (excluye RE-EMPAQUE y FRESH TAIL/materia prima) | `GET /libras-netas-proceso` (`-dia`, `-mes`) |
| Rendimiento IQF (libras/hora) por línea | `dbo.AV_Produccion_Diaria_2020` + `dbo.EquiposIQF` (nombre de equipo) | Por grupo línea/estilo/turno/día: `SUM(PesoLibras) / horas trabajadas`; el valor final de cada celda es el **promedio simple** de esos rendimientos por grupo (no libras totales ÷ horas totales); se descartan grupos con ≤15 min de trabajo; línea `SAL` excluida | `GET /iqf-libras-hora-dia` (`-mes`) |
| Horas trabajadas por IQF — Diario y Mensual, con promedios | `dbo.AV_Produccion_Diaria_2020` (SELECT equivalente al SP `a_Fill_Produccion_Diaria_lectura_dos`, modo 30) | Horas entre primera/última lectura por equipo/día/turno, grupos >15 min y `fkTipo < 4`; sumar turnos. Respeta fechas y turno; promedios sobre celdas válidas | `GET /iqf-horas-trabajadas` |
| Contador en vivo por línea IQF (hoy) | `dbo.AV_Produccion_Diaria_2020`, día en curso | `SUM(PesoLibras)` por `LineaEquipoIQF`; "activa" si tuvo caja en los últimos 15 min | `GET /iqf-tiempo-real` |

`fkTipo`: 0=RECEPCIÓN (producción), 1=REPROCESO, 2=RE-EMPAQUE (excluido de netas), 4=REGISTRO FRESCO/FRESH TAIL (excluido, es compra de materia prima).

Los cuatro reportes usan los mismos nombres normalizados: **IQF # 1 (Espiral)**, **IQF # 2 (Lineal)** e **IQF # 3 (Lineal)**. Esto aplica a Rendimientos y Horas Trabajadas, tanto Diario como Mensual, aunque la fuente entregue variantes como `IQF 1`.

Las vistas de Rendimiento y Horas tienen el mismo alto para conservar la simetría al cambiar la lista desplegable. En la gráfica de **Rendimientos IQF x Hora — Mensual**, el eje muestra el mes abreviado (`ene`, `feb`, etc.) y el año debajo. Las columnas representan el promedio de libras por hora de cada IQF en cada mes y la línea **Promedio general** representa `SUM(librasPorHora × grupos) ÷ SUM(grupos)` de los IQF válidos del mes. La vista de Horas Trabajadas conserva sus promedios propios y no mezcla esta serie de rendimiento.

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
| Libras por hora promedio de hoy | mismo detalle; hora del registro en `PES_ASIGNACION_LIBRAS_EMPLEADOS_DET.HORA` | total de libras peladas hoy ÷ horas desde el primer registro válido de hoy hasta la hora actual; devuelve 0 si todavía no existe un intervalo válido | `GET /pelado-libras-hoy`, campo `librasPorHoraPromedio` |
| Actividad y pago por sala (hoy) | mismo detalle, resuelto vía `DCP_LINEAS.ID_SALA`→`PES_SALAS` | `SUM(LIBRAS)`, `SUM(VALOR)`, `COUNT(DISTINCT empleado)` por sala; libras/hora = libras hoy ÷ horas desde el primer registro del día; horas trabajadas = intervalo entre primer y último destajo por sala | `GET /pelado-por-sala` |
| "Órdenes activas" (proxy de actividad, no hay conteo real de personal en planta) | `dbo.AV_Produccion_Diaria_2020` (**PlantaEmpacadora**), `FechaHoraTorre` | Órdenes con lectura en los últimos 15 min y proceso `IQF PEELED / IQF COOK PEELED / PD BLOCK / FRESH PEELED` | `GET /pelado-tiempo-real` |

En la pantalla, **Detalle de Libras Peladas por Talla** no se muestra como una sección permanente. Se abre como tabla al pulsar **Ver por talla** en la esquina superior derecha de **Libras Peladas por Estilo**. La tabla contiene **Talla**, **Libras peladas** y una fila **Total**, y utiliza el rango de fechas y turno seleccionados.

---

## 3. Recepción de camarón

**Qué responde:** camarón recibido de finca y saldo pendiente de pasar
a proceso. Base: `STB_data`. Sin filtro de turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras recibidas HOSO hoy / semana / mes | `dbo.R_REMISIONES_PLANTA` + `dbo.R_REMISIONES_PLANTA_DETALLE` | `SUM(LIBRAS)` de bins no anulados/rechazados (`ANULADA=0 AND RECHAZADA=0`) | `GET /recepcion-resumen` |
| Libras pendientes de procesar (saldo global, sin fecha) | mismas tablas | `SUM(LIBRAS)` donde `CERRADA=0 AND PROCESADO=0` | `GET /recepcion-resumen` |
| Detalle por remisión/finca/laguna: libras remisión, cola, cabeza, basura, rendimientos | vista `dbo.RemisionesPlantaPBI` (misma que Power BI) | `LibrasRemision` se suma; `LibrasCola/Cabeza/Basura` con `MAX` (son constantes por remisión-laguna); rendimiento finca = cola÷remisión; rendimiento planta = cola÷(cola+cabeza) | `GET /recepcion-remisiones` |

Nota: `R_PesadoRecepcion.LibrasNetas` dejó de poblarse en 2026-03; por eso los totales salen del detalle de bins, no de esa tabla.

---

## 4. Descabezado

**Qué responde:** volumen descabezado, dotación de personal y
rendimiento por hora. Base: `STB_data`. Sin filtro de turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras descabezadas hoy/semana/mes + personas hoy | `dbo.DES_ASIG_LBRS_EMPLEADOS` + `dbo.DES_ASIG_LBRS_EMPLEADOS_DET`; personas vía `dbo.DES_EMPLEADOS_LINEAS` | `SUM(LIBRAS)` no anulado; personas = `COUNT(DISTINCT ID_EMPLEADO)` | `GET /descabezado-resumen` |
| Libras promedio por hora de hoy | tablas de asignación de descabezado para cabezas y horas | `SUM(libras de cabezas no anuladas)` ÷ horas entre el primer y último registro del día | `GET /descabezado-resumen`, campo `librasPromedioPorHora` |
| Cola, cabezas, total, libras/hora por día o mes | `dbo.Des_PesadoColaHeader` + `Des_PesadoCola` y `DES_ASIG_LBRS_EMPLEADOS[_DET]` | cola = libras netas; cabezas = libras asignadas no anuladas; total = cola + cabezas; libras/hora = cabezas ÷ horas efectivas | `GET /descabezado-por-dia` y `/descabezado-por-dia-mes` |

---

## 5. Clasificado

**Qué responde:** producto clasificado por talla y mesa, e inventario
clasificado disponible. Base: `STB_data`. Sí respeta turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras clasificadas hoy/semana/mes | `dbo.CL_LLENADO_RECIPIENTES` + `dbo.CL_LLENADO_RECIPIENTES_D` | `SUM(LIBRAS_NETA)` no anulado | `GET /clasificado-resumen` |
| Libras clasificadas por hora de hoy | mismas tablas; horarios en `CL_LLENADO_RECIPIENTES_D.HORA_INICIO/HORA_FINAL` | libras netas no anuladas de hoy ÷ horas entre el inicio más temprano y el final más tardío; devuelve 0 sin intervalo válido | `GET /clasificado-resumen`, campo `librasClasificadasPorHora` |
| Inventario clasificado disponible (bins, libras, finca, talla) | `dbo.CL_InventarioClasificado` | `EnInventario=1 AND Transferido=0 AND Procesado=0`; `bins=COUNT(*)`, `libras=SUM(LibrasNetas)` por talla (`DCP_TALLAS`) | `GET /clasificado-inventario` |
| Detalle cruzado de inventario (finca/laguna/remisión/lote/talla/destino) | `dbo.CL_InventarioClasificado` + `CL_LLENADO_RECIPIENTES[_D]` + `CL_TipoProducto` | mismo filtro que arriba, desglosado | `GET /clasificado-inventario-detalle` |
| Libras por máquina / por talla | `dbo.CL_LLENADO_RECIPIENTES` + `dbo.CL_LLENADO_RECIPIENTES_D` + `dbo.CL_TANQUES` + `DCP_TALLAS` | `SUM(LIBRAS_NETA)` agrupado; turno filtrado en código | `GET /clasificado-por-maquina` / `-por-talla` (`-dia`, `-mes`) |

Nota: "máquina" se obtiene de `CL_LLENADO_RECIPIENTES.ID_TANQUE`. Los registros sin ID válido, incluido 0, aparecen como “Sin máquina asignada” y se incluyen en el total.

En la pantalla, **Libras Clasificadas por Talla** permanece oculto hasta pulsar **Ver por talla** en la esquina superior derecha de **Libras Clasificadas por Máquina**. El diálogo usa el mismo rango de fechas y turno seleccionados.

El orden de columnas por talla de las tablas diaria y mensual se guarda en `dashboard_configuracion_compartida` de la base de autenticación. Todos los usuarios ven el mismo orden; solo administradores o usuarios con el permiso `ordenar_tallas_clasificado` pueden cambiarlo arrastrando encabezados dentro de cualquiera de las dos tablas.

---

## 6. Exportaciones

**Qué responde:** producto despachado por contenedor, cliente y estilo,
y el resumen semanal por destino. Base: `PlantaEmpacadora`. Sin turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras exportadas esta semana por destino (Francia/UK/AC Holding/Terceros) | tablas base `Envios`→`Masteres`→`Seriales`→`OrdenesProduccion`, más `AV_Items` y `AV_LotesRemision` | `SUM(AV_Items.PesoLibras)` con contenedor no vacío; destino por `NombreGrupo LIKE '%FRANCIA%' / '%LFF%' o '%UK%' / '%AC HOLDING%'`; Terceros = el resto | `GET /exportaciones-resumen` |
| Libras exportadas por estilo (rango) | mismas tablas base | `SUM(AV_Items.PesoLibras)` agrupado por `EstiloFinal` | `GET /exportaciones-por-estilo` |
| Contenedores exportados y detalle | `Envios`, `Masteres`, `Seriales`, `OrdenesProduccion`, `AV_Items`, `AV_LotesRemision` | principal: una fila por contenedor con libras totales; botón Ver detalle: cliente + estilo + másteres + anillos/máster + libras | `GET /exportaciones-contenedores`; cada fila contiene `detalle[]` |
| Contenedores por cliente y mes (últimos 6 meses) | tablas base de exportación | `COUNT(DISTINCT NumeroContenedor)` agregado directamente en SQL por mes/cliente | `GET /exportaciones-por-cliente-mes` |

**"Libras que faltan por exportar":** hoy **no existe** un endpoint
dedicado para esto — hubo una tabla "Órdenes Pendientes de Exportación"
(basada en la vista `dbo.AV_OrdenesCompraClientes`, columnas
`AnillosXMaster`/`KGFaltantes`) que se eliminó por completo del
dashboard. Lo más cercano disponible hoy es el módulo **Inventario**
(sección 8): `GET /api/inventory` filtrado en la respuesta o tabla por `disponibilidad =
DISPONIBLE` muestra el producto terminado que ya está listo en bodega y
todavía no se ha despachado (no tiene `FkEnvio`). Este saldo no equivale a compromisos pendientes de exportación: no determina pedidos faltantes, reservas, fechas de embarque ni destino confirmado.

---

## 7. Compra de materia prima

**Qué responde:** materia prima WSO recibida y su equivalente entero, con desglose por proveedor, mes y talla. Base: `PlantaEmpacadora`. Sin turno.

| Dato | Vista/Tabla SQL | Cómo se calcula | Endpoint |
| --- | --- | --- | --- |
| Libras HOSO hoy/semana/mes + promedio HOSO semanal | vista `dbo.AV_MateriaPrima` (única fuente) | `SUM(PesoLibras) ÷ 0.65` en la presentación; "hoy efectivo" = última fecha con filas, limitada a hoy; semana y mes se anclan a esa fecha. Promedio HOSO semanal = (libras base del mes ÷ número de semanas transcurridas) ÷ 0.65; las semanas se cuentan de lunes a domingo e incluyen semanas parciales | `GET /compra-mp-resumen` |
| Libras WSO por proveedor (rango) | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)`; proveedor = `NombrePropietario` o, si vacío, `NombreGrupo` | `GET /compra-mp-por-proveedor` |
| Equivalente entero por proveedor | Derivado de las libras WSO anteriores | `libras WSO ÷ 0.65`; conversión solo de presentación | `GET /compra-mp-por-proveedor`, transformado en frontend |
| Por tipo/proveedor/item | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)`, `SUM(CantidadSerial)` agrupado por `TipoMateria`, proveedor, `Item` | `GET /compra-mp-por-item` |
| Matriz proveedor × talla | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)` por proveedor y campo `Talla` (ej. "51/60") | `GET /compra-mp-por-talla` |
| Por mes/talla/proveedor (últimos 3 meses **con datos**) | `dbo.AV_MateriaPrima` | `SUM(PesoLibras)` agregado por mes+talla+proveedor | `GET /compra-mp-materia-prima` |

### Presentación actual del módulo

- Los contadores **Hoy, Semana, Mes y Promedio por semana** se muestran en libras **HOSO**. El endpoint devuelve valores base de `AV_MateriaPrima.PesoLibras` y el frontend divide cada uno entre `0.65` antes de mostrarlo. Las fechas y ventanas del resumen no cambian.
- **Materia Prima por Proveedor — WSO y Entero** es una sola sección y una sola fila de tarjetas. Cada proveedor ocupa una tarjeta con dos columnas: WSO registrado y Entero equivalente (`WSO ÷ 0.65`). Comparte un porcentaje del total y un color exclusivo por proveedor; la tarjeta TOTAL sigue el mismo formato. El botón Ver detalle permanece en el encabezado.
- En **Materia Prima por Proveedor/Talla — Mensual**, el selector visible dice **Proveedor / Talla**. “Talla” corresponde al campo técnico `Talla`, históricamente llamado gramaje en partes internas del código y datos.
- Sus vistas son **Tabla**, **Gráfica comparativa** y **Embudo**. El embudo reemplaza la antigua gráfica de tendencia lineal: suma los tres meses visibles por proveedor o talla y ordena el total de mayor a menor. Es una comparación de volumen acumulado, no un flujo de conversión entre etapas.
- El selector de proveedores afecta las tres vistas. El mismo proveedor conserva un color estable en la tarjeta combinada, gráfica comparativa y embudo mediante una asignación basada en su nombre. Los proveedores operativos conocidos tienen colores explícitos distintos; los nuevos reciben un color HSL derivado de su nombre. El color no cambia al variar el orden por libras.

Nota: NO se usa la tabla `dbo.MateriaPrima` (es de otro dominio: liquidación de exportación WSO/embarque, y no tiene la talla de recepción).

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
| ¿Qué se exportó y a quién? | Exportaciones | `Envios`, `Masteres`, `Seriales`, `OrdenesProduccion`, `AV_Items`, `AV_LotesRemision` | PlantaEmpacadora |
| ¿Cuánta materia prima (camarón entero) entró? | Compra de Materia Prima | vista `AV_MateriaPrima` | PlantaEmpacadora |
| ¿Qué producto terminado hay listo sin despachar? | Inventario | `Seriales`, `OrdenesProduccion`, `AV_Items`, `Masteres` | PlantaEmpacadora |

---
