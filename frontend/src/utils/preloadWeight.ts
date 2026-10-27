import { StockItem } from '../types/preload';

/** Same FIFO order and proportional weights as the server proposal. */
export function requestedWeight(items: StockItem[], quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
  const date = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : Infinity; };
  const sorted = [...items].sort((a, b) => Number(!!a.parcial) - Number(!!b.parcial) || (date(a.fechaProduccion) - date(b.fechaProduccion)) || a.noOrdenCompra.localeCompare(b.noOrdenCompra) || a.codigoExterno.localeCompare(b.codigoExterno));
  let remaining = quantity;
  let weight = 0;
  for (const item of sorted) {
    if (remaining <= 0) break;
    if (item.cantidadSerial <= 0) continue;
    const take = Math.min(remaining, item.cantidadSerial);
    weight += item.pesoKilos * take / item.cantidadSerial;
    remaining -= take;
  }
  return weight;
}
