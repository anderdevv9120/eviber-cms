import { ownerProfile } from "@/test/access-fixtures";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { clearSession } from "@/utils/session";
import { setCookies } from "@/utils/cookies";
import { ACCESS_TOKEN_KEY } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import type { AdminOrderDetail, OrderListResult } from "@/services/orders";

export const order: AdminOrderDetail = {
  _id: "order-id",
  orderNumber: "ORD-SNAPSHOT",
  userId: "customer-id",
  revision: 4,
  hasRefundLedger: true,
  refundSummary: {
    activeStages: [],
    paidAmount: 0,
    paidShippingAmount: 0,
    coverage: "none",
    requestCount: 0,
    reviewRequired: false
  },
  status: "pending",
  paymentStatus: "unpaid",
  created_at: "2026-10-04T00:00:00.000Z",
  updated_at: "2026-10-04T00:00:00.000Z",
  paymentDueAt: "2026-10-05T00:00:00.000Z",
  customerNote: "Giao buổi sáng",
  checkoutInfo: {
    subtotal: 200000,
    discountAmount: 20000,
    shippingFee: 30000,
    totalPrice: 210000,
    currency: "VND",
    couponCode: "SAVE10",
    couponDiscountPercentage: 10
  },
  shippingInfo: {
    name: "An Nguyễn",
    email: "an@example.test",
    phoneNumber: "0900000000",
    city: "Hồ Chí Minh",
    district: "Quận 1",
    ward: "Bến Nghé",
    specificAddress: "1 Đường A",
    note: "Gọi trước khi giao"
  },
  paymentInfo: { method: "BANK_TRANSFER", provider: "Bank", transactionId: "BANK-1" },
  productInfo: [
    {
      productId: "product-id",
      variantId: "variant-id",
      quantity: 2,
      productNameAtOrder: "Áo tại thời điểm mua",
      productSlugAtOrder: "ao",
      variantSkuAtOrder: "SKU-S",
      variantImageAtOrder: "https://example.test/snapshot.jpg",
      attributeValuesAtOrder: [{ name: "Kích thước", value: "S" }],
      priceAtOrder: 100000,
      originalPriceAtOrder: 120000
    }
  ],
  statusHistory: [
    {
      status: "pending",
      changedAt: "2026-10-04T00:00:00.000Z",
      changedBy: { actorType: "customer", actorId: "customer-id", actorName: "An" }
    }
  ],
  paymentHistory: [],
  actions: {
    orderStatuses: [
      {
        status: "confirmed",
        enabled: false,
        reason: "Cần thanh toán trước khi xác nhận",
        requiresNote: false
      },
      { status: "cancelled", enabled: true, reason: null, requiresNote: false }
    ],
    paymentActions: [
      { action: "receipt", enabled: true, reason: null, targets: ["paid"], requiresNote: false },
      {
        action: "refund",
        enabled: false,
        reason: "Chưa thanh toán",
        targets: [],
        requiresNote: false
      },
      {
        action: "correction",
        enabled: true,
        reason: null,
        targets: ["paid", "failed"],
        requiresNote: true
      }
    ],
    returnDeadline: null
  }
};
export const orderList = (
  data = [order],
  page = 1,
  total = data.length,
  pageSize = 10
): OrderListResult => ({
  data,
  page,
  pageSize,
  total,
  totalPage: Math.max(1, Math.ceil(total / pageSize))
});
export const response = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
  config,
  data: { data, message: "success" },
  status: 200,
  statusText: "OK",
  headers: {}
});
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

// Ant Design uses responsive media queries even in a jsdom component test.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
  if (!vi.isMockFunction(window.getComputedStyle)) {
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation(element => getStyle(element));
  }
  setCookies(ACCESS_TOKEN_KEY, "test-admin");
  useAppStore.getState().setProfile({
    _id: "admin-id",
    email: "admin@example.test",
    phone: "",
    status: "active",
    firstName: "Admin",
    lastName: "Test",
    roles: ["SUPER_ADMIN"],
    access: ownerProfile.access
  });
});
const originalAdapter = axiosRequest.defaults.adapter;
afterEach(() => {
  cleanup();
  clearSession();
  axiosRequest.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
