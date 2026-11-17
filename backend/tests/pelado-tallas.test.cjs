const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tallaMasPelada } = require('../dist/utils/peladoTallas');

test('elige el rango con más libras y acumula tallas repetidas', () => {
  assert.equal(tallaMasPelada([{ talla: '51/60', libras: 100 }, { talla: '41/50', libras: 70 }, { talla: ' 41/50 ', libras: 50 }]), '41/50');
  assert.equal(tallaMasPelada([{ talla: 'U/15', libras: 100 }]), 'U/15');
});
test('muestra los rangos empatados y omite tallas ausentes', () => {
  assert.equal(tallaMasPelada([{ talla: '51/60', libras: 100 }, { talla: '41/50', libras: 100 }, { talla: '', libras: 999 }]), '41/50 · 51/60');
  assert.equal(tallaMasPelada([{ talla: 'Sin talla', libras: 200 }]), null);
  assert.equal(tallaMasPelada([]), null);
});

test('unifica guiones y barras antes de elegir la talla con más libras', () => {
  assert.equal(tallaMasPelada([{ talla: '51 - 60', libras: 60 }, { talla: '51/60', libras: 50 }, { talla: '41–50', libras: 100 }]), '51/60');
  assert.equal(tallaMasPelada([{ talla: '41—50', libras: 100 }]), '41/50');
});
