import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";
import type { CategoryOption } from "./products";

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  revision: number;
  productCount: number;
  couponCount: number;
  comboCount: number;
  updated_at?: string;
}
export interface CategoryInput {
  name: string;
  /** `null`/bỏ trống → BE tự sinh slug từ tên */
  slug?: string | null;
  description?: string;
  imageUrl: string;
}

const inlineErrors = { toastError: false };
const categoryPath = (id: string) => `/categories/${encodeURIComponent(id)}`;

export const listCategoriesAPI = (signal?: AbortSignal): Promise<ApiResponse<Category[]>> =>
  axiosRequest.get("/categories", { ...inlineErrors, signal });
export const listCategoryOptionsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<CategoryOption[]>> =>
  axiosRequest.get("/categories/options", { ...inlineErrors, signal });
export const createCategoryAPI = (input: CategoryInput): Promise<ApiResponse<Category>> =>
  axiosRequest.post("/categories", input, inlineErrors);
export const updateCategoryAPI = (
  id: string,
  input: CategoryInput & { revision: number }
): Promise<ApiResponse<Category>> => axiosRequest.put(categoryPath(id), input, inlineErrors);
export const deleteCategoryAPI = (id: string): Promise<ApiResponse<boolean>> =>
  axiosRequest.delete(categoryPath(id), inlineErrors);
export const reorderCategoriesAPI = (categoryIds: string[]): Promise<ApiResponse<Category[]>> =>
  axiosRequest.put("/categories/order", { categoryIds }, inlineErrors);
