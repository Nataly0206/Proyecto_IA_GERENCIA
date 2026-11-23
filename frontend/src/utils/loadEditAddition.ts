import type { StockItem } from '../types/preload';

export interface EditableLoadLot { key: string; item: StockItem; current: number; assigned: number; maximum: number }
export interface EditableLoadGroup { key: string; item: StockItem; inventoryTotal: number; requested: number; excludedLots: string[]; lots: EditableLoadLot[] }

/** Propone la asignación en el orden de antigüedad recibido del servidor. */
export function prepareLoadAddition(group: EditableLoadGroup, requested: number) {
  if (!Number.isSafeInteger(requested) || requested <= 0) throw new Error('Indica una cantidad entera mayor que cero.');
  let remaining = requested;
  const quantities: Record<string, string> = {};
  for (const lot of group.lots) {
    const assigned = Math.min(remaining, lot.current);
    quantities[lot.key] = String(assigned);
    remaining -= assigned;
  }
  return { quantities, missing: remaining };
}

/** Un lote agotado durante la edición sigue visible para revisar su cantidad. */
export function refreshAddedLoadGroup(previous: EditableLoadGroup, current?: EditableLoadGroup): EditableLoadGroup {
  const currentKeys = new Set(current?.lots.map(lot => lot.key));
  return { ...(current ?? previous), inventoryTotal: current?.inventoryTotal ?? 0,
    lots: [...(current?.lots ?? []), ...previous.lots.filter(lot => !currentKeys.has(lot.key)).map(lot => ({ ...lot, current: 0, maximum: 0, assigned: 0 }))] };
}
