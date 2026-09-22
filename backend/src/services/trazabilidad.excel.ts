import ExcelJS from 'exceljs';
type DataRow = Record<string, unknown>;

const PALE = 'FFE0E0E0';
const BORDER = { style: 'thin' as const, color: { argb: 'FF222222' } };

export async function buildTrazabilidadExcel(rows: DataRow[], uk: boolean): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TRACEABILITY REPORT', { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.columns = (uk ? [38, 30, 13, 23, 12, 18, 16, 15, 16, 17] : [42, 20, 13, 23, 12, 17, 16, 16, 26, 21])
    .map((width) => ({ width }));
  const headers = uk
    ? ['Product', 'FARM', 'N° Laguna', 'Production Date', 'Code', 'Master', 'Net Lbs', 'Net Kg', 'Lot', 'Colour']
    : ['Item', 'Farm', 'N° Laguna', 'Production Date', 'Prod. Code', 'Master', 'Net Lbs', 'Net Kg', 'Lot', 'Lot Bandejas'];
  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = 'TRACEABILITY REPORT';
  if (uk) {
    sheet.getCell('A2').value = `Shipment: ${rows[0]?.codigoEmbarque ?? ''}`;
    sheet.mergeCells('B2:E2');
    sheet.getCell('B2').value = `PO: ${[...new Set(rows.map((r) => String(r.po ?? '')).filter(Boolean))].join(', ')}`;
    sheet.mergeCells('F2:J2');
    sheet.getCell('F2').value = `Container: ${rows[0]?.contenedor ?? ''}`;
  } else {
    sheet.mergeCells('A2:D2');
    sheet.getCell('A2').value = `SHIPMENT: ${rows[0]?.codigoEmbarque ?? ''}`;
    sheet.mergeCells('E2:J2');
    sheet.getCell('E2').value = `Container: ${rows[0]?.contenedor ?? ''}`;
  }
  sheet.getRow(3).values = headers;
  [1, 2, 3].forEach((n) => {
    const row = sheet.getRow(n);
    row.height = n === 1 ? 25 : 27;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: n === 1 ? 'FFFFFFFF' : PALE } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF111111' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    });
  });
  const addTotal = (label: string, group: DataRow[]) => {
    const row = sheet.addRow([label, null, null, null, null,
      group.reduce((sum, item) => sum + Number(item.master ?? 0), 0),
      group.reduce((sum, item) => sum + Number(item.libras ?? 0), 0),
      group.reduce((sum, item) => sum + Number(item.libras ?? 0), 0) / 2.20462,
    ]);
    sheet.mergeCells(`A${row.number}:E${row.number}`);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col <= 5 ? PALE : 'FFFFFFFF' } };
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF111111' } };
      cell.alignment = { vertical: 'middle', horizontal: col >= 6 && col <= 8 ? 'right' : 'left' };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    });
    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = uk ? '#,##0.0000' : '#,##0.00';
    row.getCell(8).numFmt = uk ? '#,##0.0000' : '#,##0.00';
  };
  const detailRows: { number: number; values: string[] }[] = [];
  rows.forEach((record, index) => {
    const pounds = Number(record.libras ?? 0);
    const lot = `${String(record.codigoItem ?? '').trim()}${String(record.po ?? '').trim()}`;
    const row = sheet.addRow([
      record.item, record.finca, record.laguna,
      record.fechaProduccion ? new Date(`${record.fechaProduccion}T00:00:00Z`) : null,
      record.codigoProduccion, Number(record.master ?? 0), pounds, pounds / 2.20462,
      lot || null, uk ? record.color : null,
    ]);
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF111111' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col <= 5 ? PALE : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: col >= 6 && col <= 8 ? 'right' : 'left' };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    });
    row.getCell(4).numFmt = 'dd-mmm-yyyy';
    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = uk ? '#,##0.0000' : '#,##0.00';
    row.getCell(8).numFmt = uk ? '#,##0.0000' : '#,##0.00';
    detailRows.push({
      number: row.number,
      values: [record.item, record.finca, record.laguna, record.fechaProduccion]
        .map((value) => String(value ?? '')),
    });
    const next = rows[index + 1];
    if (!next || next.item !== record.item) {
      const group = rows.filter((item) => item.item === record.item);
      addTotal(`${record.item} Total`, group);
    }
  });
  for (let col = 1; col <= 4; col += 1) {
    for (let start = 0; start < detailRows.length;) {
      let end = start;
      while (end + 1 < detailRows.length
        && detailRows[end + 1].number === detailRows[end].number + 1
        && detailRows[end + 1].values.slice(0, col).every((value, i) => value === detailRows[start].values[i])) {
        end += 1;
      }
      if (end > start && detailRows[start].values[col - 1]) {
        sheet.mergeCells(detailRows[start].number, col, detailRows[end].number, col);
        sheet.getCell(detailRows[start].number, col).alignment = {
          horizontal: 'center', vertical: 'middle', wrapText: true,
        };
      }
      start = end + 1;
    }
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
