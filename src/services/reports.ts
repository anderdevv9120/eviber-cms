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
  refundedOrderCount: number;
  refundedOrderValue: CurrencyTotal[];
  fulfillmentStatuses: Record<OrderStatus | "unknown", number>;
  paymentStatuses: Record<PaymentStatus | "unknown", number>;
  daily: DailySales[];
  topProducts: BestSellingProduct[];
  topSkus: BestSellingSku[];
  excludedMonetaryData: { paidOrders: number; refundedOrders: number; items: number };
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
export type StockStatus = "low" | "out";
export interface StockRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  inventoryCount: number;
}
export interface StockReport {
  metadata: { lowStockThreshold: number; stockStatus: StockStatus; generatedAt: string };
  data: StockRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

/** Vietnam calendar dates (YYYY-MM-DD), both inclusive. */
export interface SalesReportQuery {
  from: string;
  to: string;
  deliveredOnly: boolean;
}
export interface DashboardQuery {
  lowStockThreshold?: number;
}
export interface StockReportQuery extends DashboardQuery {
  stockStatus?: StockStatus;
  page?: number;
  pageSize?: number;
}

const inlineErrors = { toastError: false };

export const getSalesReportAPI = (
  query: SalesReportQuery,
  signal?: AbortSignal
): Promise<ApiResponse<SalesReport>> =>
  axiosRequest.get("/reports/sales", { ...inlineErrors, params: query, signal });
export const getDashboardAPI = (
  query: DashboardQuery,
  signal?: AbortSignal
): Promise<ApiResponse<DashboardSummary>> =>
  axiosRequest.get("/reports/dashboard", { ...inlineErrors, params: query, signal });
export const getStockReportAPI = (
  query: StockReportQuery,
  signal?: AbortSignal
): Promise<ApiResponse<StockReport>> =>
  axiosRequest.get("/reports/stock", { ...inlineErrors, params: query, signal });
