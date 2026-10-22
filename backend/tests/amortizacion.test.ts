import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularPlan, fechaPeriodo, PlanInput } from '../src/services/amortizacion';

const base: PlanInput = { monto: 10000, tasaAnual: 12, cantidadCuotas: 12, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija', fechaPrimeraCuota: '2027-01-31', cargoCuota: 0 };
const plan = (patch: Partial<PlanInput> = {}) => calcularPlan({ ...base, ...patch });
const cents = (v: number) => Math.round(v * 100);

test('Francés: cuota constante, interés decreciente y cierre exacto', () => {
  const p = plan();
  assert.equal(p.primeraCuota, 888.49);
  assert(p.cuotas.every((q, i) => i === 11 || q.monto === p.primeraCuota));
  assert(p.cuotas[0].interes > p.cuotas[10].interes);
  assert.equal(cents(p.cuotas.reduce((s, q) => s + q.capital, 0)), 1000000);
  assert.equal(p.cuotas[11].saldo, 0);
});
test('Alemán: capital constante y pagos decrecientes', () => {
  const p = plan({ monto: 12000, tipoAmortizacion: 'capital_fijo' });
  assert(p.cuotas.every(q => q.capital === 1000));
  assert.equal(p.cuotas[0].monto, 1120); assert.equal(p.ultimaCuota, 1010);
});
test('Americano: interés periódico y todo el capital al final', () => {
  const p = plan({ tipoAmortizacion: 'solo_interes' });
  assert(p.cuotas.slice(0, 11).every(q => q.capital === 0 && q.interes === 100));
  assert.equal(p.ultimaCuota, 10100); assert.equal(p.totalInteres, 1200);
});
test('Bullet simple y compuesto: un solo pago en la fecha de vencimiento', () => {
  const simple = plan({ tipoAmortizacion: 'pago_unico', opciones: { interesPagoUnico: 'simple' }, cargoCuota: 25 });
  assert.equal(simple.cuotas.length, 1); assert.equal(simple.totalPagar, 11225);
  assert.equal(simple.cuotas[0].fechaVencimiento, base.fechaPrimeraCuota);
  const compound = plan({ tipoAmortizacion: 'pago_unico', opciones: { interesPagoUnico: 'compuesto' } });
  assert.equal(compound.totalInteres, 1268.25);
});
for (const baseBalon of ['cuota_fija', 'capital_fijo'] as const) {
  test(`Balón ${baseBalon}: residual pactado y capital conciliado`, () => {
    const p = plan({ tipoAmortizacion: 'balon', opciones: { balon: { base: baseBalon, valor: 30, unidad: 'porcentaje' } } });
    assert.equal(p.cuotas[11].capital, 3000); assert.equal(p.cuotas[11].interes, 30);
    assert.equal(p.ultimaCuota, 3030);
    assert.equal(cents(p.cuotas.reduce((s, q) => s + q.capital, 0)), 1000000);
  });
}
test('Gracia parcial incluida en el plazo, sin amortizar capital', () => {
  const p = plan({ opciones: { gracia: { periodos: 2, tipo: 'parcial' } }, cargoCuota: 10 });
  assert.equal(p.cuotas.length, 12);
  assert(p.cuotas.slice(0, 2).every(q => q.monto === 110 && q.capital === 0));
  assert.equal(p.interesCapitalizado, 0); assert.equal(p.cuotas[11].saldo, 0);
});
test('Gracia capitalizada: sin pagos, interés compuesto y sin duplicar costos', () => {
  const p = plan({ opciones: { gracia: { periodos: 2, tipo: 'capitalizar' } }, cargoCuota: 10 });
  assert(p.cuotas.slice(0, 2).every(q => q.monto === 0));
  assert.equal(p.interesCapitalizado, 201); assert.equal(p.capitalFinanciado, 10201);
  assert.equal(cents(p.cuotas.reduce((s, q) => s + q.capital, 0)), 1020100);
  assert.equal(cents(p.totalPagar), cents(base.monto + p.totalInteres + p.totalCargos));
});
for (const cobro of ['primera', 'repartido', 'ultima'] as const) {
  test(`Gracia diferida, cobro ${cobro}: no genera interés sobre el diferido`, () => {
    const p = plan({ tipoAmortizacion: 'capital_fijo', opciones: { gracia: { periodos: 2, tipo: 'diferir', cobroDiferido: cobro } } });
    assert(p.cuotas.slice(0, 2).every(q => q.monto === 0));
    assert.equal(p.capitalFinanciado, base.monto); assert.equal(p.totalInteres, 750);
    if (cobro === 'primera') assert.equal(p.cuotas[2].interes, 300);
    if (cobro === 'repartido') assert.equal(p.cuotas[2].interes, 120);
    if (cobro === 'ultima') assert.equal(p.cuotas[11].interes, 210);
  });
}
test('Creciente fijo: incremento cada dos períodos y saldo final cero', () => {
  const p = plan({ tasaAnual: 0, cantidadCuotas: 4, monto: 4200, tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'fijo', porcentaje: 10, cadaPeriodos: 2 } } });
  assert.deepEqual(p.cuotas.map(q => q.monto), [1000, 1000, 1100, 1100]);
});
test('Índice variable: cambios acumulativos y períodos sin cambio', () => {
  const p = plan({ tasaAnual: 0, cantidadCuotas: 4, monto: 4410, tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'variable', indice: 'IPC pactado', variaciones: [{ periodo: 2, porcentaje: 10 }, { periodo: 4, porcentaje: 10 }] } } });
  assert.deepEqual(p.cuotas.map(q => q.monto), [1000, 1100, 1100, 1210]);
});
test('Abonos programados amortizan antes y reducen intereses', () => {
  const regular = plan();
  const p = plan({ tipoAmortizacion: 'extraordinarias', opciones: { baseExtraordinarias: 'cuota_fija', extraordinarias: [{ periodo: 3, monto: 2000 }] } });
  assert(p.cuotas.length < regular.cuotas.length); assert(p.totalInteres < regular.totalInteres);
  assert.equal(p.cuotas[2].monto, 2888.49); assert.equal(p.cuotas[p.cuotas.length - 1].saldo, 0);
});
test('Manual: respeta fechas e importes, concilia capital', () => {
  const p = plan({ tipoAmortizacion: 'manual', cantidadCuotas: 2, opciones: { calendario: [
    { fechaVencimiento: '2027-01-31', capital: 1000, interes: 100, cargos: 10 },
    { fechaVencimiento: '2027-08-15', capital: 9000, interes: 500, cargos: 5 },
  ] } });
  assert.deepEqual(p.cuotas.map(q => q.monto), [1110, 9505]); assert.equal(p.totalPagar, 10615);
});
test('Fechas de fin de mes sin deriva, bisiestos y quincenas', () => {
  assert.equal(fechaPeriodo('2028-01-31', 'mensual', 1), '2028-02-29');
  assert.equal(fechaPeriodo('2027-01-31', 'mensual', 2), '2027-03-31');
  assert.equal(fechaPeriodo('2027-01-31', 'quincenal', 1), '2027-02-15');
});
test('Rechaza planes inconsistentes y entradas que antes causaban errores internos', () => {
  for (const patch of [
    { fechaPrimeraCuota: '2027-02-31' }, { monto: 100.001 }, { opciones: [] },
    { opciones: { gracia: { periodos: 12, tipo: 'parcial' } } },
    { tipoAmortizacion: 'balon', opciones: { balon: { base: 'cuota_fija', valor: 100, unidad: 'porcentaje' } } },
    { tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'variable', indice: 'IPC', variaciones: [{ periodo: 2, porcentaje: -100 }] } } },
    { tipoAmortizacion: 'manual', cantidadCuotas: 1, opciones: { calendario: [{ fechaVencimiento: '2027-01-31', capital: 9000, interes: 0, cargos: 0 }] } },
    { tipoAmortizacion: 'extraordinarias', opciones: { baseExtraordinarias: 'capital_fijo', extraordinarias: [{ periodo: 1, monto: 10001 }] } },
  ]) assert.throws(() => plan(patch as Partial<PlanInput>), error => (error as { statusCode: number }).statusCode === 400);
});
test('Todos los métodos: tasa cero y redondeo conservan el capital', () => {
  for (const monto of [0.01, 100.01, 123456.78]) for (const tipo of ['cuota_fija', 'capital_fijo', 'solo_interes'] as const) {
    const p = plan({ monto, tasaAnual: 0, tipoAmortizacion: tipo, cantidadCuotas: 17 });
    assert.equal(cents(p.cuotas.reduce((sum, q) => sum + q.capital, 0)), cents(monto));
    assert.equal(cents(p.totalPagar), cents(monto));
  }
});
