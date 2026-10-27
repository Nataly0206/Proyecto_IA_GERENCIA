import { InventoryItem } from './inventory.service';
import { PlannedItem } from './preload-planner';
import { lotKey } from './load-edit';

/** Consume each saved allocation once, even if inventory has duplicate lot rows. */
export function subtractLoad(inventory: InventoryItem[], saved: PlannedItem[], client: string): InventoryItem[] {
  const deductions = new Map<string, number>();
  for (const group of saved) for (const lot of group.allocations) {
    if (lot.nombreCliente !== client) continue;
    const key = lotKey(lot);
    deductions.set(key, (deductions.get(key) ?? 0) + lot.cantidadSerial);
  }
  return inventory.map(item => {
    if (item.nombreCliente !== client || item.disponibilidad !== 'DISPONIBLE' || item.cantidadSerial <= 0) return item;
    const key = lotKey(item);
    const take = Math.min(item.cantidadSerial, deductions.get(key) ?? 0);
    deductions.set(key, (deductions.get(key) ?? 0) - take);
    return { ...item, parcial: take > 0 && take < item.cantidadSerial || item.parcial, cantidadSerial: item.cantidadSerial - take, pesoKilos: item.pesoKilos * (item.cantidadSerial - take) / item.cantidadSerial };
  });
}
