import "@/test/attribute-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import type { PermissionCode } from "@/constants/permissions";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { order, response, deferred } from "@/test/order-fixtures";
import type { AdminRefundOrderView } from "@/services/refunds";
import { missingOrderData } from "./order-display";
import OrderDetail from "./OrderDetail";

type Adapter = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;
const refundView: AdminRefundOrderView = {
  orderId: "order-id",
  orderNumber: "ORD-SNAPSHOT",
  revision: 4,
  policy: { enabled: true, windowDays: 7 },
  deadline: null,
  eligibility: { eligible: false, reviewRequired: false, reason: null },
  allocations: [],
  remainingPaidShipping: 0,
  summary: {
    activeStages: [],
    paidAmount: 0,
    paidShippingAmount: 0,
    coverage: "none",
    requestCount: 0,
    reviewRequired: false
  },
  requests: [],
  canReview: false,
  canPay: false
};
// The refund section reads its own endpoints; these tests count order reads and writes only.
let serveRefunds: Adapter | undefined;
beforeEach(() => useAppStore.getState().setProfile(ownerProfile));
afterEach(() => {
  serveRefunds = undefined;
});

const renderDetail = (path = "/orders/order-id") => {
  const orderAdapter = axiosRequest.defaults.adapter as Adapter;
  axiosRequest.defaults.adapter = async config =>
    config.url?.includes("/refunds")
      ? (serveRefunds ?? (async () => response(config, refundView)))(config)
      : orderAdapter(config);
  const router = createMemoryRouter([{ path: "/orders/:orderId", element: <OrderDetail /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
};

describe("shared order detail", () => {
  it("RBAC preserves an already-open refund draft when both refund grants are removed", async () => {
    useAppStore.getState().setProfile(staffProfile(["ORDER_READ"]));
    axiosRequest.defaults.adapter = async config => response(config, order);
    serveRefunds = async config =>
      response(config, {
        ...refundView,
        canReview: true,
        eligibility: { eligible: false, reviewRequired: true, reason: null }
      });
    renderDetail();
    await screen.findByRole("region", { name: "Thông tin đơn hàng" });
    expect(screen.queryByRole("region", { name: "Hoàn tiền" })).toBeNull();
    await act(async () =>
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW"]))
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Đối soát đơn cũ" }, { timeout: 5000 })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Lý do đối soát" }), {
      target: { value: "Unsaved refund reason" }
    });
    await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
    expect(
      (screen.getByRole("textbox", { name: "Lý do đối soát" }) as HTMLInputElement).value
    ).toBe("Unsaved refund reason");
    expect(
      (
        within(screen.getByRole("form", { name: "Đối soát đơn cũ" })).getByRole("button", {
          name: "Xác nhận đối soát"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
  it.each<[PermissionCode[], boolean, boolean]>([
    [["ORDER_READ"], false, false],
    [["ORDER_READ", "ORDER_UPDATE"], true, false],
    [["ORDER_READ", "ORDER_PAYMENT_UPDATE"], false, true]
  ])(
    "RBAC separates fulfillment/payment grants %j and never fetches refunds",
    async (permissions, fulfillment, payment) => {
      useAppStore.getState().setProfile(staffProfile(permissions));
      axiosRequest.defaults.adapter = async config => response(config, order);
      const refundFetch = vi.fn(async config => response(config, refundView));
      serveRefunds = refundFetch;
      renderDetail();
      await screen.findByRole("region", { name: "Thông tin đơn hàng" });
      expect(Boolean(screen.queryByRole("button", { name: "Hủy đơn hàng" }))).toBe(fulfillment);
      expect(Boolean(screen.queryByRole("button", { name: "Ghi nhận thanh toán" }))).toBe(payment);
      expect(screen.queryByRole("button", { name: "Xác nhận đơn hàng" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Hoàn tiền" })).toBeNull();
      expect(refundFetch).not.toHaveBeenCalled();
      expect(screen.queryByRole("link", { name: "Khách hàng đăng ký" })).toBeNull();
    }
  );
  it("RBAC denies null profile actions and refund reads", async () => {
    useAppStore.getState().clearProfile();
    axiosRequest.defaults.adapter = async config => response(config, order);
    const refundFetch = vi.fn(async config => response(config, refundView));
    serveRefunds = refundFetch;
    renderDetail();
    await screen.findByRole("region", { name: "Thông tin đơn hàng" });
    expect(screen.queryByRole("button", { name: "Hủy đơn hàng" })).toBeNull();
    expect(refundFetch).not.toHaveBeenCalled();
  });
  it("expands a combo snapshot into merged pieces with exact totals and no split unit price", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        combos: [
          {
            comboGroupId: "group-a",
            comboId: "combo-id",
            nameAtOrder: "Combo tại thời điểm mua",
            quantity: 1,
            pricingModeAtOrder: "FIXED",
            pricingValueAtOrder: 400000,
            totalAtOrder: 400000
          }
        ],
        productInfo: [
          {
            ...order.productInfo[0],
            comboGroupId: "group-a",
            quantity: 1,
            priceAtOrder: 123018,
            originalPriceAtOrder: 159000
          },
          {
            ...order.productInfo[0],
            comboGroupId: "group-a",
            quantity: 1,
            priceAtOrder: 123017,
            originalPriceAtOrder: 159000
          },
          {
            ...order.productInfo[0],
            comboGroupId: "group-a",
            variantId: "bag",
            productNameAtOrder: "Túi lúc mua",
            variantSkuAtOrder: "BAG",
            quantity: 1,
            priceAtOrder: 153965,
            originalPriceAtOrder: 199000
          }
        ]
      });
    renderDetail();
    const products = within(await screen.findByRole("region", { name: "Sản phẩm đã mua" }));
    const comboRow = within(products.getByRole("row", { name: /Combo tại thời điểm mua/ }));
    expect(comboRow.getByText("400.000 ₫")).toBeTruthy();
    expect(comboRow.getByText("1")).toBeTruthy();
    expect(products.queryByText("Áo tại thời điểm mua")).toBeNull();
    fireEvent.click(comboRow.getByRole("button", { name: /expand/i }));
    const pieceRow = within(products.getByRole("row", { name: /SKU-S/ }));
    const headers = products.getAllByRole("columnheader").map(header => header.textContent);
    expect(pieceRow.getAllByRole("cell")[headers.indexOf("Đơn giá lúc mua")].textContent).toBe("—");
    for (const text of ["2", "246.035 ₫", "Kích thước: S", "159.000 ₫"])
      expect(pieceRow.getByText(text)).toBeTruthy();
    expect(
      within(products.getByRole("row", { name: /BAG/ })).getAllByText("153.965 ₫")
    ).toHaveLength(2);
    expect(products.getAllByRole("row", { name: /SKU-S/ })).toHaveLength(1);
  });

  it("displays the free-payment state and only enabled fulfillment actions", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        paymentStatus: "not_required",
        paymentInfo: { method: "NO_PAYMENT" },
        paidAt: undefined,
        paymentDueAt: undefined,
        checkoutInfo: { ...order.checkoutInfo, totalPrice: 0 },
        actions: {
          ...order.actions,
          orderStatuses: order.actions.orderStatuses.map(action => ({
            ...action,
            enabled: true,
            reason: null
          })),
          paymentActions: order.actions.paymentActions.map(action => ({
            ...action,
            enabled: false,
            targets: [],
            reason: "Đơn hàng không cần thanh toán"
          }))
        }
      });
    renderDetail();
    const payment = within(await screen.findByRole("region", { name: "Thông tin thanh toán" }));
    expect(payment.getAllByText("Không cần thanh toán")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Tổng tiền" })).getByText("0 ₫")).toBeTruthy();
    for (const name of [
      "Ghi nhận thanh toán",
      "Ghi nhận hoàn tiền",
      "Điều chỉnh trạng thái thanh toán"
    ])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận đơn hàng" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hủy đơn hàng" })).toBeTruthy();
  });
  it("shows a fixed voucher from the stored order snapshot, not a percentage", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        checkoutInfo: {
          ...order.checkoutInfo,
          discountAmount: 50000,
          totalPrice: 180000,
          couponCode: "SAVE50K",
          couponName: "Giảm 50K",
          couponDiscountType: "fixed_amount",
          couponDiscountValue: 50000,
          couponDiscountPercentage: undefined
        }
      });
    renderDetail();
    const totals = within(await screen.findByRole("region", { name: "Tổng tiền" }));
    expect(totals.getByText("SAVE50K")).toBeTruthy();
    expect(totals.getByText("Mức giảm của mã")).toBeTruthy();
    expect(totals.getAllByText("50.000 ₫")).toHaveLength(2);
    expect(totals.queryByText(/%/)).toBeNull();
  });
  it("renders purchase snapshots, quantity totals, stored checkout and recipient/payment fields", async () => {
    const requests: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.url!);
      return response(config, {
        ...order,
        paidAt: "2026-10-04T01:00:00Z",
        paymentInfo: { ...order.paymentInfo, brand: "Visa", last4: "1234" }
      });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    for (const text of [
      "An Nguyễn",
      "an@example.test",
      "0900000000",
      "Gọi trước khi giao",
      "Giao buổi sáng",
      "Khách hàng đăng ký",
      "Bank",
      "BANK-1",
      "Visa",
      "1234"
    ])
      expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(/Cần thanh toán trước khi xác nhận/)).toBeTruthy();
    expect(screen.getByText(/1 Đường A.*Bến Nghé.*Quận 1.*Hồ Chí Minh/)).toBeTruthy();
    const row = within(screen.getByRole("row", { name: /Áo tại thời điểm mua/ }));
    for (const text of ["SKU-S", "Kích thước: S", "2", "100.000 ₫", "120.000 ₫", "200.000 ₫"])
      expect(row.getByText(text)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Áo tại thời điểm mua" }).getAttribute("src")).toBe(
      "https://example.test/snapshot.jpg"
    );
    const totals = within(screen.getByRole("region", { name: "Tổng tiền" }));
    for (const text of ["200.000 ₫", "20.000 ₫", "30.000 ₫", "210.000 ₫", "VND", "SAVE10", "10%"])
      expect(totals.getByText(text)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Thông tin thanh toán" }).textContent).toContain(
      "5/10/2026"
    );
    expect(screen.getByRole("region", { name: "Lịch sử đơn hàng" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Lịch sử thanh toán" })).toBeTruthy();
    // Task 8: only actions the backend marks enabled get working controls.
    for (const name of ["Hủy đơn hàng", "Ghi nhận thanh toán", "Điều chỉnh trạng thái thanh toán"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    for (const name of ["Xác nhận đơn hàng", "Ghi nhận hoàn tiền"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(requests).toEqual(["/orders/order-id"]);
  });

  it("preserves stored USD totals even when they differ from item calculations", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        checkoutInfo: { subtotal: 17, totalPrice: 19, currency: "USD" },
        productInfo: [{ ...order.productInfo[0], priceAtOrder: 3, originalPriceAtOrder: 5 }]
      });
    renderDetail();
    const totals = within(await screen.findByRole("region", { name: "Tổng tiền" }));
    expect(totals.getByText("17,00 US$")).toBeTruthy();
    expect(totals.getByText("19,00 US$")).toBeTruthy();
    expect(within(screen.getByRole("row", { name: /SKU-S/ })).getByText("6,00 US$")).toBeTruthy();
  });

  it("shows missing legacy display data and images without catalog substitutions", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        orderNumber: undefined,
        userId: undefined,
        created_at: undefined,
        paidAt: undefined,
        paymentDueAt: undefined,
        paymentStatus: undefined,
        productInfo: [
          {
            ...order.productInfo[0],
            productNameAtOrder: undefined,
            variantSkuAtOrder: undefined,
            variantImageAtOrder: "",
            attributeValuesAtOrder: undefined
          }
        ],
        statusHistory: [],
        paymentHistory: []
      });
    renderDetail();
    await screen.findByRole("heading", { name: `Đơn hàng ${missingOrderData}` });
    expect(screen.getByText("Khách vãng lai")).toBeTruthy();
    expect(screen.queryByRole("img", { name: missingOrderData })).toBeNull();
    expect(screen.getAllByText(missingOrderData).length).toBeGreaterThan(4);
    expect(screen.queryByText("SKU-S")).toBeNull();
    expect(screen.getAllByText("Chưa ghi nhận lịch sử")).toHaveLength(2);
  });

  it("refreshes explicitly and replaces the displayed snapshot", async () => {
    let reads = 0;
    axiosRequest.defaults.adapter = async config =>
      response(config, { ...order, orderNumber: ++reads === 1 ? "OLD" : "NEW" });
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng OLD" });
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await screen.findByRole("heading", { name: "Đơn hàng NEW" });
    expect(screen.queryByRole("heading", { name: "Đơn hàng OLD" })).toBeNull();
    expect(reads).toBe(2);
  });

  it.each([404, 400, 503])(
    "distinguishes unavailable detail from retryable read failure (%s)",
    async status => {
      let failed = true;
      axiosRequest.defaults.adapter = async config => {
        if (failed)
          throw new AxiosError("failed", String(status), config, null, {
            config,
            headers: {},
            status,
            statusText: "Error",
            data: { message: "Không tải được đơn" }
          });
        return response(config, order);
      };
      renderDetail();
      if (status === 503) {
        await screen.findByText("Không tải được đơn");
        expect(screen.queryByText("Chưa ghi nhận lịch sử")).toBeNull();
        failed = false;
        fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
        await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      } else {
        await screen.findByText("Đơn hàng không còn khả dụng");
        expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
        expect(screen.queryByText("Chưa ghi nhận lịch sử")).toBeNull();
      }
    }
  );

  it("rejects a missing detail envelope with retry instead of empty detail", async () => {
    axiosRequest.defaults.adapter = async config => response(config, null);
    renderDetail();
    await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.queryByRole("region", { name: "Tổng tiền" })).toBeNull();
  });

  it("aborts navigation reads and never displays a delayed prior order", async () => {
    const delayed = deferred<AxiosResponse>();
    let firstConfig: Parameters<typeof response>[0] | undefined;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/orders/a") {
        firstConfig = config;
        return delayed.promise;
      }
      return response(config, { ...order, _id: "b", orderNumber: "ORDER-B" });
    };
    const router = renderDetail("/orders/a");
    await waitFor(() => expect(firstConfig).toBeTruthy());
    await act(() => router.navigate("/orders/b"));
    await screen.findByRole("heading", { name: "Đơn hàng ORDER-B" });
    expect(firstConfig!.signal!.aborted).toBe(true);
    await act(async () =>
      delayed.resolve(response(firstConfig!, { ...order, _id: "a", orderNumber: "ORDER-A" }))
    );
    expect(screen.queryByRole("heading", { name: "Đơn hàng ORDER-A" })).toBeNull();
  });

  it("hides already loaded old data during the next order read and aborts on unmount", async () => {
    const delayed = deferred<AxiosResponse>();
    let nextConfig: Parameters<typeof response>[0] | undefined;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/orders/b") {
        nextConfig = config;
        return delayed.promise;
      }
      return response(config, order);
    };
    const router = createMemoryRouter([{ path: "/orders/:orderId", element: <OrderDetail /> }], {
      initialEntries: ["/orders/order-id"]
    });
    const view = render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    await act(() => router.navigate("/orders/b"));
    await waitFor(() => expect(nextConfig).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" })).toBeNull();
    view.unmount();
    expect(nextConfig!.signal!.aborted).toBe(true);
    await act(async () => delayed.resolve(response(nextConfig!, { ...order, _id: "b" })));
  });

  it("leaves return navigation to the layout breadcrumb", async () => {
    axiosRequest.defaults.adapter = async config => response(config, order);
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.queryByRole("link", { name: /Về khách hàng|Về danh sách/ })).toBeNull();
  });
});

describe("order detail actions", () => {
  const reply = (config: Parameters<typeof response>[0], data: unknown) =>
    Promise.resolve(response(config, data));

  it("reviews fresh data, patches once and shows the returned detail without another read", async () => {
    const calls: { method?: string; url?: string; body?: string }[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push({ method: config.method, url: config.url, body: config.data });
      if (config.method === "patch")
        return reply(config, { ...order, revision: 8, status: "cancelled" });
      return reply(config, { ...order, revision: calls.length === 1 ? 4 : 7 });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn hàng" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText("Đã ghi nhận thao tác.");
    expect(calls.map(call => call.method)).toEqual(["get", "get", "patch"]);
    expect(JSON.parse(calls[2].body!)).toEqual({ status: "cancelled", expectedRevision: 7 });
    expect(
      within(screen.getByRole("region", { name: "Thông tin đơn hàng" })).getByText("Đã hủy")
    ).toBeTruthy();
  });

  it("updates the page behind the dialog after a conflict and requires renewed confirmation", async () => {
    let reads = 0;
    const calls: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(String(config.method));
      if (config.method === "patch")
        return Promise.reject(
          new AxiosError("c", "ERR_BAD_REQUEST", config, null, {
            config,
            data: { message: "Đơn hàng đã thay đổi" },
            status: 409,
            statusText: "",
            headers: {}
          })
        );
      reads += 1;
      return reply(config, reads < 3 ? order : { ...order, revision: 6, status: "confirmed" });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn hàng" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText(/đã được thay đổi bởi thao tác khác/);
    expect(
      within(screen.getByRole("region", { name: "Thông tin đơn hàng" })).getByText("Đã xác nhận")
    ).toBeTruthy();
    expect(calls).toEqual(["get", "get", "patch", "get"]);
    expect((dialog.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("refreshes the order after a committed refund decision without reloading the page or moving the order status", async () => {
    const itemLabel = "Áo tại thời điểm mua (SKU-S)";
    const reviewed: AdminRefundOrderView = {
      ...refundView,
      canReview: true,
      allocations: [
        {
          allocationId: "a1",
          productInfoIndex: 0,
          productName: "Áo tại thời điểm mua",
          variantLabel: "SKU-S",
          purchasedQuantity: 2,
          availableQuantity: 0,
          requestedQuantity: 2,
          refundedQuantity: 0,
          netAmount: 180000,
          availableAmount: 0,
          requestedAmount: 180000,
          refundedAmount: 0,
          productRefundEnabled: true
        }
      ],
      requests: [
        {
          requestId: "r1",
          stage: "awaiting_review",
          submittedAt: "2026-10-22T03:00:00.000Z",
          items: [
            {
              allocationId: "a1",
              productInfoIndex: 0,
              quantity: 2,
              reason: "ordinary",
              explanation: "Không vừa",
              requestedReturn: "return",
              evidenceIds: [],
              approvedQuantity: 0,
              approvedAmount: 0,
              returnRequired: false,
              receivedQuantity: 0,
              netAmount: 180000,
              decisionReason: null,
              sellableQuantity: 0,
              ranges: [{ allocationId: "a1", start: 0, quantity: 2 }]
            }
          ],
          shipping: { reservedAmount: 0, approvedAmount: 0 },
          history: [],
          payout: null,
          exceptionReason: null,
          reviewRequired: false,
          inspections: [],
          approval: null,
          claim: null
        }
      ]
    };
    const decided: AdminRefundOrderView = {
      ...reviewed,
      revision: 5,
      requests: [
        {
          ...reviewed.requests[0],
          stage: "awaiting_return",
          items: [{ ...reviewed.requests[0].items[0], approvedQuantity: 2, returnRequired: true }]
        }
      ]
    };
    const calls: string[] = [];
    let committed = false;
    serveRefunds = async config => {
      calls.push(`${config.method} ${config.url}`);
      if (config.method === "post") {
        committed = true;
        return response(config, decided);
      }
      return response(config, reviewed);
    };
    axiosRequest.defaults.adapter = async config => {
      calls.push(`${config.method} ${config.url}`);
      return response(config, { ...order, revision: committed ? 5 : 4 });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    fireEvent.click(await screen.findByRole("button", { name: "Duyệt yêu cầu" }));
    fireEvent.change(screen.getByRole("textbox", { name: `Lý do quyết định ${itemLabel}` }), {
      target: { value: "Hàng lỗi" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận duyệt" }));

    const request = within(await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" }));
    expect(await request.findByText("Chờ nhận hàng")).toBeTruthy();
    await waitFor(() =>
      expect(calls.filter(call => call === "get /orders/order-id")).toHaveLength(2)
    );
    expect(screen.queryByLabelText("Đang tải đơn hàng")).toBeNull();
    expect(calls.filter(call => call.includes("/status"))).toEqual([]);
    expect(calls.filter(call => call.startsWith("post"))).toEqual([
      "post /orders/order-id/refunds/r1/decision"
    ]);
  });

  it("never offers the legacy refund payment action, even if a server lists it as enabled", async () => {
    const calls: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(`${config.method} ${config.url}`);
      return response(config, {
        ...order,
        paymentStatus: "paid",
        actions: {
          ...order.actions,
          paymentActions: order.actions.paymentActions.map(action =>
            action.action === "refund"
              ? { ...action, enabled: true, reason: null, targets: ["refunded"] }
              : action
          )
        }
      });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.queryByRole("button", { name: "Ghi nhận hoàn tiền" })).toBeNull();
    expect(screen.getByText(/Ghi nhận hoàn tiền: Xử lý trong mục Hoàn tiền bên dưới/)).toBeTruthy();
    expect(screen.queryByText(/Ghi nhận hoàn tiền: Có thể thực hiện/)).toBeNull();
    expect(calls.filter(call => call.startsWith("patch"))).toEqual([]);
  });

  it("refreshes the order after a payout claim and sends only refund-ledger writes", async () => {
    const awaiting: AdminRefundOrderView = {
      ...refundView,
      canPay: true,
      requests: [
        {
          requestId: "r1",
          stage: "awaiting_payout",
          submittedAt: "2026-10-22T03:00:00.000Z",
          items: [],
          shipping: { reservedAmount: 0, approvedAmount: 20000 },
          history: [],
          payout: null,
          exceptionReason: null,
          reviewRequired: false,
          inspections: [],
          approval: null,
          claim: null
        }
      ]
    };
    const claimed: AdminRefundOrderView = {
      ...awaiting,
      revision: 5,
      requests: [
        {
          ...awaiting.requests[0],
          stage: "payout_in_progress",
          approval: {
            merchandiseAmount: 0,
            shippingAmount: 20000,
            amount: 20000,
            frozenAt: "2026-10-23T00:00:00.000Z"
          },
          claim: {
            claimId: "c1",
            claimedAt: "2026-10-23T00:00:00.000Z",
            merchandiseAmount: 0,
            shippingAmount: 20000,
            amount: 20000
          }
        }
      ]
    };
    const calls: string[] = [];
    let committed = false;
    serveRefunds = async config => {
      calls.push(`${config.method} ${config.url}`);
      if (config.method === "post") {
        committed = true;
        return response(config, claimed);
      }
      return response(config, awaiting);
    };
    axiosRequest.defaults.adapter = async config => {
      calls.push(`${config.method} ${config.url}`);
      return response(config, { ...order, revision: committed ? 5 : 4 });
    };
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    fireEvent.click(await screen.findByRole("button", { name: "Nhận xử lý hoàn tiền" }));

    await screen.findByText("Số tiền đã cố định để hoàn: 20.000 ₫");
    await waitFor(() =>
      expect(calls.filter(call => call === "get /orders/order-id")).toHaveLength(2)
    );
    expect(calls.filter(call => call.startsWith("post"))).toEqual([
      "post /orders/order-id/refunds/r1/payout-claim"
    ]);
    expect(calls.filter(call => call.startsWith("patch") || call.includes("/payment"))).toEqual([]);
  });
});

describe("cancellation reason visibility", () => {
  it("shows the customer-chosen reason and note on a customer-cancelled order", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        status: "cancelled",
        cancellation: { reason: "wrong_order", note: "Chọn nhầm màu" }
      });
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(
      screen.getByText(/Lý do hủy \(khách chọn\): Chọn nhầm sản phẩm \/ phân loại — Chọn nhầm màu/)
    ).toBeTruthy();
  });

  it("shows the plain reason when the customer did not add a note", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, {
        ...order,
        status: "cancelled",
        cancellation: { reason: "changed_mind" }
      });
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.getByText(/Lý do hủy \(khách chọn\): Không muốn mua nữa$/)).toBeTruthy();
  });

  it("marks missing reason data on legacy cancelled orders and hides the line elsewhere", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, { ...order, status: "cancelled" });
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.getByText(/Lý do hủy \(khách chọn\): —$/)).toBeTruthy();
  });

  it("does not render a cancellation line for orders that are not cancelled", async () => {
    axiosRequest.defaults.adapter = async config => response(config, order);
    renderDetail();
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.queryByText(/Lý do hủy/)).toBeNull();
  });
});
