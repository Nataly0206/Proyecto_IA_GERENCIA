export const ITEM_FIELDS = ['nombreClientePrincipal', 'nombreCliente', 'codigoItem', 'nombreItem', 'estiloFinal', 'marca', 'talla', 'empaque', 'tipoItem'] as const;
export type StockItem = Record<string, string | number | undefined> & {
  nombreClientePrincipal: string; nombreCliente: string; codigoItem: string; nombreItem: string;
  estiloFinal: string; marca: string; talla: string; empaque: string; tipoItem: string;
  disponibilidad: string; fechaProduccion: string; noOrdenCompra: string; codigoExterno: string;
  nombreFinca?: string; laguna?: string; color?: string; codigoProduccion?: string;
  pesoKilos: number; cantidadSerial: number;
};
export const itemKey = (item: StockItem) => JSON.stringify(ITEM_FIELDS.map(field => item[field]));
export interface Preload {
  revision: number;
  id: number; createdAt: string; createdBy?: string; notes: string; filters: Record<string, string[]>;
  items: { key: string; item: StockItem; requested: number; assigned: number; missing: number; pesoKilos: number; allocations: StockItem[] }[];
}
