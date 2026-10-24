import type { RefundFilter } from "@/services/refunds";
import { matchPath } from "react-router";
import { PATH } from "@/constants/paths";
import type { OrderAttention, OrderListQuery, OrderStatus, PaymentStatus } from "@/services/orders";
import {
  orderAttentionLabels,
  orderStatusLabels,
  paymentStatusLabels,
  refundStatusLabels
} from "./order-display";

/** Repeated keys invalidate only that field; unknown keys never reach the API. */
export function parseOrderListQuery(params: URLSearchParams): OrderListQuery {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const page = single("page");
  const pageSize = single("pageSize");
  const search = single("search")?.trim();
  const status = single("status");
  const paymentStatus = single("paymentStatus");
  const attention = single("attention");
  const refundStatus = single("refundStatus");
  const query: OrderListQuery = {
    page:
      page && /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) && Number(page) > 0
        ? Number(page)
        : 1,
    pageSize: pageSize && ["10", "20", "50"].includes(pageSize) ? Number(pageSize) : 10
  };
  // URLSearchParams replaces invalid UTF-8 with U+FFFD; do not submit that search.
  if (search && !search.includes("\uFFFD")) query.search = search;
  if (status && Object.prototype.hasOwnProperty.call(orderStatusLabels, status))
    query.status = status as OrderStatus;
  if (paymentStatus && Object.prototype.hasOwnProperty.call(paymentStatusLabels, paymentStatus))
    query.paymentStatus = paymentStatus as PaymentStatus;
  if (attention && Object.prototype.hasOwnProperty.call(orderAttentionLabels, attention))
    query.attention = attention as OrderAttention;
  if (refundStatus && Object.prototype.hasOwnProperty.call(refundStatusLabels, refundStatus))
    query.refundStatus = refundStatus as RefundFilter;
  return query;
}

/** Default values stay implicit so unfiltered lists retain their plain URLs. */
export function serializeOrderListQuery(query: OrderListQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of [
    "page",
    "pageSize",
    "search",
    "status",
    "paymentStatus",
    "attention",
    "refundStatus"
  ] as const) {
    const value = query[key];
    if (value !== undefined) params.set(key, String(value));
  }
  const normalized = parseOrderListQuery(params);
  const result = new URLSearchParams();
  if (normalized.page !== 1) result.set("page", String(normalized.page));
  if (normalized.pageSize !== 10) result.set("pageSize", String(normalized.pageSize));
  if (normalized.search) result.set("search", normalized.search);
  if (normalized.status) result.set("status", normalized.status);
  if (normalized.paymentStatus) result.set("paymentStatus", normalized.paymentStatus);
  if (normalized.attention) result.set("attention", normalized.attention);
  if (normalized.refundStatus) result.set("refundStatus", normalized.refundStatus);
  return result;
}

// Customer detail pages validate their own query (email, nested returnTo), so it passes through as-is
export const isCustomerOrigin = (path: string): boolean =>
  !!matchPath(PATH.CUSTOMER_DETAIL, path) || path === PATH.GUEST_BUYER_DETAIL;

export function safeOrderReturnTo(value: string | null): string {
  if (!value || value.includes("#")) return PATH.ORDER;
  const separator = value.indexOf("?");
  const path = separator < 0 ? value : value.slice(0, separator);
  if (isCustomerOrigin(path)) return value;
  if (path !== PATH.ORDER) return PATH.ORDER;
  const params = new URLSearchParams(separator < 0 ? "" : value.slice(separator + 1));
  const query = serializeOrderListQuery(parseOrderListQuery(params)).toString();
  return query ? `${path}?${query}` : path;
}

// Order detail, sidebar and breadcrumb must agree on where "back" goes; a repeated returnTo is ignored
export function readOrderReturnTo(search: string): { returnTo: string; fromCustomer: boolean } {
  const params = new URLSearchParams(search);
  const returnTo = safeOrderReturnTo(
    params.getAll("returnTo").length === 1 ? params.get("returnTo") : null
  );
  return { returnTo, fromCustomer: isCustomerOrigin(returnTo.split("?")[0]) };
}
