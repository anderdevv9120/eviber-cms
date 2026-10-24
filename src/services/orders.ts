import type { RefundFilter, RefundSummary } from "./refunds";
import type { ApiResponse } from "./auth";
import axiosRequest from "@/utils/request";

export type OrderStatus =
  "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "failed" | "not_required";
export type WritablePaymentStatus = Exclude<PaymentStatus, "not_required">;
export type PaymentAction = "receipt" | "refund" | "correction";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "E_WALLET" | "NO_PAYMENT";
export type OrderActorType = "customer" | "admin" | "system" | "webhook";
/** Current-state queues shared with dashboard counts; ANDed with the other list filters. */
export type OrderAttention = "awaiting-transfer" | "refund-needed";

export interface OrderActor {
  actorType: OrderActorType;
  actorId?: string;
  actorName?: string;
}
export interface StatusHistoryEntry {
  status: OrderStatus;
  changedAt?: string;
  changedBy?: OrderActor;
  note?: string;
}
export interface PaymentHistoryEntry {
  status: PaymentStatus;
  action?: PaymentAction;
  changedAt?: string;
  changedBy?: OrderActor;
  note?: string;
  reference?: string;
}
export interface OrderProduct {
  comboGroupId?: string;
  productId: string;
  variantId: string;
  quantity: number;
  productNameAtOrder?: string;
  productSlugAtOrder?: string;
  variantSkuAtOrder?: string;
  variantImageAtOrder?: string;
  attributeValuesAtOrder?: { name: string; value: string }[];
  priceAtOrder: number;
  originalPriceAtOrder: number;
}
export interface OrderCombo {
  comboGroupId: string;
  comboId: string;
  nameAtOrder: string;
  slugAtOrder?: string;
  imageAtOrder?: string;
  quantity: number;
  pricingModeAtOrder: "PERCENT" | "FIXED";
  pricingValueAtOrder: number;
  totalAtOrder: number;
}
export interface AdminOrderSummary {
  _id: string;
  // List rows only: null when the stored version is malformed. Detail/mutations always carry a number.
  revision: number | null;
  hasRefundLedger: boolean;
  refundSummary: RefundSummary;
  userId?: string;
  sessionId?: string;
  orderNumber?: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  paidAt?: string;
  paymentDueAt?: string;
  created_at?: string;
  updated_at?: string;
  customerNote?: string;
  checkoutInfo: {
    subtotal: number;
    discountAmount?: number;
    shippingFee?: number;
    totalPrice: number;
    couponCode?: string;
    couponName?: string;
    couponDiscountType?: "percentage" | "fixed_amount";
    couponDiscountValue?: number;
    couponDiscountPercentage?: number;
    currency?: string;
  };
  shippingInfo: {
    userAddressId?: string;
    name: string;
    phoneNumber: string;
    email: string;
    city: string;
    district?: string;
    ward: string;
    specificAddress: string;
    note?: string;
  };
  paymentInfo: {
    method: PaymentMethod;
    provider?: string;
    transactionId?: string;
    brand?: string;
    last4?: string;
  };
  productInfo: OrderProduct[];
  statusHistory?: StatusHistoryEntry[];
  paymentHistory?: PaymentHistoryEntry[];
}
export interface OrderActionEligibility {
  orderStatuses: {
    status: OrderStatus;
    enabled: boolean;
    reason: string | null;
    requiresNote: boolean;
  }[];
  paymentActions: {
    action: PaymentAction;
    enabled: boolean;
    reason: string | null;
    targets: WritablePaymentStatus[];
    requiresNote: boolean;
  }[];
  returnDeadline: string | null;
}
export interface AdminOrderDetail extends Omit<AdminOrderSummary, "revision"> {
  combos?: OrderCombo[];
  revision: number;
  actions: OrderActionEligibility;
}
export interface OrderListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  attention?: OrderAttention;
  refundStatus?: RefundFilter;
}
export interface OrderListResult {
  data: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}
export interface TransitionOrderInput {
  status: OrderStatus;
  expectedRevision: number;
  note?: string;
}
export interface UpdatePaymentInput {
  paymentStatus: WritablePaymentStatus;
  action: PaymentAction;
  expectedRevision: number;
  note?: string;
  reference?: string;
}

const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;
const inlineErrors = { toastError: false };

export const listOrdersAPI = (
  query: OrderListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<OrderListResult>> =>
  axiosRequest.get("/orders", { ...inlineErrors, params: query, signal });
export const getOrderAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<AdminOrderDetail>> =>
  axiosRequest.get(orderPath(id), { ...inlineErrors, signal });
export const transitionOrderAPI = (
  id: string,
  input: TransitionOrderInput
): Promise<ApiResponse<AdminOrderDetail>> =>
  axiosRequest.patch(`${orderPath(id)}/status`, input, inlineErrors);
export const updatePaymentAPI = (
  id: string,
  input: UpdatePaymentInput
): Promise<ApiResponse<AdminOrderDetail>> =>
  axiosRequest.patch(`${orderPath(id)}/payment-status`, input, inlineErrors);
