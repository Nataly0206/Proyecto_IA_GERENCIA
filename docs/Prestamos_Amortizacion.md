# Amortizaciones de préstamos recibidos

En **Préstamos → Nuevo préstamo**, selecciona el método y completa sus condiciones.
La simulación usa el mismo cálculo que el registro y muestra fechas, capital,
intereses, cargos, pago y saldo. No permite guardar un calendario inválido.

## Métodos

| Método | Configuración y comportamiento |
| --- | --- |
| Francés | Capital + interés constantes, con ajuste de centavos en el último pago. |
| Alemán | Capital constante; intereses sobre el saldo y cuotas decrecientes. |
| Americano | Intereses periódicos y capital completo en el último pago. |
| Pago único / Bullet | Una fecha de vencimiento; plazo contractual en períodos e interés simple o compuesto. Cargos cobrados una sola vez. |
| Balón | Capital final en monto o porcentaje del desembolso. Cuotas anteriores francesas o alemanas; la última paga el capital balón más su interés. |
| Creciente | Incremento fijo cada N períodos, o variaciones porcentuales acumulativas ingresadas para períodos específicos. |
| Extraordinarias | Plan francés o alemán con abonos adicionales de capital programados por número de período. Mantiene las cuotas base y puede terminar antes. |
| Manual / pagarés escalonados | Fechas e importes pactados libremente; capital total igual al desembolso, fechas únicas y ordenadas. La tasa anual es informativa. |

La tasa es anual nominal, dividida entre 52, 24, 12, 4, 2 o 1 períodos según
la frecuencia. Los cálculos usan períodos completos, sin prorrateo por días.
Para el Bullet se ingresa directamente el vencimiento y el número de períodos
contractuales utilizado para calcular los intereses.

El índice variable **modifica las cuotas, no la tasa de interés**. Se ingresa
el nombre de la referencia y la variación porcentual de cada período de cambio.
No existe consulta automática de inflación; para modificar valores futuros
pactados después del registro hay que ajustar las cuotas antes de que tengan pagos.
No se admiten planes con cuotas que no cubran el interés generado.

## Gracia

Se configura como condición adicional de los métodos periódicos. Está incluida
en el plazo total y debe dejar al menos un período de amortización.

- Parcial: solo interés y cargos durante los períodos iniciales.
- Total con capitalización: no hay pagos ni cargos durante la gracia; el interés
  se suma al capital y genera interés posterior.
- Total con diferimiento: no hay pagos ni cargos durante la gracia; los intereses
  no se capitalizan. Se cobran en la primera cuota posterior, repartidos entre las
  cuotas restantes o en la última.

El capital financiado del calendario incluye la capitalización pactada de toda
la gracia. Se identifica por separado del desembolso. Los intereses totales de
la simulación incluyen ese importe, sin duplicarlo en el total a pagar. Cuando
se paga capital financiado, se registra como capital en los reportes.

## Abonos y conservación del historial

Los abonos se aplican al capital de cuotas sin pagos. Las cuotas parcialmente
pagadas y las aplicaciones de sus pagos se conservan intactas.

- Francés y Alemán sin gracia permiten reducir cuota o plazo, recalculando con
  la tasa del préstamo. Americano conserva el plazo.
- Los planes estructurados y con gracia conservan fechas y forma del calendario:
  distribuyen la reducción de capital proporcionalmente y reducen los intereses
  futuros en la misma proporción, conservando los intereses diferidos ya pactados. No hacen una liquidación por días.
- El calendario manual conserva los intereses y cargos pactados: solo distribuye
  la reducción de capital. Incluso al abonar todo el capital, quedan pendientes
  esos importes contractuales hasta registrar su pago.
- Reducir el plazo automáticamente se limita a Francés y Alemán sin gracia;
  los otros calendarios requieren ajustes explícitos para conservar sus condiciones.

Un ajuste manual o un recálculo por abono marca las cuotas anteriores como
reemplazadas, conservando usuario, fecha y motivo. Las nuevas cuotas reutilizan
el número del período mediante un índice único que solo incluye cuotas vigentes.
El detalle permite consultar el historial; saldos, agenda y pagos solo usan el
calendario vigente. Eliminar préstamos o acreedores sigue siendo borrado lógico.

## Instalación y verificación

Las migraciones 12 y 13 amplían los métodos, guardan las opciones, identifican los intereses diferidos y agregan el historial de
cuotas. Conservan los préstamos existentes y sus calendarios.

Desde `backend`:

```sh
npm run migrate
npm run test:prestamos
npm run test:prestamos:db
npm run build
```

Las pruebas SQL requieren la conexión configurada en `backend/.env` y se revierten
en una transacción: no dejan préstamos, acreedores ni pagos de prueba.
Desde `frontend`, ejecutar `npm run build` y publicar ambos componentes juntos.
