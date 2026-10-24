import type { ApiResponse } from "./auth";
import type { OrderStatus, PaymentStatus } from "./orders";
import axiosRequest from "@/utils/request";

// Mirrors backend src/modules-admin/report/report-admin.types.ts.
export interface CurrencyTotal {
  currency: string;
  amount: number;
}
export interface DailySales {
  date: string;
  paidOrderCount: number;
  unitsSold: number;
  paidOrderValue: CurrencyTotal[];
  receivedOrderValue: CurrencyTotal[];
  refundedOrderValue: CurrencyTotal[];
  netReceivedOrderValue: CurrencyTotal[];
}
interface BestSeller {
  label: string;
  missingLabel: boolean;
  unitsSold: number;
  merchandiseValue: CurrencyTotal[];
}
export interface BestSellingProduct extends BestSeller {
  productId: string;
}
export interface BestSellingSku extends BestSeller {
  variantId: string;
}
export interface SalesReport {
  metadata: {
    from: string;
    to: string;
    timezone: "Asia/Ho_Chi_Minh";
    deliveredOnly: boolean;
    generatedAt: string;
  };
  ordersPlaced: number;
  paidOrderCount: number;
  unitsSold: number;
  paidOrderValue: CurrencyTotal[];
  receivedOrderValue: CurrencyTotal[];
  netReceivedOrderValue: CurrencyTotal[];
  refundedOrderCount: number;
  refundedOrderValue: CurrencyTotal[];
  fulfillmentStatuses: Record<OrderStatus | "unknown", number>;
  paymentStatuses: Record<PaymentStatus | "unknown", number>;
  daily: DailySales[];
  topProducts: BestSellingProduct[];
  topSkus: BestSellingSku[];
  excludedMonetaryData: {
    paidOrders: number;
    refundedOrders: number;
    receivedOrders: number;
    items: number;
  };
}
export interface DashboardSummary {
  metadata: { lowStockThreshold: number; generatedAt: string };
  orders: {
    pending: number;
    awaitingShipment: number;
    awaitingTransfer: number;
    refundNeeded: number;
  };
  catalog: {
    publishedProducts: number;
    activeSkus: number;
    lowStockSkus: number;
    outOfStockSkus: number;
  };
}
/** Vietnam calendar dates (YYYY-MM-DD), both inclusive. */
export interface SalesReportQuery {
  from: string;
  to: string;
  deliveredOnly: boolean;
}
const inlineErrors = { toastError: false };

export const getSalesReportAPI = (
  query: SalesReportQuery,
  signal?: AbortSignal
): Promise<ApiResponse<SalesReport>> =>
  axiosRequest.get("/reports/sales", { ...inlineErrors, params: query, signal });
// Ngưỡng sắp hết hàng dùng mặc định của BE (5), trùng mặc định màn Tồn kho mà các số đếm link sang
export const getDashboardAPI = (signal?: AbortSignal): Promise<ApiResponse<DashboardSummary>> =>
  axiosRequest.get("/reports/dashboard", { ...inlineErrors, signal });
