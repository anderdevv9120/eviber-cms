import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export type CheckoutSettings = { allowGuestCheckout: boolean };

export const getCheckoutSettingsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<CheckoutSettings>> =>
  axiosRequest.get("/checkout-settings", { toastError: false, signal });

export const updateCheckoutSettingsAPI = ({
  allowGuestCheckout
}: CheckoutSettings): Promise<ApiResponse<CheckoutSettings>> =>
  axiosRequest.patch("/checkout-settings", { allowGuestCheckout }, { toastError: false });
