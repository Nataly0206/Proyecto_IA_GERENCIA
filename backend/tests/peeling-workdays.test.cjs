const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizePeelingWorkdays } = require('../dist/utils/peelingWorkdays');

test('counts dates once across styles, excludes zero production and future dates, separates partial month', () => {
  const result = summarizePeelingWorkdays([
    { dia: '2026-01-01', libras: 10 }, { dia: '2026-01-01', libras: 20 },
    { dia: '2026-02-05', libras: 0 }, { dia: '2026-03-02', libras: 30 },
    { dia: '2026-03-20', libras: 10 }, { dia: '2025-12-31', libras: 10 },
  ], 2026, '2026-03-10');
  assert.equal(result.daysWorked, 2);
  assert.equal(result.monthsCompleted, 2);
  assert.equal(result.averageDaysPerMonth, 0.5);
  assert.equal(result.currentMonthDays, 1);
  assert.equal(result.poundsPerDay, 30);
  assert.equal(result.months[3].status, 'future');
});
test('January has no completed months and past years include all twelve months', () => {
  assert.equal(summarizePeelingWorkdays([], 2026, '2026-01-10').averageDaysPerMonth, null);
  const result = summarizePeelingWorkdays([{ dia: '2024-02-29', libras: 12 }], 2024, '2026-01-10');
  assert.equal(result.daysWorked, 1);
  assert.equal(result.averageDaysPerMonth, 1 / 12);
  assert.equal(result.currentMonthDays, null);
  assert.equal(result.through, '2024-12-31');
});
