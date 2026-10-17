import type { ApiResponse } from "./auth";
import type { ProductStatus, ProductVariantStatus } from "./products";
import axiosRequest from "@/utils/request";

// Mirrors backend src/modules-admin/inventory/inventory-admin.types.ts.
export type InventoryStockFilter = "all" | "low" | "out";
export type StockMovementReason = "order" | "cancel_restock" | "return" | "manual_adjust";
export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  sku: string;
  attributeLabels: string[];
  image: string | null;
  variantStatus: ProductVariantStatus;
  inventoryCount: number;
}
export interface InventoryList {
  data: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  metadata: { lowStockThreshold: number; stock: InventoryStockFilter };
}
export interface InventoryMovement {
  id: string;
  createdAt: string;
  reason: StockMovementReason;
  delta: number;
  stockAfter: number;
  note: string | null;
  actor: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
}
export interface InventoryMovementList {
  data: InventoryMovement[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  variant: InventoryRow;
}
export interface AdjustStockResult {
  row: InventoryRow;
  movement: InventoryMovement;
}

export interface InventoryQuery {
  search?: string;
  productId?: string;
  productStatus?: Exclude<ProductStatus, "DELETED">;
  variantStatus?: ProductVariantStatus;
  stock?: InventoryStockFilter;
  lowStockThreshold?: number;
  page?: number;
  pageSize?: number;
}
export interface AdjustStockRequest {
  delta: number;
  note?: string;
  expectedCurrent?: number;
}

const inlineErrors = { toastError: false };
const variantPath = (variantId: string) => `/inventory/${encodeURIComponent(variantId)}`;

export const getInventoryAPI = (
  query: InventoryQuery,
  signal?: AbortSignal
): Promise<ApiResponse<InventoryList>> =>
  axiosRequest.get("/inventory", { ...inlineErrors, params: query, signal });
export const getInventoryMovementsAPI = (
  variantId: string,
  query: { page?: number; pageSize?: number },
  signal?: AbortSignal
): Promise<ApiResponse<InventoryMovementList>> =>
  axiosRequest.get(`${variantPath(variantId)}/movements`, {
    ...inlineErrors,
    params: query,
    signal
  });
export const adjustStockAPI = (
  variantId: string,
  body: AdjustStockRequest
): Promise<ApiResponse<AdjustStockResult>> =>
  axiosRequest.post(`${variantPath(variantId)}/adjustments`, body, inlineErrors);
