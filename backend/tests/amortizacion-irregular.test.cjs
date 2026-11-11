const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcularPlan, fechaPeriodo } = require('../dist/services/amortizacion');
const base = { monto: 18557700, tasaAnual: 17, cantidadCuotas: 84, frecuencia: 'mensual', tipoAmortizacion: 'personalizado', fechaDesembolso: '2024-07-15', fechaPrimeraCuota: '2024-08-09', cargoCuota: 0, baseCalculo: 'ACTUAL_360' };
function calendario() {
  return Array.from({ length: 84 }, (_, i) => ({ fechaVencimiento: fechaPeriodo(base.fechaPrimeraCuota, 'mensual', i), capital: i < 12 ? 0 : i === 83 ? 7500000 : i === 81 ? 155742.50 : 155742.25 }));
}
test('capital irregular del documento: gracia, ajuste de centavos y pago final', () => {
  const plan = calcularPlan({ ...base, opciones: { calendario: calendario() } });
  assert.equal(plan.cuotas[0].dias, 25);
  assert.equal(plan.cuotas[0].interes, 219083.96);
  assert.equal(plan.cuotas[11].saldo, 18557700);
  assert.equal(plan.cuotas[12].saldo, 18401957.75);
  assert.equal(plan.cuotas[82].saldo, 7500000);
  assert.equal(plan.cuotas[83].capital, 7500000);
  assert.equal(plan.cuotas[83].saldo, 0);
  assert.equal(plan.cuotas[83].fechaVencimiento, '2031-07-09');
  assert.equal(plan.cuotas[43].dias, 29);
});
test('respeta los intereses contractuales aunque difieran de la tasa general', () => {
  const rows = calendario();
  rows[0].interes = 183644;
  rows[12].interes = 303624.54;
  rows[83].interes = 106250.10;
  const plan = calcularPlan({ ...base, opciones: { calendario: rows } });
  assert.equal(plan.cuotas[0].monto, 183644);
  assert.equal(plan.cuotas[12].monto, 459366.79);
  assert.equal(plan.cuotas[83].monto, 7606250.10);
});
test('rechaza fechas anteriores al desembolso y días reales sin fecha inicial', () => {
  assert.throws(() => calcularPlan({ ...base, fechaDesembolso: '2024-08-10', opciones: { calendario: calendario() } }), /anterior/);
  assert.throws(() => calcularPlan({ ...base, fechaDesembolso: undefined, opciones: { calendario: calendario() } }), /desembolso/);
});
test('redondeo diario y cambios de tasa reproducen cuotas del banco', () => {
  const plan = calcularPlan({ ...base, tasaAnual: 14.25, opciones: { calendario: calendario(), redondeoInteres: 'diario', cambiosTasa: [{ desde: '2025-03-09', tasaAnual: 19 }, { desde: '2026-04-09', tasaAnual: 17 }] } });
  assert.deepEqual(plan.cuotas.slice(0, 5).map(q => q.interes), [183644, 227718.56, 220372.80, 227718.56, 220372.80]);
  assert.equal(plan.cuotas[6].tasaAnualAplicada, 14.25);
  assert.equal(plan.cuotas[7].interes, 274241.52);
  assert.equal(plan.cuotas[12].interes, 303624.54);
  assert.equal(plan.cuotas[19].tasaAnualAplicada, 19);
  assert.equal(plan.cuotas[20].tasaAnualAplicada, 17);
  assert.equal(plan.cuotas[83].interes, 106250.10);
});
test('rechaza tasas inválidas y cambios duplicados', () => {
  for (const cambiosTasa of [[{ desde: '2025-01-09', tasaAnual: -1 }], [{ desde: '2025-01-09', tasaAnual: 17 }, { desde: '2025-01-09', tasaAnual: 19 }]]) {
    assert.throws(() => calcularPlan({ ...base, opciones: { calendario: calendario(), cambiosTasa } }), /cambios/);
  }
});
test('cuota nivelada: reproduce las 26 filas visibles del segundo documento', () => {
  const intereses = [25926,25105.20,24279.60,23448.90,22613.40,21772.80,20927.10,20076,19220.10,18359.10,17492.70,16620.90,15744,14862,13974.30,13081.50,12183.30,11279.70,10370.40,9456,8535.60,7610.10,6678.60,5741.70,4799.10,3850.80];
  const saldos = [4155345.88,4018692.91,3881214.34,3742905.07,3603760.30,3463774.93,3322943.86,3181261.69,3038723.62,2895324.55,2751059.08,2605921.81,2459907.64,2313011.47,2165227.60,2016550.93,1866976.06,1716497.59,1565109.82,1412807.65,1259585.08,1105437.01,950357.44,794340.97,637381.90,479474.53];
  const plan = calcularPlan({ monto: 4291178.05, tasaAnual: 7.25, cantidadCuotas: 29, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija', fechaDesembolso: '2026-11-02', fechaPrimeraCuota: '2026-12-02', cargoCuota: 0, baseCalculo: '30_360', opciones: { redondeoInteres: 'diario', cuotaPactada: 161758.17 } });
  intereses.forEach((interes, i) => {
    assert.equal(plan.cuotas[i].interes, interes, `interés cuota ${i+1}`);
    assert.equal(plan.cuotas[i].saldo, saldos[i], `saldo cuota ${i+1}`);
    assert.equal(plan.cuotas[i].monto, 161758.17);
    assert.equal(plan.cuotas[i].dias, 30);
  });
  assert.equal(plan.cuotas[28].saldo, 0);
  assert.equal(Math.round(plan.cuotas.reduce((s,q) => s + q.capital, 0)*100), 429117805);
});
test('cuota francesa conserva cálculo automático y valida cuota pactada', () => {
  const input = { monto: 4291178.05, tasaAnual: 7.25, cantidadCuotas: 29, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija', fechaPrimeraCuota: '2026-12-02', cargoCuota: 0, baseCalculo: '30_360' };
  assert.equal(calcularPlan(input).primeraCuota, 161758.34);
  assert.throws(() => calcularPlan({ ...input, opciones: { cuotaPactada: -1 } }), /Cuota pactada/);
  assert.throws(() => calcularPlan({ ...input, opciones: { cuotaPactada: 10.001 } }), /decimales/);
});
test('frecuencias semestral y anual: fechas, días comerciales y saldo final', () => {
  for (const [frecuencia, dias, segunda] of [['semestral', 180, '2027-07-31'], ['anual', 360, '2028-01-31']]) {
    const plan = calcularPlan({ monto: 100000, tasaAnual: 12, cantidadCuotas: 3, frecuencia, tipoAmortizacion: 'cuota_fija', fechaPrimeraCuota: '2027-01-31', cargoCuota: 0, baseCalculo: '30_360', opciones: { redondeoInteres: 'diario' } });
    assert.equal(plan.cuotas[0].dias, dias);
    assert.equal(plan.cuotas[0].interes, Math.round(33.33 * dias * 100) / 100);
    assert.equal(plan.cuotas[1].fechaVencimiento, segunda);
    assert.equal(plan.cuotas[2].saldo, 0);
  }
});
