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
    expect(screen.queryByRole("button", { name: "Ghi nhận thanh toán" })).toBeNull();
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
      "?returnTo=%2Fpayments%3Fpage%3D3%26pageSize%3D20%26search%3DAn%26paymentStatus%3Dpaid",
      "/payments?page=3&pageSize=20&search=An&paymentStatus=paid"
    ]
  ])("uses safe persistent return destination %s", async (query, destination) => {
    axiosRequest.defaults.adapter = async config => response(config, order);
    renderDetail(`/orders/order-id${query}`);
    await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
    expect(screen.getByRole("link", { name: "Về danh sách" }).getAttribute("href")).toBe(
      destination
    );
  });
});
