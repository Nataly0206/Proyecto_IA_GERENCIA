import PDFDocument from 'pdfkit';
import { PlannedItem } from './preload-planner';

export interface ReportCell { column: number; text?: string; value?: number; rowSpan: number; colSpan: number }
export interface ReportRow { kind: 'detail' | 'subtotal' | 'total'; cells: ReportCell[] }
export interface LoadReport { headers: string[]; rows: ReportRow[]; unit: 'kg' | 'lbs' }
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
  return { unit, headers: ['N° Orden Compra', 'Codigo Item', 'Nombre Item', 'Nombre Finca', 'N° Laguna', 'Fecha Produccion', 'Color', 'Cód Prod.', unit === 'lbs' ? 'Peso Libras' : 'Peso Kilos', 'Cantidad Serial'], rows };
}

export function exportLoadReport(report: LoadReport, id: number, createdAt: string | Date = new Date()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 24,
      info: { Title: `Carga ${id}`, Author: 'Dashboard Gerencial' } });
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
      doc.fontSize(9).text(`Carga #${id}`, margin, 78);
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
      doc.fontSize(8).text(`Página ${pageIndex + 1} de ${pages.length}`, margin, doc.page.height - 40, { width, align: 'right', lineBreak: false });
      doc.fontSize(8.5);
    });
    doc.end();
  });
}
