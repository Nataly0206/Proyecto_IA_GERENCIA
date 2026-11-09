# Amortizaciones de préstamos recibidos

En **Préstamos → Nuevo préstamo** se registra el crédito con: banco (acreedor), n.º de préstamo,
moneda, monto desembolsado, tasa anual (%), frecuencia de pago, plazo en cuotas, fecha de desembolso, fecha del primer
pago, tipo de amortización y base de cálculo. La simulación usa el mismo motor que el registro
(`backend/src/services/amortizacion.ts`) y muestra fecha, semana ISO, capital, interés, pago y saldo,
con totales de capital, intereses y costo total del crédito. No permite guardar un plan que no cuadre.

## Métodos

| Método | Comportamiento |
| --- | --- |
| Cuota fija (Francés) | `C = P·i(1+i)ⁿ / ((1+i)ⁿ − 1)`, `i = tasa anual / 12`. Interés = saldo × i; capital = cuota − interés. |
| Solo interés al vencimiento (Bullet) | Cuotas 1 a n−1: capital 0 e interés sobre el saldo. Cuota n: todo el capital más su interés. |
| Personalizada (irregular) | El usuario define el capital de cada cuota (y su fecha). El interés se calcula sobre el saldo. |

En la personalizada, un indicador muestra **Capital cuadrado 100%** (verde) o **Descuadre por X**
(rojo). Mientras no cuadre, el botón de guardar queda deshabilitado y el servidor rechaza el plan.

## Frecuencia de pago

Semanal (cada 7 días), mensual o trimestral (cada 3 meses, ajustando fin de mes). El plazo se
ingresa como **número de cuotas** de esa frecuencia. En base 30/360 la tasa por período es la tasa
anual dividida entre 52, 12 o 4 según la frecuencia.

## Base de cálculo

- **30 / 360:** interés = saldo × tasa anual / períodos por año (52, 12 o 4).
- **Días reales / 360:** interés = saldo × tasa anual × días transcurridos / 360, contando desde la
  cuota anterior (la primera, desde el desembolso).

## Regla de cuadre

Todo se redondea a 2 decimales. En la última cuota el capital es exactamente el saldo restante, por lo
que el saldo final siempre es 0.00.

## Endpoints

- `POST /api/prestamos/simular`: calcula el plan sin guardar.
- `POST /api/prestamos`: valida y guarda encabezado y cuotas en una sola transacción SQL.
- `GET /api/prestamos`: préstamos con saldos y totales calculados.
- `GET /api/prestamos/:id/tabla`: tabla de amortización con semana ISO, mes y año por cuota.
- `GET /api/prestamos/flujo-semanal?desde=&hasta=&incluirPagadas=1`: pagos agrupados por semana ISO,
  mes y banco (reporte tipo PAGOS WK). Por defecto solo cuotas pendientes de préstamos activos;
  las monedas no se mezclan.

## Pagos, abonos e historial

Los pagos, abonos a capital, ajustes de cuota e historial de cuotas reemplazadas no cambiaron. Con base
días reales / 360 y en la personalizada, un abono conserva fechas y forma del calendario y reduce capital
e intereses futuros proporcionalmente. Reducir el plazo solo aplica a Francés con base 30/360.

Los préstamos creados antes con otros métodos (Alemán, balón, creciente, etc.) y los importados por
Telegram se siguen consultando y pagando, pero ya no se pueden crear nuevos con esos métodos.

## Instalación

La migración 20 agrega `base_calculo` y el tipo `personalizado`. Desde `backend`:

```sh
npm run migrate
npm run build
```

Desde `frontend`, ejecutar `npm run build` y publicar ambos componentes juntos.
