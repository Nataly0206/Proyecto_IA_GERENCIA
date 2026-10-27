import { InventoryItem } from './inventory.service';

export const ITEM_FIELDS = ['nombreClientePrincipal', 'nombreCliente', 'codigoItem', 'nombreItem', 'estiloFinal', 'marca', 'talla', 'empaque', 'tipoItem'] as const;
export const itemKey = (item: InventoryItem) => JSON.stringify(ITEM_FIELDS.map(field => item[field]));
export interface LoadLine { key: string; quantity: number }
export interface PlannedItem {
  key: string; excludedLots?: string[]; item: InventoryItem; requested: number; assigned: number; missing: number; pesoKilos: number; allocations: InventoryItem[];
}

export function planPreload(inventory: InventoryItem[], filters: Record<string, string[]>, lines: LoadLine[]): PlannedItem[] {
  const eligible = inventory.filter(item => !!item.noOrdenCompra.trim()
    && !['sin orden', '0'].includes(item.noOrdenCompra.trim().toLowerCase())
    && item.disponibilidad === 'DISPONIBLE'
    && item.cantidadSerial > 0 && Number.isFinite(item.pesoKilos) && item.pesoKilos >= 0
    && Object.entries(filters).every(([field, values]) => !values.length || values.includes(String(item[field as keyof InventoryItem]))));
  return lines.map(line => {
    const candidates = eligible.filter(item => itemKey(item) === line.key).sort((a, b) => {
      const date = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : Infinity; };
      return (date(a.fechaProduccion) - date(b.fechaProduccion)) || a.noOrdenCompra.localeCompare(b.noOrdenCompra) || a.codigoExterno.localeCompare(b.codigoExterno);
    });
    const identity = JSON.parse(line.key) as string[];
    const description = candidates[0] ?? inventory.find(item => itemKey(item) === line.key) ?? {
      ...Object.fromEntries(ITEM_FIELDS.map((field, index) => [field, identity[index]])),
      disponibilidad: 'SIN EXISTENCIA', fechaProduccion: '', noOrdenCompra: '', codigoExterno: '', pesoKilos: 0, cantidadSerial: 0,
    } as InventoryItem;
    let remaining = line.quantity;
    const allocations: InventoryItem[] = [];
    for (const item of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, item.cantidadSerial);
      allocations.push({ ...item, cantidadSerial: quantity, pesoKilos: item.pesoKilos * quantity / item.cantidadSerial });
      remaining -= quantity;
    }
    return { key: line.key, item: description, requested: line.quantity, assigned: line.quantity - remaining, missing: remaining, pesoKilos: allocations.reduce((sum, item) => sum + item.pesoKilos, 0), allocations };
  });
}
