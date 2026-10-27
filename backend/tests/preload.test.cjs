const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planPreload, itemKey } = require('../dist/services/preload-planner');
const base = { nombreClientePrincipal: 'Principal', nombreCliente: 'Cliente', codigoItem: 'ITEM', nombreItem: 'Producto', estiloFinal: 'IQF', marca: 'Marca', talla: '71/90', empaque: 'Caja', tipoItem: 'PT', disponibilidad: 'DISPONIBLE', fechaProduccion: '2026-10-23', noOrdenCompra: '10670', codigoExterno: '3125438', pesoKilos: 100, cantidadSerial: 10 };
const key = itemKey(base);
test('FIFO consume lotes antiguos primero y prorratea un lote parcial', () => {
  const older = { ...base, fechaProduccion: '2026-10-19', codigoExterno: 'OLD', pesoKilos: 40, cantidadSerial: 4 };
  const [planned] = planPreload([base, older], {}, [{ key, quantity: 7 }]);
  assert.deepEqual(planned.allocations.map(row => [row.codigoExterno, row.cantidadSerial]), [['OLD', 4], ['3125438', 3]]);
  assert.equal(planned.pesoKilos, 70);
  assert.equal(base.cantidadSerial, 10);
});
test('filtros originales y disponibilidad delimitan el stock elegible', () => {
  const rows = [base, { ...base, disponibilidad: 'RETENIDO', cantidadSerial: 500 }, { ...base, noOrdenCompra: 'OTRA', cantidadSerial: 500 }];
  const [planned] = planPreload(rows, { noOrdenCompra: ['10670'] }, [{ key, quantity: 11 }]);
  assert.equal(planned.assigned, 10);
  assert.equal(planned.missing, 1);
});
test('no mezcla clientes o empaques aunque el código coincida', () => {
  const rows = [base, { ...base, nombreCliente: 'Otro', cantidadSerial: 500 }, { ...base, empaque: 'Otro', cantidadSerial: 500 }];
  const [planned] = planPreload(rows, {}, [{ key, quantity: 11 }]);
  assert.equal(planned.assigned, 10);
  assert.equal(planned.missing, 1);
});
test('conserva cantidades y peso en asignación completa', () => {
  const [planned] = planPreload([base], {}, [{ key, quantity: 10 }]);
  assert.equal(planned.requested, 10);
  assert.equal(planned.pesoKilos, 100);
});
test('guarda el faltante completo si el ítem se agotó antes de enviar', () => {
  const [planned] = planPreload([], {}, [{ key, quantity: 1 }]);
  assert.equal(planned.item.codigoItem, base.codigoItem);
  assert.equal(planned.assigned, 0);
  assert.equal(planned.missing, 1);
  assert.equal(planned.pesoKilos, 0);
});

test('completa los 629 seriales del ejemplo desde dos órdenes', () => {
  const older = { ...base, noOrdenCompra: '10672', fechaProduccion: '2026-10-19', cantidadSerial: 164, pesoKilos: 1859.76 };
  const newer = { ...base, noOrdenCompra: '10673', fechaProduccion: '2026-10-23', cantidadSerial: 465, pesoKilos: 5273.1 };
  const [planned] = planPreload([newer, older], {}, [{ key, quantity: 629 }]);
  assert.deepEqual(planned.allocations.map(row => [row.noOrdenCompra, row.cantidadSerial]), [['10672', 164], ['10673', 465]]);
  assert.equal(planned.assigned, 629);
  assert.equal(planned.missing, 0);
  assert.ok(Math.abs(planned.pesoKilos - 7132.86) < 0.000001);
});
test('FIFO prioriza fecha sobre orden y conserva trazabilidad del lote', () => {
  const older = { ...base, fechaProduccion: '2026-10-19', noOrdenCompra: '99999', nombreFinca: 'Finca', laguna: 'A-38', color: 'A2', codigoProduccion: '3125174' };
  const [planned] = planPreload([base, older], {}, [{ key, quantity: 2 }]);
  assert.equal(planned.allocations[0].noOrdenCompra, '99999');
  assert.equal(planned.allocations[0].codigoProduccion, '3125174');
});

test('excluye existencias sin orden aunque sean más antiguas del mismo ítem', () => {
  const noOrder = ['', 'Sin orden', '0', '  '].map(noOrdenCompra => ({ ...base, noOrdenCompra, fechaProduccion: '2020-01-01', cantidadSerial: 100 }));
  const [planned] = planPreload([...noOrder, base], {}, [{ key, quantity: 12 }]);
  assert.equal(planned.assigned, 10);
  assert.equal(planned.missing, 2);
  assert.equal(planned.allocations.length, 1);
  assert.equal(planned.allocations[0].noOrdenCompra, base.noOrdenCompra);
});
