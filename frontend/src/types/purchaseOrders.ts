export interface PurchaseOrderLine {
  contractNumber: string; client: string; itemCode: string; product: string; size: string;
  pendingKg: number; pendingMasters: number; delayWeeks: number;
}
export interface PurchaseOrdersResponse {
  generatedAt: string | null; updatedAt: string | null; fetchedAt: string; lines: PurchaseOrderLine[];
}
export interface PurchaseOrder {
  key: string; contractNumber: string; client: string; lines: PurchaseOrderLine[];
  pendingKg: number; pendingMasters: number; delayWeeks: number;
}
