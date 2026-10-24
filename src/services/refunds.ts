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

// Mirrors backend refund.interface.ts JSON contracts.
export type RefundStage =
  | "awaiting_review"
  | "awaiting_return"
  | "awaiting_payout"
  | "payout_in_progress"
  | "refunded"
  | "rejected";

export type RefundCoverage = "none" | "partial" | "full";

export type RefundFilter = RefundStage | "partially_refunded" | "fully_refunded" | "no_requests";

export type RefundReason = "ordinary" | "missing_item" | "incorrect_item" | "other";

export type RefundRange = { allocationId: string; start: number; quantity: number };

export type RefundSummary = {
  activeStages: RefundStage[];
  paidAmount: number;
  paidShippingAmount: number;
  coverage: RefundCoverage;
  requestCount: number;
  reviewRequired: boolean;
};

export type RefundSelection = {
  allocationId: string;
  quantity: number;
  reason: RefundReason;
  explanation: string;
  requestedReturn: "return" | "no_return";
  evidenceIds: string[];
};

export type SubmitRefundInput = { idempotencyKey: string; items: RefundSelection[] };

export type RefundCommand = { expectedRevision: number; idempotencyKey: string };

export type RefundDecisionInput = RefundCommand & {
  items: {
    allocationId: string;
    approvedQuantity: number;
    returnRequired: boolean;
    reason: string;
  }[];
  shippingAmount: number;
  customerMessage: string;
  internalNote?: string;
};

export type RefundInspectionInput = RefundCommand & {
  items: {
    allocationId: string;
    receivedQuantity: number;
    sellableQuantity: number;
    confirmedPurchasedVariant: boolean;
  }[];
  note: string;
};

export type RefundPayoutInput = RefundCommand & {
  claimId: string;
  amount: number;
  paidAt: string;
  reference: string;
};

export type RefundLegacyReviewInput = RefundCommand & {
  deliveredAt?: string;
  receivedAmount: number;
  allocations: { productInfoIndex: number; netAmount: number }[];
  shippingAmount: number;
  reason: string;
};

export type RefundOrderAllocationView = {
  allocationId: string;
  productInfoIndex: number;
  productName: string;
  variantLabel: string | null;
  purchasedQuantity: number;
  availableQuantity: number;
  requestedQuantity: number;
  refundedQuantity: number;
  netAmount: number;
  availableAmount: number;
  requestedAmount: number;
  refundedAmount: number;
  productRefundEnabled: boolean;
};

export type CustomerRefundRequestItem = {
  allocationId: string;
  productInfoIndex: number;
  quantity: number;
  reason: RefundReason;
  explanation: string;
  requestedReturn: "return" | "no_return";
  evidenceIds: string[];
  approvedQuantity: number;
  approvedAmount: number;
  returnRequired: boolean;
  receivedQuantity: number;
};

export type CustomerRefundRequestHistoryEntry = {
  event: string;
  at: string;
  customerMessage: string | null;
};

export type CustomerRefundRequest = {
  requestId: string;
  stage: RefundStage;
  submittedAt: string;
  items: CustomerRefundRequestItem[];
  shipping: { reservedAmount: number; approvedAmount: number };
  history: CustomerRefundRequestHistoryEntry[];
  payout: { amount: number; paidAt: string } | null;
};

export type AdminRefundRequestItem = CustomerRefundRequestItem & {
  netAmount: number;
  approvedQuantity: number;
  approvedAmount: number;
  returnRequired: boolean;
  decisionReason: string | null;
  receivedQuantity: number;
  sellableQuantity: number;
  ranges: RefundRange[];
};

export type RefundInspectionItemView = {
  allocationId: string;
  receivedQuantity: number;
  sellableQuantity: number;
  confirmedPurchasedVariant: boolean;
  restockSkippedReason: string | null;
};

export type RefundInspectionView = {
  at: string;
  note: string;
  items: RefundInspectionItemView[];
};

export type RefundApprovalView = {
  merchandiseAmount: number;
  shippingAmount: number;
  amount: number;
  frozenAt: string;
};

export type RefundClaimView = {
  claimId: string;
  claimedAt: string;
  merchandiseAmount: number;
  shippingAmount: number;
  amount: number;
};

export type RefundPayoutView = {
  merchandiseAmount: number;
  shippingAmount: number;
  amount: number;
  paidAt: string;
  recordedAt: string;
  reference: string;
};

export type AdminRefundRequest = Omit<CustomerRefundRequest, "items"> & {
  items: AdminRefundRequestItem[];
  exceptionReason: string | null;
  reviewRequired: boolean;
  inspections: RefundInspectionView[];
  approval: RefundApprovalView | null;
  claim: RefundClaimView | null;
  payout: RefundPayoutView | null;
};

export type RefundOrderView = {
  orderId: string;
  orderNumber: string;
  revision: number;
  policy: Pick<RefundPolicy, "enabled" | "windowDays"> | null;
  deadline: string | null;
  eligibility: { eligible: boolean; reviewRequired: boolean; reason: string | null };
  allocations: RefundOrderAllocationView[];
  remainingPaidShipping: number;
  summary: RefundSummary;
  requests: CustomerRefundRequest[];
};

export type AdminRefundOrderView = Omit<RefundOrderView, "requests"> & {
  requests: AdminRefundRequest[];
  canReview: boolean;
  canPay: boolean;
};

export type CreateAdminRefundInput = SubmitRefundInput &
  RefundCommand & {
    exceptionReason: string;
    shippingOnly?: boolean;
  };
export type RefundReleaseInput = RefundCommand & {
  claimId: string;
  bankOutcome: "not_transferred";
  reason: string;
};

const refundsPath = (id: string) => `/orders/${encodeURIComponent(id)}/refunds`;
const requestPath = (id: string, requestId: string) =>
  `${refundsPath(id)}/${encodeURIComponent(requestId)}`;

export const getOrderRefundsAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.get(refundsPath(id), { ...inlineErrors, signal });
export const createAdminRefundAPI = (
  id: string,
  input: CreateAdminRefundInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(refundsPath(id), input, inlineErrors);
export const reviewLegacyRefundAPI = (
  id: string,
  input: RefundLegacyReviewInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`/orders/${encodeURIComponent(id)}/refund-legacy-review`, input, inlineErrors);
export const decideRefundAPI = (
  id: string,
  requestId: string,
  input: RefundDecisionInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`${requestPath(id, requestId)}/decision`, input, inlineErrors);
export const inspectRefundAPI = (
  id: string,
  requestId: string,
  input: RefundInspectionInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`${requestPath(id, requestId)}/inspections`, input, inlineErrors);
export const claimRefundPayoutAPI = (
  id: string,
  requestId: string,
  input: RefundCommand
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`${requestPath(id, requestId)}/payout-claim`, input, inlineErrors);
export const releaseRefundPayoutAPI = (
  id: string,
  requestId: string,
  input: RefundReleaseInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`${requestPath(id, requestId)}/payout-release`, input, inlineErrors);
export const recordRefundPayoutAPI = (
  id: string,
  requestId: string,
  input: RefundPayoutInput
): Promise<ApiResponse<AdminRefundOrderView>> =>
  axiosRequest.post(`${requestPath(id, requestId)}/payout`, input, inlineErrors);
