# Personal: biométrico y recorrido de chequeos

El padrón incluye personal temporal (TIPO_CONTRATO=T) de planilla OBRA, con fecha
de ingreso/retiro. Cada empleado cuenta una vez por fecha y conserva todas sus fuentes.

| Indicador | Fuente y regla |
| --- | --- |
| Con marca biométrica | CHECKINOUT y USERINFO del servidor vinculado configurado; cualquier marca del día calendario. BADGENUMBER se enlaza con RH_EMPLEADOS.ID_EMPLEADO, no USERID. |
| Con entrada biométrica | Al menos una marca CHECKTYPE=I. |
| Marca sin entrada | Tiene marcas pero ninguna I **y no tiene chequeo ni pesa en STB** ese día; se muestra para revisión por posible salida del turno nocturno anterior. Si STB confirma presencia, la marca se considera mal tipificada y no entra aquí. |
| Con marca, sin pesado positivo | Tiene marca y no existe PAGO>0 en V_PL_PAGOS_COLECTORES de esa fecha. No se consultan importes para mostrar ni para confirmar presencia. |
| Con chequeo de actividad | Al menos un detalle de DCP_PagoGrupalAsistencias iniciado, con HoraDesde. Es independiente del biométrico y del pago. |

El indicador Asistieron y sus desgloses cuentan exclusivamente entrada biométrica I.
Pesa y chequeo se conservan como evidencia operativa de presencia y recorrido,
pero no se suman a la asistencia confirmada. Los conflictos
con novedades se conservan para revisión; los contadores biométricos siguen reflejando
las marcas independientemente del estado final. Los pagos no prueban presencia.
Sin evidencia queda pendiente en cualquier fecha; solo las faltas explícitas de Payroll
cuentan como faltas. No se deducen faltas por no haber llegado todavía al turno nocturno.

## Obra y Auxiliares (según STB)

Las tarjetas por tipo de personal salen de STB, no del puesto de Payroll ni del biométrico:

- **Auxiliares**: chequeados del día (DCP_PagoGrupalAsistencias) en cualquier proceso excepto
  Decoración Anillos y Reempaque. Incluye Pelado, Clasificado, Descabezado, IQF, Empaque/Bodega,
  Langosta, Calidad, Mantenimiento, Recepción, etc.
- **Obra**: personas con pesa del día o chequeadas solo en Decoración Anillos / Reempaque.
- **Supervisores**: por puesto de Payroll.
- Sin chequeo ni pesa, el puesto de Payroll se usa solo para ubicar a la persona en el total;
  la antigua categoría Máquinas (Clasificado + IQF) quedó dentro de Auxiliares.

"Asistieron" en estas tarjetas = chequeo o pesa del día. El 26/11/2026 dio 258 auxiliares y
640 de obra; 258 + 61 de Decoración/Reempaque = 319 chequeados.

## Recorrido por persona

El encabezado DCP_PagoGrupalAsistencias identifica fecha y línea de producción;
DCP_PagoGrupalAsistenciasDetalle guarda IdEmpleado, idActividad, HoraDesde y HoraHasta.
La línea se consulta en dcp_LineasProduccion y su proceso en DCP_PROCESOS; la actividad
proviene de Dcp_Actividades. Se conserva cada tramo ordenado por hora inicial, con línea,
proceso, área, actividad, inicio, fin y duración. Un fin no registrado queda abierto;
no se inventa con la hora de inicio del siguiente tramo. Las referencias históricas de
sala o asignaciones activas no se agregan como pasos del recorrido del día.

En Personal se puede pulsar un contador o Buscar persona / recorrido para abrir el
listado. Ver recorrido muestra los chequeos de esa persona y las marcas biométricas.
Las listas por sala y tipo de personal ofrecen la misma acción. La agrupación por
actividad/departamento conserva la última línea de chequeo registrada; no implica
que la persona permanezca físicamente allí.

## Presentación del dashboard

Personal mantiene la barra compacta con fecha, turno, filtros y Área/Departamento/Actividad.
El resumen muestra tarjetas que abren los mismos listados: Asistieron (Según Chequeo),
Según biométrico, marca sin entrada y personal total. Una fila complementaria conserva
chequeos de actividad, marca sin pesado positivo, faltas explícitas y tasa de inasistencia.

La gráfica circular divide exclusivamente a las personas con marca entre entrada confirmada
y marca sin entrada. Su porcentaje es entradas / personas con marca, no una tasa de ausencia.
Las barras de distribución muestran hasta seis grupos por la agrupación seleccionada,
comparando entradas confirmadas y padrón; la tabla conserva todos los grupos.
La gráfica por turno compara entradas y padrón de cada turno sin interpretar el resto
como faltas. Al pulsar barras o leyendas se abren personas y recorridos. Estas gráficas
usan los filtros y datos existentes, sin nuevas consultas ni cambios de cálculo.

## Distribución por actividad

El bloque Distribución del personal por actividad agrupa por actividad y proceso,
respetando los filtros de fecha, turno, división, puesto y tipo de personal. Por defecto
incluye personas con marca biométrica, pesa o chequeo; se puede incluir todo el padrón.
La última registrada asigna cada persona una sola vez según el último chequeo del día.
Si solo hay pesa se muestra su último proceso, sin inventar una actividad del catálogo.
Sin evidencia queda sin actividad; chequeos simultáneos en líneas o actividades distintas
quedan en Actividad por confirmar. Una sala histórica no asigna actividad del día.

Participaron durante el día cuenta cada persona una vez por actividad y proceso visitados;
los regresos a la misma actividad no duplican personas. Una persona puede aparecer en varias
filas y el pie muestra el total de personas únicas, no la suma de participaciones. Al pulsar
una actividad se abre la lista de personas con acceso a sus recorridos. La última registrada
no garantiza permanencia física actual y conserva los tramos ya cerrados.

En la validación posterior del 23/11/2026 hubo 836 personas con evidencia de asistencia
(incluye fuentes operativas además del biométrico), repartidas en 39 grupos de última actividad:
214 por chequeo, 594 con proceso por pesa, 15 sin actividad y 13 con registros simultáneos.
El total de la distribución fue exactamente 836. Estos datos son dinámicos.

Prueba de agrupación de interfaz desde la raíz del proyecto:
`./backend/node_modules/.bin/tsx --test frontend/tests/staff-activities.test.ts`.

## Turnos

> **Regla vigente (27/11/2026):** el turno sale únicamente de "TA"/"TB" escrito en la línea de producción
> o en la actividad del chequeo del día (si hay varios, el último que lo indique). TA = Turno A, TB = Turno B.
> Sin TA/TB (p. ej. obra de pelado por pesa, Langosta) se toma Turno A. Sin chequeo ni pesa queda "Sin turno". Ya no se usa la referencia histórica
> de 30 días descrita abajo.

TA corresponde al turno A de día y TB al B de noche. Se usa la línea del chequeo
del día o, como referencia histórica, la última línea reconocida de los 30 días
previos, con identidad verificada. Sin evidencia suficiente queda Sin turno confirmado.
No se usa Cl_Turnos como programación porque figura A para todos. El biométrico se
cuenta por fecha calendario sin imponer horarios de turno no confirmados.

## Validación en vivo del 23/11/2026

En el corte consultado: 1,089 empleados únicos; 834 con marca biométrica, 782 con
entrada, 52 con marcas sin entrada y 43 con marca sin pesado positivo. Estos valores
son dinámicos. Se encontraron 226 personas con chequeos del día y 34 con más de una
línea registrada; el recorrido mayor tenía tres tramos. Ninguno de estos números se
fija en código. La consulta completa tomó alrededor de cinco segundos en ese corte.

## Referencia anterior a la incorporación del biométrico

La conciliación siguiente corresponde a la implementación anterior, basada solo en
pesas y chequeos; sus resultados no describen el cálculo vigente.

## Referencia entregada

`Personal Temporal asistencia.xlsx`, Hoja1, A1:H1090, fecha 20/11/2026:

| Marca | Personas |
| --- | ---: |
| A | 888 |
| X | 161 |
| PERMISO SIN SUELDO | 26 |
| INCAPACIDAD | 13 |
| DIA LIBRE | 1 |
| Total temporal | 1089 |

Son 1,089 IDs únicos, todos T, sin filas ocultas ni filtros guardados. El archivo
trae dos A más que los 886 mencionados inicialmente. La población coincide por
ID con el padrón temporal de obra. El archivo sirve para contrastar; no se importa
a las bases ni se usan excepciones por empleado para forzar estados.

La conciliación A/X continúa pendiente: con las consultas exclusivas de chequeo
y pesa, la validación en vivo devolvió 911 presentes, 135 sin registro, 42 con
permiso/incapacidad y 1 día libre; 165 estados difieren del archivo. Las fuentes
son dinámicas y esta comparación no certifica que coincidan con el corte del Excel.
No se requiere acceso a biométricos ni archivos del reporte para ejecutar Personal.

## Verificación reproducible

```sh
cd backend
CACHE_ENABLED=false npm run reconcile:personal -- "/ruta/Personal Temporal asistencia.xlsx" "/tmp/conciliacion-personal.json"
```

Lee la fecha de la cabecera, valida IDs y compara estados por persona. Devuelve
código 2 si existen diferencias, 1 si falla la consulta o lectura y 0 únicamente
si población y estados coinciden. El JSON de detalle contiene IDs y estados;
los nombres y el archivo fuente no se copian al repositorio.

Los contratos y las fechas de ingreso/retiro son los valores actuales de
RH_EMPLEADOS; no hay historial contractual para reconstruir cambios T/P pasados.
