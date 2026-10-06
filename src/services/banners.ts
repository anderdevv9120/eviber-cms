import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export interface Banner {
  _id: string;
  image: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  sortOrder: number;
  isActive: boolean;
  created_at?: string;
  updated_at?: string;
}
export type BannerInput = Pick<Banner, "image" | "title" | "isActive"> &
  Partial<Pick<Banner, "subtitle" | "ctaLabel" | "ctaHref">>;
export interface UploadedImage {
  path: string;
}

const inlineErrors = { toastError: false };
const bannerPath = (id: string) => `/banners/${encodeURIComponent(id)}`;

export const listBannersAPI = (signal?: AbortSignal): Promise<ApiResponse<Banner[]>> =>
  axiosRequest.get("/banners", { ...inlineErrors, signal });
export const createBannerAPI = (input: BannerInput): Promise<ApiResponse<Banner>> =>
  axiosRequest.post("/banners", input, inlineErrors);
export const updateBannerAPI = (
  id: string,
  input: Partial<BannerInput>
): Promise<ApiResponse<Banner>> => axiosRequest.patch(bannerPath(id), input, inlineErrors);
export const deleteBannerAPI = (id: string): Promise<ApiResponse<{ success: boolean }>> =>
  axiosRequest.delete(bannerPath(id), inlineErrors);
export const reorderBannersAPI = (bannerIds: string[]): Promise<ApiResponse<Banner[]>> =>
  axiosRequest.put("/banners/order", { bannerIds }, inlineErrors);
export const uploadImageAPI = (file: File): Promise<ApiResponse<UploadedImage>> => {
  const body = new FormData();
  body.append("image", file);
  // Upload chậm hơn request thường — timeout riêng như request.ts gợi ý
  return axiosRequest.post("/images/upload", body, { ...inlineErrors, timeout: 60_000 });
};
