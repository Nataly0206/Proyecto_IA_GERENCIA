import PDFDocument from 'pdfkit';
import { PlannedItem } from './preload-planner';

export interface ReportCell { column: number; text?: string; value?: number; rowSpan: number; colSpan: number }
export interface ReportRow { kind: 'detail' | 'subtotal' | 'total'; cells: ReportCell[] }
export interface PartialCode { code: string; order: string; item: string; available: number; loaded: number; remaining: number }
export interface LoadReport { partialCodes: PartialCode[]; headers: string[]; rows: ReportRow[]; unit: 'kg' | 'lbs' }
interface Node { label: string; children: Map<string, Node>; kg: number; quantity: number }
const cell = (column: number, text: string, rowSpan = 1, colSpan = 1): ReportCell => ({ column, text, rowSpan, colSpan });
const numberCell = (column: number, value: number): ReportCell => ({ column, value, rowSpan: 1, colSpan: 1 });
const formatDate = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || '—';
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${String(date.getUTCDate()).padStart(2, '0')}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
};

/** Presentation only: does not change saved FIFO allocations. */
export function buildLoadReport(items: PlannedItem[], unit: 'kg' | 'lbs'): LoadReport {
  const root: Node = { label: '', children: new Map(), kg: 0, quantity: 0 };
  for (const group of items) for (const item of group.allocations) {
    const values = [item.noOrdenCompra, item.codigoItem, item.nombreItem, item.nombreFinca, item.laguna,
      item.fechaProduccion, item.color, item.codigoProduccion || item.codigoExterno].map(value => value || '—');
    let node = root;
    node.kg += item.pesoKilos; node.quantity += item.cantidadSerial;
    values.forEach((value, depth) => {
      // Keep different client/packing identities separate even if their visible item names coincide.
      const key = depth === 2 ? JSON.stringify([value, group.key]) : value;
      if (!node.children.has(key)) node.children.set(key, { label: value, children: new Map(), kg: 0, quantity: 0 });
      node = node.children.get(key)!;
      node.kg += item.pesoKilos; node.quantity += item.cantidadSerial;
    });
  }
  const factor = unit === 'lbs' ? 2.2046 : 1;
  const amounts = (node: Node) => [numberCell(8, node.kg * factor), numberCell(9, node.quantity)];
  const render = (node: Node, depth: number): ReportRow[] => {
    if (depth === 7) return [{ kind: 'detail', cells: [cell(depth, node.label), ...amounts(node)] }];
    const children = [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
    const rows = children.flatMap(child => render(child, depth + 1));
    if (!rows.length) return [];
    rows[0].cells.unshift(cell(depth, depth === 5 ? formatDate(node.label) : node.label, rows.length));
    // Item subtotal is always present. Inner subtotal only where this dimension branches.
    if (depth === 2 || (depth >= 3 && depth <= 6 && children.length > 1)) {
      rows.push({ kind: 'subtotal', cells: [cell(depth, `${depth === 5 ? formatDate(node.label) : node.label} Total`, 1, 8 - depth), ...amounts(node)] });
    }
    return rows;
  };
  const rows = [...root.children.values()].sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })).flatMap(node => render(node, 0));
  rows.push({ kind: 'total', cells: [cell(0, 'Grand Total', 1, 8), ...amounts(root)] });
  const codes = new Map<string, PartialCode & { known: boolean }>();
  for (const group of items) for (const allocation of group.allocations) {
    const code = allocation.codigoProduccion || allocation.codigoExterno || '—';
    const key = JSON.stringify([group.key, allocation.noOrdenCompra, code]);
    const row = codes.get(key) ?? { code, order: allocation.noOrdenCompra, item: allocation.nombreItem, available: 0, loaded: 0, remaining: 0, known: true };
    row.available += allocation.availableSerial ?? allocation.cantidadSerial;
    row.loaded += allocation.cantidadSerial;
    row.known = row.known && allocation.availableSerial !== undefined;
    row.remaining = Math.max(0, row.available - row.loaded);
    codes.set(key, row);
  }
  for (const group of items) if (group.initialStock) {
    const stock = new Map<string, number>();
    for (const allocation of group.initialStock) {
      const key = JSON.stringify([group.key, allocation.noOrdenCompra, allocation.codigoProduccion || allocation.codigoExterno || '—']);
      stock.set(key, (stock.get(key) ?? 0) + allocation.cantidadSerial);
    }
    for (const [key, available] of stock) {
      const row = codes.get(key);
      if (row) { row.available = available; row.known = true; row.remaining = Math.max(0, available - row.loaded); }
    }
  }
  const partialCodes = [...codes.values()].filter(row => row.known && row.loaded > 0 && row.remaining > 0);
  return { partialCodes, unit, headers: ['N° Orden Compra', 'Codigo Item', 'Nombre Item', 'Nombre Finca', 'N° Laguna', 'Fecha Produccion', 'Color', 'Cód Prod.', unit === 'lbs' ? 'Peso Libras' : 'Peso Kilos', 'Cantidad Serial'], rows };
}

export function exportLoadReport(report: LoadReport, id: number, createdAt: string | Date = new Date(), reference = ''): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 24, bufferPages: true,
      info: { Title: `PRECARGA${reference.trim() ? ' ' + reference.trim() : ''}`, Author: 'Dashboard Gerencial' } });
    const buffers: Buffer[] = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    const margin = 24;
    const width = doc.page.width - margin * 2;
    const weights = [180, 180, 375, 210, 115, 180, 100, 120, 145, 145];
    const factor = width / weights.reduce((sum, value) => sum + value, 0);
    const columns = [margin];
    weights.forEach(value => columns.push(columns[columns.length - 1] + value * factor));
    doc.font('Helvetica').fontSize(8.5);
    const textFor = (entry: ReportCell) => entry.value === undefined ? entry.text ?? ''
      : entry.value.toLocaleString('en-US', { minimumFractionDigits: entry.column === 8 ? 4 : 0, maximumFractionDigits: entry.column === 8 ? 4 : 0 });
    const heights = report.rows.map(() => 19);
    // Reserve actual text height before pagination, including merged cells.
    report.rows.forEach((row, index) => row.cells.forEach(entry => {
      const available = heights.slice(index, index + entry.rowSpan).reduce((sum, value) => sum + value, 0);
      const needed = doc.heightOfString(textFor(entry), { width: columns[entry.column + entry.colSpan] - columns[entry.column] - 6 }) + 7;
      if (needed > available) heights[index + entry.rowSpan - 1] += needed - available;
    }));
    const timestamp = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Tegucigalpa', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(new Date(createdAt)).replace(', ', ' ');
    const bodyTop = 124;
    const bodyBottom = doc.page.height - 52;
    const pages: { start: number; end: number }[] = [];
    let start = 0;
    while (start < report.rows.length) {
      let end = start; let height = 0;
      while (end < report.rows.length && height + heights[end] <= bodyBottom - bodyTop) height += heights[end++];
      if (end === start) end++;
      // Keep a final subtotal or grand total with the preceding detail where possible.
      if (end < report.rows.length && report.rows[end].kind !== 'detail' && end > start + 1) end--;
      pages.push({ start, end }); start = end;
    }
    const drawCell = (x: number, y: number, w: number, h: number, text: string, numeric = false) => {
      doc.rect(x, y, w, h).fillAndStroke(numeric ? '#ffffff' : '#e0e0e0', '#000000');
      doc.fillColor('#000000').text(text, x + 3, y + 3, { width: w - 6, height: h - 5, align: numeric ? 'right' : 'left', lineBreak: true });
    };
    doc.lineWidth(0.6);
    pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) doc.addPage();
      doc.fontSize(19).fillColor('#000000').text('SERVICE AND TRADING BUSINESS S.A. DE C.V.', margin, 24, { width, align: 'center' });
      doc.fontSize(13).text(`INVENTARIO ACTUAL COMPLETADO MAS SOBRANTES a la fecha ${timestamp}`, margin, 51, { width });
      if (reference.trim()) doc.fontSize(9).text(`PRECARGA ${reference.trim()}`, margin, 76, { width, height: 12, ellipsis: true });
      doc.fontSize(8.5);
      drawCell(columns[8], 90, columns[10] - columns[8], 17, 'Grand Total');
      report.headers.forEach((header, index) => drawCell(columns[index], 107, columns[index + 1] - columns[index], 17, header));
      const positions = [bodyTop];
      for (let r = page.start; r < page.end; r++) positions.push(positions[positions.length - 1] + heights[r]);
      // Clip merged cells to each page and repeat their labels on continuation pages.
      report.rows.forEach((row, rowIndex) => row.cells.forEach(entry => {
        const first = Math.max(page.start, rowIndex);
        const last = Math.min(page.end, rowIndex + entry.rowSpan);
        if (first >= last) return;
        const y = positions[first - page.start];
        const h = positions[last - page.start] - y;
        drawCell(columns[entry.column], y, columns[entry.column + entry.colSpan] - columns[entry.column], h, textFor(entry), entry.column >= 8);
      }));

      doc.fontSize(8.5);
    });
    // Place the partial-code section below the final total, flowing to new pages.
    let y = bodyTop + heights.slice(pages[pages.length - 1].start).reduce((sum, h) => sum + h, 0) + 18;
    const partialWidths = [width * .25, width * .25, width / 6, width / 6, width / 6];
    const sectionHeader = () => {
      doc.font('Helvetica-Bold').fontSize(11).text('Códigos parciales', margin, y, { width }); y += 19;
      doc.font('Helvetica').fontSize(9).text('Códigos tomados parcialmente de su existencia inicial. Cantidades en seriales.', margin, y, { width }); y += 20;
      let x = margin;
      ['Código / Orden', 'Producto', 'Disponible', 'En carga', 'Inventario final'].forEach((label, i) => { drawCell(x, y, partialWidths[i], 22, label); x += partialWidths[i]; }); y += 22;
    };
    if (y + 100 > bodyBottom) { doc.addPage(); y = margin; }
    sectionHeader();
    if (!report.partialCodes.length) doc.text('No hay códigos parciales registrados en esta carga.', margin, y + 4, { width });
    for (const row of report.partialCodes) {
      const values = [`${row.code} / ${row.order}`, row.item, row.available.toLocaleString('en-US'), row.loaded.toLocaleString('en-US'), row.remaining.toLocaleString('en-US')];
      const h = Math.max(22, ...values.map((value, i) => doc.heightOfString(value, { width: partialWidths[i] - 6 }) + 8));
      if (y + h > bodyBottom) { doc.addPage(); y = margin; sectionHeader(); }
      let x = margin;
      values.forEach((value, i) => { drawCell(x, y, partialWidths[i], h, value, i >= 2); x += partialWidths[i]; }); y += h;
    }
    const range = doc.bufferedPageRange();
    for (let page = 0; page < range.count; page++) {
      doc.switchToPage(page);
      doc.fontSize(8).text(`Página ${page + 1} de ${range.count}`, margin, doc.page.height - 40, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
