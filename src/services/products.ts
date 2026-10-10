import type { ApiResponse } from "./auth";
import axiosRequest from "@/utils/request";

export type ProductStatus = "PUBLISH" | "UNPUBLISH" | "DRAFT" | "DELETED";
export type ProductVariantStatus = "ACTIVE" | "INACTIVE";
export type PublishRequirement = "ACTIVE_VARIANT" | "IMAGE" | "CATEGORY" | "DESCRIPTION";
export interface ProductDimensions {
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
}
export interface ProductSeo {
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
}
export interface ProductListQuery {
  q?: string;
  status?: ProductStatus;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}
export interface ProductListRow {
  _id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  image: string | null;
  variantCount: number;
  activeVariantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  totalStock: number;
  revision: number;
  updated_at: string;
}
export interface ProductListResult {
  data: ProductListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}
export interface ProductEditorOption {
  attributeId: string;
  attributeName: string;
  values: { _id: string; value: string; meta?: string | null }[];
}
export interface ProductEditorVariant {
  _id: string;
  sku: string;
  price: number;
  originalPrice: number;
  inventoryCount: number;
  image: string | null;
  dimensions: ProductDimensions;
  status: ProductVariantStatus;
  attributeValues: string[];
}
export interface ProductEditorView {
  _id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string;
  images: string[];
  categoryIds: string[];
  seo: Required<ProductSeo>;
  options: ProductEditorOption[];
  variants: ProductEditorVariant[];
  revision: number;
  updated_at: string;
}
export interface CategoryOption {
  _id: string;
  name: string;
}
export interface ProductVariantInput {
  _id?: string;
  sku: string;
  price: number;
  originalPrice: number;
  image?: string | null;
  dimensions?: ProductDimensions;
  status: ProductVariantStatus;
  attributeValues: string[];
  inventoryCount?: number;
}
export interface ProductWriteInput {
  name: string;
  slug?: string;
  description?: string | null;
  images: string[];
  categoryIds: string[];
  seo?: ProductSeo;
  status?: Exclude<ProductStatus, "DELETED">;
  options: { attributeId: string; optionValues: string[] }[];
  variants: ProductVariantInput[];
}
export type ProductUpdateInput = Omit<ProductWriteInput, "status"> & { expectedRevision: number };
export interface ProductStatusInput {
  status: ProductStatus;
  expectedRevision: number;
}

const inlineErrors = { toastError: false };
const productPath = (id: string) => `/products/${encodeURIComponent(id)}`;

export const listProductsAPI = (
  { q, status, categoryId, page, pageSize }: ProductListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<ProductListResult>> =>
  axiosRequest.get("/products", {
    ...inlineErrors,
    params: { q, status, categoryId, page, pageSize },
    signal
  });
export const getProductAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<ProductEditorView>> =>
  axiosRequest.get(productPath(id), { ...inlineErrors, signal });
export const createProductAPI = (
  input: ProductWriteInput
): Promise<ApiResponse<ProductEditorView>> => axiosRequest.post("/products", input, inlineErrors);
export const updateProductAPI = (
  id: string,
  input: ProductUpdateInput
): Promise<ApiResponse<ProductEditorView>> =>
  axiosRequest.put(productPath(id), input, inlineErrors);
export const changeProductStatusAPI = (
  id: string,
  input: ProductStatusInput
): Promise<ApiResponse<ProductEditorView>> =>
  axiosRequest.patch(`${productPath(id)}/status`, input, inlineErrors);
export const listProductCategoriesAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<CategoryOption[]>> =>
  axiosRequest.get("/categories", { ...inlineErrors, signal });
