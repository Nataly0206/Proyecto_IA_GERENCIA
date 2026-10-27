const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFParse } = require('pdf-parse');
const { buildLoadReport, exportLoadReport } = require('../dist/services/load-report');
const fixture = require('./fixtures/load-report.cjs');

test('reproduce subtotales por orden/ítem, finca, laguna y color sin duplicar total', () => {
  const report = buildLoadReport(fixture, 'lbs');
  const subtotals = report.rows.filter(row=>row.kind==='subtotal');
  assert.equal(subtotals.length, 7); // four order/item groups plus three inner subtotals
  for (const [label, serials] of [['ALGODON Total',89], ['M-71 Total',198], ['A2 Total',176]]) {
    const row = subtotals.find(row=>row.cells.some(cell=>cell.text===label));
    assert.ok(row, label);
    assert.equal(row.cells.find(cell=>cell.column===9).value,serials);
  }
  const total = report.rows.at(-1);
  assert.equal(total.cells.find(cell=>cell.column===9).value,1212);
  assert.ok(Math.abs(total.cells.find(cell=>cell.column===8).value-31723.2398)<1e-7);
  const detailSum = report.rows.filter(row=>row.kind==='detail').reduce((sum,row)=>sum+row.cells.find(cell=>cell.column===9).value,0);
  assert.equal(detailSum,1212);
});

test('cada celda de la tabla queda cubierta una sola vez al combinar filas y columnas', () => {
  const report = buildLoadReport(fixture,'lbs');
  const grid = report.rows.map(()=>Array(10).fill(0));
  report.rows.forEach((row,y)=>row.cells.forEach(cell=>{
    for(let r=y;r<y+cell.rowSpan;r++) for(let c=cell.column;c<cell.column+cell.colSpan;c++) {
      assert.ok(grid[r], 'rowspan fuera de tabla');
      grid[r][c]++;
    }
  }));
  for (const row of grid) assert.deepEqual(row,Array(10).fill(1));
});

test('PDF conserva detalle, subtotales y total en una página horizontal', async () => {
  const bytes = await exportLoadReport(buildLoadReport(fixture,'lbs'),23,'2026-10-26T12:57:09Z');
  assert.equal(bytes.subarray(0,5).toString(), '%PDF-');
  const parser = new PDFParse({data:bytes});
  try {
    const result = await parser.getText();
    assert.equal(result.total,1);
    for (const text of ['SERVICE AND TRADING BUSINESS S.A. DE C.V.', 'INVENTARIO ACTUAL COMPLETADO MAS SOBRANTES a la fecha 26/10/2026 06:57:09', 'Carga #23','ALGODON Total','M-71 Total','A2 Total','31,723.2398','1,212','3125174']) assert.ok(result.text.includes(text),text);
  } finally { await parser.destroy(); }
});

test('PDF de varias páginas repite encabezados y conserva todas las producciones', async () => {
  const many = [{key:'many', allocations:Array.from({length:130},(_,index)=>({ ...fixture[0].allocations[0], codigoProduccion:`PROD-${String(index).padStart(3,'0')}` }))}];
  const parser = new PDFParse({data:await exportLoadReport(buildLoadReport(many,'kg'),24)});
  try {
    const result = await parser.getText();
    assert.ok(result.total>1);
    for (let index=0;index<130;index++) assert.ok(result.text.includes(`PROD-${String(index).padStart(3,'0')}`));
    for (const page of result.pages) {
      assert.ok(page.text.includes('Nombre Finca'));
      assert.ok(page.text.includes('10670'));
    }
    assert.ok(result.text.includes(`Página ${result.total} de ${result.total}`));
  } finally { await parser.destroy(); }
});

test('conversión a kilos y tabla sin asignaciones', () => {
  const kg = buildLoadReport(fixture,'kg');
  const pounds = buildLoadReport(fixture,'lbs');
  assert.ok(Math.abs(kg.rows.at(-1).cells[1].value*2.2046-pounds.rows.at(-1).cells[1].value)<1e-7);
  const empty=buildLoadReport([],'lbs');
  assert.equal(empty.rows.length,1); assert.equal(empty.rows[0].cells[2].value,0);
});
