/** A blank order, zero or the display placeholder represents no purchase order. */
export const hasPurchaseOrder = (item: { noOrdenCompra: string }): boolean =>
  !!item.noOrdenCompra.trim() && !['sin orden', '0'].includes(item.noOrdenCompra.trim().toLowerCase());
