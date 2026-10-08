import type { ApiResponse } from "./auth";
import axiosRequest from "@/utils/request";

export type CouponDiscountType = "percentage" | "fixed_amount";
export type CouponScope = "all" | "products" | "categories";
export type CouponAvailability = "disabled" | "expired" | "scheduled" | "exhausted" | "active";
export interface CouponTarget {
  _id: string;
  name: string;
  slug?: string;
}
export interface SelectedCouponTarget {
  _id: string;
  name: string | null;
  unavailable: boolean;
}
export interface CouponRuleSnapshot {
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
  scopeType: CouponScope;
  scopeProductIds: string[];
  scopeCategoryIds: string[];
}
export interface AdminCouponSummary {
  _id: string;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  discountValue: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  remainingUses: number | null;
  availability: CouponAvailability;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface AdminCouponDetail extends AdminCouponSummary, CouponRuleSnapshot {
  selectedProducts: SelectedCouponTarget[];
  selectedCategories: SelectedCouponTarget[];
}
export interface AdminCouponRedemption {
  _id: string;
  couponId: string;
  couponCode: string;
  couponRevision: number;
  rulesSnapshot: CouponRuleSnapshot;
  orderId: string;
  orderNumber: string;
  userId: string;
  email: string;
  displayName: string;
  eligibleSubtotal: number;
  discountAmount: number;
  consumedAt: string;
  state: "counted" | "released";
  releasedAt?: string;
  releaseReason?: string;
}
export interface CouponInput {
  code: string;
  name: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  scopeType?: CouponScope;
  scopeProductIds?: string[];
  scopeCategoryIds?: string[];
  startDate: string;
  endDate: string;
  isActive?: boolean;
  usageLimit?: number | null;
  perUserLimit?: number | null;
}
export type CouponPatchInput = Partial<Omit<CouponInput, "code">> & { expectedRevision: number };
export interface VoucherTargetQuery {
  page: number;
  pageSize: number;
  search?: string;
}
export interface VoucherListQuery extends VoucherTargetQuery {
  availability?: CouponAvailability;
}
export interface VoucherRedemptionQuery {
  page: number;
  pageSize: number;
  state?: "counted" | "released";
}
export interface VoucherPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

const inlineErrors = { toastError: false };
const voucherPath = (id: string) => `/coupons/${encodeURIComponent(id)}`;
const ruleInput = ({
  name,
  discountType,
  discountValue,
  maxDiscountAmount,
  minOrderAmount,
  scopeType,
  scopeProductIds,
  scopeCategoryIds,
  startDate,
  endDate,
  isActive,
  usageLimit,
  perUserLimit
}: Partial<CouponInput>): Partial<Omit<CouponInput, "code">> => ({
  name,
  discountType,
  discountValue,
  maxDiscountAmount,
  minOrderAmount,
  scopeType,
  scopeProductIds,
  scopeCategoryIds,
  startDate,
  endDate,
  isActive,
  usageLimit,
  perUserLimit
});

export const listVouchersAPI = (
  { page, pageSize, search, availability }: VoucherListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<VoucherPage<AdminCouponSummary>>> =>
  axiosRequest.get("/coupons", {
    ...inlineErrors,
    params: { page, pageSize, search, availability },
    signal
  });
export const createVoucherAPI = (input: CouponInput): Promise<ApiResponse<AdminCouponDetail>> =>
  axiosRequest.post("/coupons", { code: input.code, ...ruleInput(input) }, inlineErrors);
export const getVoucherAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<AdminCouponDetail>> =>
  axiosRequest.get(voucherPath(id), { ...inlineErrors, signal });
export const updateVoucherAPI = (
  id: string,
  patch: CouponPatchInput
): Promise<ApiResponse<AdminCouponDetail>> =>
  axiosRequest.patch(
    voucherPath(id),
    { ...ruleInput(patch), expectedRevision: patch.expectedRevision },
    inlineErrors
  );
export const listVoucherRedemptionsAPI = (
  id: string,
  { page, pageSize, state }: VoucherRedemptionQuery,
  signal?: AbortSignal
): Promise<ApiResponse<VoucherPage<AdminCouponRedemption>>> =>
  axiosRequest.get(`${voucherPath(id)}/redemptions`, {
    ...inlineErrors,
    params: { page, pageSize, state },
    signal
  });
export const listVoucherProductTargetsAPI = (
  { page, pageSize, search }: VoucherTargetQuery,
  signal?: AbortSignal
): Promise<ApiResponse<VoucherPage<CouponTarget>>> =>
  axiosRequest.get("/coupons/targets/products", {
    ...inlineErrors,
    params: { page, pageSize, search },
    signal
  });
export const listVoucherCategoryTargetsAPI = (
  { page, pageSize, search }: VoucherTargetQuery,
  signal?: AbortSignal
): Promise<ApiResponse<VoucherPage<CouponTarget>>> =>
  axiosRequest.get("/coupons/targets/categories", {
    ...inlineErrors,
    params: { page, pageSize, search },
    signal
  });
