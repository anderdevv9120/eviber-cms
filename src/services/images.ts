import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export interface UploadedImage {
  path: string;
}

export const uploadImageAPI = (file: File): Promise<ApiResponse<UploadedImage>> => {
  const body = new FormData();
  body.append("image", file);
  // Upload chậm hơn request thường — timeout riêng như request.ts gợi ý
  return axiosRequest.post("/images/upload", body, { toastError: false, timeout: 60_000 });
};
