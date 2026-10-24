import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/order-fixtures";
import * as api from "./reports";

vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));
import { errorNotification } from "@/utils/notification";

const sales: api.SalesReport = {
  metadata: {
    from: "2026-10-01",
    to: "2026-10-07",
    timezone: "Asia/Ho_Chi_Minh",
    deliveredOnly: true,
    generatedAt: "2026-10-07T03:00:00.000Z"
  },
  ordersPlaced: 3,
  paidOrderCount: 1,
  unitsSold: 2,
  paidOrderValue: [{ currency: "VND", amount: 210000 }],
  receivedOrderValue: [{ currency: "VND", amount: 210000 }],
  netReceivedOrderValue: [{ currency: "VND", amount: 210000 }],
  refundedOrderCount: 0,
  refundedOrderValue: [],
  fulfillmentStatuses: {
    pending: 1,
    confirmed: 0,
    shipped: 0,
    delivered: 1,
    cancelled: 1,
    returned: 0,
    unknown: 0
  },
  paymentStatuses: { unpaid: 2, paid: 1, refunded: 0, failed: 0, not_required: 0, unknown: 0 },
  daily: [
    {
      receivedOrderValue: [],
      refundedOrderValue: [],
      netReceivedOrderValue: [],
      date: "2026-10-01",
      paidOrderCount: 1,
      unitsSold: 2,
      paidOrderValue: [{ currency: "VND", amount: 210000 }]
    }
  ],
  topProducts: [
    {
      productId: "p1",
      label: "Áo",
      missingLabel: false,
      unitsSold: 2,
      merchandiseValue: [{ currency: "VND", amount: 200000 }]
    }
  ],
  topSkus: [{ variantId: "v1", label: "", missingLabel: true, unitsSold: 2, merchandiseValue: [] }],
  excludedMonetaryData: { paidOrders: 0, refundedOrders: 0, receivedOrders: 0, items: 0 }
};
const dashboard: api.DashboardSummary = {
  metadata: { lowStockThreshold: 7, generatedAt: "2026-10-07T03:00:00.000Z" },
  orders: { pending: 4, awaitingShipment: 3, awaitingTransfer: 2, refundNeeded: 1 },
  catalog: { publishedProducts: 9, activeSkus: 20, lowStockSkus: 5, outOfStockSkus: 2 }
};

describe("report transport through the shared Axios client", () => {
  it("preserves free-order counts, units and merchandise snapshots with no paid value", async () => {
    const free: api.SalesReport = {
      ...sales,
      ordersPlaced: 1,
      paidOrderCount: 0,
      paidOrderValue: [],
      receivedOrderValue: [],
      netReceivedOrderValue: [],
      paymentStatuses: { unpaid: 0, paid: 0, refunded: 0, failed: 0, not_required: 1, unknown: 0 },
      daily: [
        {
          receivedOrderValue: [],
          refundedOrderValue: [],
          netReceivedOrderValue: [],
          date: "2026-10-01",
          paidOrderCount: 0,
          unitsSold: 2,
          paidOrderValue: []
        }
      ],
      topProducts: [
        { ...sales.topProducts[0], merchandiseValue: [{ currency: "VND", amount: 80000 }] }
      ]
    };
    axiosRequest.defaults.adapter = async config => response(config, free);
    expect(
      await api.getSalesReportAPI({ from: "2026-10-01", to: "2026-10-01", deliveredOnly: true })
    ).toEqual({
      data: free,
      message: "success"
    });
  });

  it("reads both report endpoints with exact query wire format, one envelope and cancellation", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      const body = { "/reports/sales": sales, "/reports/dashboard": dashboard }[config.url!];
      return response(config, body);
    };
    const signal = new AbortController().signal;
    expect(
      await api.getSalesReportAPI(
        { from: "2026-10-01", to: "2026-10-07", deliveredOnly: true },
        signal
      )
    ).toEqual({ data: sales, message: "success" });
    expect(await api.getDashboardAPI(signal)).toEqual({
      data: dashboard,
      message: "success"
    });
    const path = (config: InternalAxiosRequestConfig) =>
      axiosRequest.getUri(config).slice(axiosRequest.defaults.baseURL!.length);
    expect(calls.map(c => [c.method, path(c), c.signal, c.toastError])).toEqual([
      ["get", "/reports/sales?from=2026-10-01&to=2026-10-07&deliveredOnly=true", signal, false],
      ["get", "/reports/dashboard", signal, false]
    ]);
    expect(calls[0].headers.Authorization).toBe("Bearer test-admin");
  });

  it("sends deliveredOnly=false explicitly and no dashboard query", async () => {
    const uris: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      uris.push(axiosRequest.getUri(config).slice(axiosRequest.defaults.baseURL!.length));
      return response(config, {});
    };
    await api.getSalesReportAPI({ from: "2026-10-07", to: "2026-10-07", deliveredOnly: false });
    await api.getDashboardAPI();
    expect(uris).toEqual([
      "/reports/sales?from=2026-10-07&to=2026-10-07&deliveredOnly=false",
      "/reports/dashboard"
    ]);
  });

  it("keeps report read failures inline", async () => {
    axiosRequest.defaults.adapter = config =>
      Promise.reject(
        new AxiosError("bad", "ERR_BAD_REQUEST", config, null, {
          config,
          data: { message: "Khoảng ngày không hợp lệ" },
          status: 400,
          statusText: "Bad Request",
          headers: {}
        })
      );
    await expect(
      api.getSalesReportAPI({ from: "2026-10-07", to: "2026-10-01", deliveredOnly: false })
    ).rejects.toEqual(new ApiError("Khoảng ngày không hợp lệ", 400));
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
