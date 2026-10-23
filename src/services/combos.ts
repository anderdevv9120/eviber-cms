import type { ApiResponse } from "./auth";
import axiosRequest from "@/utils/request";

import type { ProductStatus, ProductSeo } from "./products";

export type ComboItemMode = "LOCKED" | "CHOOSE";
export interface ComboPricing {
  mode: "PERCENT" | "FIXED";
  value: number;
}
export type ComboAvailability = "AVAILABLE" | "OUT_OF_STOCK" | "HIDDEN";
export type ComboPublishRequirement = "CATEGORY" | "PIECE_PUBLISHED" | "LOCKED_VARIANT_ACTIVE";
export interface ComboIssue {
  productId: string;
  productName: string | null;
  kind:
    "PRODUCT_MISSING" | "PRODUCT_NOT_PUBLISHED" | "LOCKED_VARIANT_INACTIVE" | "NO_ACTIVE_VARIANT";
}
export interface ComboListQuery {
  search?: string;
  status?: ProductStatus | "ACTIVE_SET";
  attention?: "true";
  page?: number;
  pageSize?: number;
}
export interface ComboProductOptionsQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}
export interface ComboListRow {
  _id: string;
  name: string;
  slug: string;
  image: string | null;
  status: ProductStatus;
  pricing: ComboPricing;
  priceRange: { min: number; max: number } | null;
  availability: ComboAvailability;
  issues: ComboIssue[];
  revision: number;
  updated_at: string;
}
export interface ComboListResult {
  data: ComboListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}
export interface ComboProductOption {
  _id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  image: string | null;
  variants: {
    _id: string;
    sku: string;
    price: number;
    originalPrice: number;
    status: string;
    inventoryCount: number;
    attributeLabels: string[];
  }[];
}
export interface ComboEditorView {
  _id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string;
  images: string[];
  categoryIds: string[];
  seo: Required<ProductSeo>;
  pricing: ComboPricing;
  items: {
    productId: string;
    quantity: number;
    mode: ComboItemMode;
    variantId: string | null;
    product: ComboProductOption | null;
  }[];
  availability: ComboAvailability;
  issues: ComboIssue[];
  publishMissing: ComboPublishRequirement[];
  revision: number;
  updated_at: string;
}
export interface ComboWriteInput {
  name: string;
  slug?: string | null;
  description?: string | null;
  images: string[];
  categoryIds: string[];
  seo?: ProductSeo;
  items: { productId: string; quantity: number; mode: ComboItemMode; variantId?: string | null }[];
  pricing: ComboPricing;
}
export interface ComboRef {
  _id: string;
  name: string;
  status: ProductStatus;
}

const inlineErrors = { toastError: false };
const comboPath = (id: string) => `/combos/${encodeURIComponent(id)}`;

export const listCombosAPI = (
  { search, status, attention, page, pageSize }: ComboListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<ComboListResult>> =>
  axiosRequest.get("/combos", {
    ...inlineErrors,
    params: { search, status, attention, page, pageSize },
    signal
  });
export const getComboAPI = (id: string): Promise<ApiResponse<ComboEditorView>> =>
  axiosRequest.get(comboPath(id), inlineErrors);
export const createComboAPI = (input: ComboWriteInput): Promise<ApiResponse<ComboEditorView>> =>
  axiosRequest.post("/combos", input, inlineErrors);
export const updateComboAPI = (
  id: string,
  input: ComboWriteInput & { expectedRevision: number }
): Promise<ApiResponse<ComboEditorView>> => axiosRequest.put(comboPath(id), input, inlineErrors);
export const changeComboStatusAPI = (
  id: string,
  input: { status: ProductStatus; expectedRevision: number }
): Promise<ApiResponse<ComboEditorView>> =>
  axiosRequest.patch(`${comboPath(id)}/status`, input, inlineErrors);
export const listComboProductOptionsAPI = (
  { search, page, pageSize }: ComboProductOptionsQuery,
  signal?: AbortSignal
): Promise<
  ApiResponse<{
    data: ComboProductOption[];
    total: number;
    page: number;
    pageSize: number;
    totalPage: number;
  }>
> =>
  axiosRequest.get("/combos/product-options", {
    ...inlineErrors,
    params: { search, page, pageSize },
    signal
  });
export const listAffectedCombosAPI = (
  productId: string
): Promise<ApiResponse<{ combos: ComboRef[] }>> =>
  axiosRequest.get("/combos/affected", { ...inlineErrors, params: { productId } });
