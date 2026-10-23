import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError, type AxiosResponse } from "axios";
import axiosRequest from "@/utils/request";
import { order, response, deferred } from "@/test/order-fixtures";
import OrderDetail from "./OrderDetail";

const renderDetail = (path = "/orders/order-id") => {
  const router = createMemoryRouter([{ path: "/orders/:orderId", element: <OrderDetail /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
};

describe("shared order detail", () => {
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
    await screen.findByRole("heading", { name: "Đơn hàng Chưa có dữ liệu" });
    expect(screen.getByText("Khách vãng lai")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Chưa có dữ liệu" })).toBeNull();
    expect(screen.getAllByText("Chưa có dữ liệu").length).toBeGreaterThan(4);
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

  it.each([
    ["", "/orders"],
    ["?returnTo=https%3A%2F%2Fevil.test", "/orders"],
    ["?returnTo=%2Forders%2Fother-id", "/orders"],
    ["?returnTo=%2Fpayments&returnTo=%2Forders", "/orders"],
    [
      "?returnTo=%2Forders%3Fpage%3D3%26pageSize%3D20%26search%3DAn%26paymentStatus%3Dpaid",
      "/orders?page=3&pageSize=20&search=An&paymentStatus=paid"
    ],
    ["?returnTo=%2Fpayments%3Fpage%3D3", "/orders"],
    [
      "?returnTo=%2Fcustomers%2Fguests%2Fdetail%3Femail%3Da%2540b.vn",
      "/customers/guests/detail?email=a%40b.vn"
    ]
  ])("uses safe persistent return destination %s", async (query, destination) => {
    axiosRequest.defaults.adapter = async config => response(config, order);
    renderDetail(`/orders/order-id${query}`);
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    const backLabel = destination.startsWith("/customers/") ? "Về khách hàng" : "Về danh sách";
    expect(screen.getByRole("link", { name: backLabel }).getAttribute("href")).toBe(destination);
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
});
