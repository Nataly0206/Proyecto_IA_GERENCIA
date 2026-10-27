import { InventoryItem } from './inventory.service';
import { PlannedItem, itemKey } from './preload-planner';
import { ApiError } from '../middleware/errorHandler';

export const lotKey = (item: InventoryItem) => JSON.stringify([itemKey(item), item.noOrdenCompra, item.fechaProduccion, item.codigoExterno, item.nombreFinca ?? '', item.laguna ?? '', item.color ?? '', item.codigoProduccion ?? '']);
export interface EditLine { key: string; requested: number; excludedLots?: string[]; allocations: { key: string; quantity: number }[] }
export interface EditableLot { key: string; item: InventoryItem; current: number; assigned: number; maximum: number }
function grouped(items: InventoryItem[]) {
  const result = new Map<string, InventoryItem>();
  for (const item of items) {
    const key = lotKey(item); const old = result.get(key);
    result.set(key, old ? { ...old, cantidadSerial: old.cantidadSerial + item.cantidadSerial, pesoKilos: old.pesoKilos + item.pesoKilos } : { ...item });
  }
  return result;
}
export function editCandidates(saved: PlannedItem[], inventory: InventoryItem[]) {
  const live = grouped(inventory.filter(item => item.disponibilidad === 'DISPONIBLE' && item.cantidadSerial > 0 && Number.isFinite(item.pesoKilos) && item.pesoKilos >= 0 && !!item.noOrdenCompra.trim() && !['sin orden', '0'].includes(item.noOrdenCompra.trim().toLowerCase())));
  return saved.map(group => {
    const previous = grouped(group.allocations);
    const keys = new Set([...previous.keys(), ...[...live].filter(([, item]) => itemKey(item) === group.key).map(([key]) => key)]);
    const lots: EditableLot[] = [...keys].map(key => {
      const current = live.get(key); const old = previous.get(key);
      return { key, item: current ?? old!, current: current?.cantidadSerial ?? 0, assigned: old?.cantidadSerial ?? 0, maximum: Math.max(current?.cantidadSerial ?? 0, old?.cantidadSerial ?? 0) };
    }).sort((a, b) => Number(!!a.item.parcial) - Number(!!b.item.parcial) || a.item.fechaProduccion.localeCompare(b.item.fechaProduccion) || a.item.noOrdenCompra.localeCompare(b.item.noOrdenCompra));
    return { key: group.key, item: group.item, requested: group.requested, excludedLots: group.excludedLots ?? [], lots };
  });
}
export function applyLoadEdit(saved: PlannedItem[], inventory: InventoryItem[], lines: EditLine[]): PlannedItem[] {
  if (!Array.isArray(lines) || lines.length !== saved.length || new Set(lines.map(line => line?.key)).size !== lines.length) throw new ApiError(400, 'Revisa los ítems de la carga.');
  const candidates = editCandidates(saved, inventory);
  return saved.map(group => {
    const line = lines.find(entry => entry?.key === group.key);
    if (!line || !Number.isSafeInteger(line.requested) || line.requested < 0 || !Array.isArray(line.allocations) || line.allocations.length > 5000 || new Set(line.allocations.map(entry => entry?.key)).size !== line.allocations.length) throw new ApiError(400, 'Revisa las cantidades solicitadas y las producciones.');
    const excluded = line.excludedLots ?? [];
    if (!Array.isArray(excluded) || excluded.length > 5000 || excluded.some(key => typeof key !== 'string' || key.length > 10000)) throw new ApiError(400, 'Las producciones excluidas no son válidas.');
    const lots = new Map(candidates.find(entry => entry.key === group.key)!.lots.map(lot => [lot.key, lot]));
    const previous = grouped(group.allocations);
    const allocations: InventoryItem[] = [];
    for (const choice of line.allocations) {
      if (!choice || typeof choice.key !== 'string' || !Number.isSafeInteger(choice.quantity) || choice.quantity < 0) throw new ApiError(400, 'Las cantidades deben ser enteros positivos o cero.');
      if (!choice.quantity) continue;
      const lot = lots.get(choice.key);
      if (!lot || choice.quantity > lot.maximum) throw new ApiError(409, 'La existencia de una producción cambió. Actualiza las existencias y revisa la carga.');
      const old = previous.get(choice.key);
      const kept = Math.min(choice.quantity, old?.cantidadSerial ?? 0);
      const added = choice.quantity - kept;
      const weight = (old && old.cantidadSerial ? old.pesoKilos * kept / old.cantidadSerial : 0) + (added ? lot.item.pesoKilos * added / lot.item.cantidadSerial : 0);
      allocations.push({ ...lot.item, availableSerial: Math.max(choice.quantity, old?.availableSerial ?? lot.current), cantidadSerial: choice.quantity, pesoKilos: weight });
    }
    const assigned = allocations.reduce((sum, item) => sum + item.cantidadSerial, 0);
    if (assigned > line.requested) throw new ApiError(400, `La cantidad asignada supera lo solicitado para ${group.item.nombreItem}.`);
    allocations.sort((a, b) => a.fechaProduccion.localeCompare(b.fechaProduccion) || a.noOrdenCompra.localeCompare(b.noOrdenCompra));
    return { ...group, initialStock: [...lots.values()].map(lot => {
      const original = group.initialStock?.filter(item => lotKey(item) === lot.key).reduce((sum, item) => sum + item.cantidadSerial, 0);
      return { ...lot.item, cantidadSerial: Math.max(original ?? 0, lot.current, previous.get(lot.key)?.availableSerial ?? 0) };
    }), excludedLots: [...new Set(excluded)], requested: line.requested, assigned, missing: line.requested - assigned, pesoKilos: allocations.reduce((sum, item) => sum + item.pesoKilos, 0), allocations };
  });
}
