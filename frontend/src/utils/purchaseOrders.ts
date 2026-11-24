import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchaseOrders';

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterPurchaseOrders(lines: PurchaseOrderLine[], filters: { search: string; client: string; size: string; delay: string }) {
  const terms = normalized(filters.search).trim().split(/\s+/).filter(Boolean);
  return lines.filter(line => (!filters.client || line.client === filters.client) && (!filters.size || line.size === filters.size)
    && (!filters.delay || (filters.delay === 'late' ? line.delayWeeks > 0 : line.delayWeeks === 0))
    && terms.every(term => normalized([line.contractNumber, line.client, line.itemCode, line.product, line.size].join(' ')).includes(term)));
}
export function groupPurchaseOrders(lines: PurchaseOrderLine[]): PurchaseOrder[] {
  const orders = new Map<string, PurchaseOrder>();
  for (const line of lines) {
    const key = JSON.stringify([line.client, line.contractNumber]);
    const order = orders.get(key) ?? { key, contractNumber: line.contractNumber, client: line.client, lines: [], pendingKg: 0, pendingMasters: 0, delayWeeks: 0 };
    order.lines.push(line);
    order.pendingKg += line.pendingKg;
    order.pendingMasters += line.pendingMasters;
    order.delayWeeks = Math.max(order.delayWeeks, line.delayWeeks);
    orders.set(key, order);
  }
  return [...orders.values()].sort((a, b) => b.delayWeeks - a.delayWeeks || a.contractNumber.localeCompare(b.contractNumber, 'es') || a.client.localeCompare(b.client, 'es'));
}
