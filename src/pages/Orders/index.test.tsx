import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError, type AxiosResponse } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, order, orderList, response } from "@/test/order-fixtures";
import Orders from "./index";
import { formatOrderDate } from "./order-display";

function setup(path = "/orders") {
  const router = createMemoryRouter([{ path: "/orders", element: <Orders /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Orders list", () => {
  it("reads free orders through their payment filter and displays zero and backend payment labels", async () => {
    const requests: unknown[] = [];
    const free = {
      ...order,
      paymentStatus: "not_required",
      paymentInfo: { method: "NO_PAYMENT" },
      checkoutInfo: { ...order.checkoutInfo, totalPrice: 0 }
    };
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, { ...orderList(), data: [free] });
    };
    setup("/orders?paymentStatus=not_required");
    await screen.findByRole("link", { name: "Chi tiết" });
    expect(requests).toEqual([{ page: 1, pageSize: 10, paymentStatus: "not_required" }]);
    const row = within(screen.getByRole("row", { name: /ORD-SNAPSHOT/ }));
    expect(row.getByText("0 ₫")).toBeTruthy();
    // Spec §6: both method and status read "No payment required", never "not paid".
    expect(row.getAllByText("Không cần thanh toán")).toHaveLength(2);
    expect(row.getByRole("link", { name: "Chi tiết" }).getAttribute("href")).toContain(
      "paymentStatus%3Dnot_required"
    );
  });
  it("renders every order column and API total as order count", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], 1, 42));
    };
    setup();
    await screen.findByRole("link", { name: "Chi tiết" });
    for (const label of [
      "Mã đơn hàng",
      "Ngày tạo",
      "Người nhận",
      "Tổng tiền",
      "Phương thức thanh toán",
      "Trạng thái đơn hàng",
      "Trạng thái thanh toán",
      "Thao tác"
    ])
      expect(screen.getByRole("columnheader", { name: label })).toBeTruthy();
    const row = within(screen.getByRole("row", { name: /ORD-SNAPSHOT/ }));
    for (const text of [
      "ORD-SNAPSHOT",
      formatOrderDate(order.created_at),
      "An Nguyễn",
      "0900000000",
      "210.000 ₫",
      "Chuyển khoản ngân hàng",
      "Chờ xử lý",
      "Chưa thanh toán"
    ])
      expect(row.getByText(text)).toBeTruthy();
    expect(screen.getByText("Tổng 42 đơn hàng")).toBeTruthy();
    expect(requests).toEqual([{ page: 1, pageSize: 10 }]);
    expect(row.getByRole("link", { name: "Chi tiết" }).getAttribute("href")).toBe(
      "/orders/order-id?returnTo=%2Forders"
    );
  });

  it("submits search once, resets page and preserves both filters", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    };
    const router = setup(
      "/orders?page=3&pageSize=20&search=Old&status=pending&paymentStatus=unpaid"
    );
    const input = await screen.findByRole("searchbox", { name: "Tìm đơn hàng" });
    await screen.findByRole("link", { name: "Chi tiết" });
    expect((input as HTMLInputElement).value).toBe("Old");
    fireEvent.change(input, { target: { value: "  An  " } });
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      page: 1,
      pageSize: 20,
      search: "An",
      status: "pending",
      paymentStatus: "unpaid"
    });
    expect(router.state.location.search).toBe(
      "?pageSize=20&search=An&status=pending&paymentStatus=unpaid"
    );
  });

  it("changes combined filters and page size through antd controls", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    };
    const router = setup("/orders?page=3&paymentStatus=paid");
    await screen.findByRole("link", { name: "Chi tiết" });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lọc trạng thái đơn hàng" }));
    fireEvent.click(await screen.findByText("Đã hủy"));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?status=cancelled&paymentStatus=paid")
    );
    await act(() => router.navigate("/orders?page=3&status=cancelled&paymentStatus=paid"));
    await screen.findByRole("link", { name: "Chi tiết" });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Số đơn mỗi trang" }));
    fireEvent.click(await screen.findByText("20 / trang"));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?pageSize=20&status=cancelled&paymentStatus=paid")
    );
    expect(requests[requests.length - 1]).toEqual({
      page: 1,
      pageSize: 20,
      status: "cancelled",
      paymentStatus: "paid"
    });
  });

  it("shows clearable attention presets that reset page and stay in detail return context", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    };
    const router = setup("/orders?page=3&status=pending");
    await screen.findByRole("link", { name: "Chi tiết" });
    fireEvent.click(screen.getByRole("radio", { name: "Chờ chuyển khoản" }));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?status=pending&attention=awaiting-transfer")
    );
    const link = await screen.findByRole("link", { name: "Chi tiết" });
    expect(
      new URL(link.getAttribute("href")!, "http://test.local").searchParams.get("returnTo")
    ).toBe("/orders?status=pending&attention=awaiting-transfer");
    expect(requests[requests.length - 1]).toEqual({
      page: 1,
      pageSize: 10,
      status: "pending",
      attention: "awaiting-transfer"
    });
    fireEvent.click(screen.getByRole("radio", { name: "Tất cả" }));
    await waitFor(() => expect(router.state.location.search).toBe("?status=pending"));
  });

  it("lists payment date for every order and leaves payment actions to the detail page", async () => {
    axiosRequest.defaults.adapter = async config => response(config, orderList([order]));
    setup();
    await screen.findByRole("link", { name: "Chi tiết" });
    expect(screen.getByRole("columnheader", { name: "Ngày thanh toán" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Tất cả" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Xác nhận|Hoàn tiền|thanh toán/i })).toBeNull();
  });

  it("restores reload/deep-link inputs and retains complete detail origin", async () => {
    axiosRequest.defaults.adapter = async config => response(config, orderList([order], 2, 35, 20));
    setup("/orders?page=2&pageSize=20&search=An&status=pending&paymentStatus=unpaid");
    const link = await screen.findByRole("link", { name: "Chi tiết" });
    expect(
      (screen.getByRole("searchbox", { name: "Tìm đơn hàng" }) as HTMLInputElement).value
    ).toBe("An");
    const url = new URL(link.getAttribute("href")!, "http://test.local");
    expect(url.searchParams.get("returnTo")).toBe(
      "/orders?page=2&pageSize=20&search=An&status=pending&paymentStatus=unpaid"
    );
    expect(screen.getByTitle("2").className).toContain("ant-pagination-item-active");
  });

  it("distinguishes loading, retryable error and empty success", async () => {
    const delayed = deferred<AxiosResponse>();
    let config: Parameters<typeof response>[0] | undefined;
    axiosRequest.defaults.adapter = async current => {
      config = current;
      return delayed.promise;
    };
    setup();
    expect(screen.getByLabelText("Đang tải danh sách đơn hàng")).toBeTruthy();
    expect(screen.queryByText("Không có đơn hàng")).toBeNull();
    await waitFor(() => expect(config).toBeTruthy());
    await act(async () =>
      delayed.reject(new AxiosError("offline", AxiosError.ERR_NETWORK, config))
    );
    await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.queryByText("Không có đơn hàng")).toBeNull();
    axiosRequest.defaults.adapter = async current => response(current, orderList([]));
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Không có đơn hàng");
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
    expect(screen.getByText("Tổng 0 đơn hàng")).toBeTruthy();
  });

  it("shows legacy omissions without inventing number/currency/payment state", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        orderList([
          {
            ...order,
            orderNumber: undefined,
            created_at: undefined,
            paymentStatus: undefined,
            checkoutInfo: { ...order.checkoutInfo, currency: undefined }
          }
        ])
      );
    setup();
    await screen.findByRole("link", { name: "Chi tiết" });
    // Mã đơn, ngày tạo, tổng tiền, trạng thái thanh toán; đơn chưa trả không có ngày thanh toán là bình thường
    expect(screen.getAllByText("Chưa có dữ liệu")).toHaveLength(4);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("Chưa thanh toán")).toBeNull();
  });
});
