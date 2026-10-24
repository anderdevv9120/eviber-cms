import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export interface RefundPolicy {
  enabled: boolean;
  windowDays: number;
  revision: number;
}

const inlineErrors = { toastError: false };

export const getRefundPolicyAPI = (signal?: AbortSignal): Promise<ApiResponse<RefundPolicy>> =>
  axiosRequest.get("/refund-policy", { ...inlineErrors, signal });

export const saveRefundPolicyAPI = (input: {
  enabled: boolean;
  windowDays: number;
  expectedRevision: number;
}): Promise<ApiResponse<RefundPolicy>> => axiosRequest.patch("/refund-policy", input, inlineErrors);
