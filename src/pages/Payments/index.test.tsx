import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { order, orderList, response } from "@/test/order-fixtures";
import { formatOrderDate } from "../Orders/order-display";
import Payments from "./index";

function setup(path = "/payments") {
  const router = createMemoryRouter([{ path: "/payments", element: <Payments /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Payments list", () => {
  it("starts unfiltered, including cancelled orders, and displays all payment columns", async () => {
    const requests: unknown[] = [];
    const paidAt = "2026-10-04T01:00:00Z";
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(
        config,
        orderList([{ ...order, status: "cancelled", paymentStatus: "paid", paidAt }], 1, 40)
      );
    };
    setup();
    await screen.findByRole("link", { name: "Chi tiết" });
    for (const label of [
      "Mã đơn hàng",
      "Người nhận",
      "Tổng tiền",
      "Phương thức thanh toán",
      "Trạng thái thanh toán",
      "Trạng thái đơn hàng",
      "Ngày thanh toán",
      "Thao tác"
    ])
      expect(screen.getByRole("columnheader", { name: label })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Ngày tạo" })).toBeNull();
    const row = within(screen.getByRole("row", { name: /ORD-SNAPSHOT/ }));
    for (const text of [
      "An Nguyễn",
      "210.000 ₫",
      "Chuyển khoản ngân hàng",
      "Đã hủy",
      "Đã thanh toán",
      formatOrderDate(paidAt)
    ])
      expect(row.getByText(text)).toBeTruthy();
    expect(screen.getByText("Tổng 40 đơn hàng")).toBeTruthy();
    expect(requests).toEqual([{ page: 1, pageSize: 10 }]);
    expect(row.getByRole("link").getAttribute("href")).toBe(
      "/orders/order-id?returnTo=%2Fpayments"
    );
    expect(screen.queryByRole("button", { name: "Ghi nhận thanh toán" })).toBeNull();
  });

  it("restores payment filters and shows missing paidAt as missing data", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    };
    const router = setup(
      "/payments?page=2&pageSize=50&search=An&status=cancelled&paymentStatus=paid"
    );
    const link = await screen.findByRole("link", { name: "Chi tiết" });
    expect(screen.getByText("Chưa có dữ liệu")).toBeTruthy();
    expect(
      new URL(link.getAttribute("href")!, "http://test.local").searchParams.get("returnTo")
    ).toBe("/payments?page=2&pageSize=50&search=An&status=cancelled&paymentStatus=paid");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lọc trạng thái thanh toán" }));
    fireEvent.click(await screen.findByText("Đã hoàn tiền"));
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        "?pageSize=50&search=An&status=cancelled&paymentStatus=refunded"
      )
    );
    expect(requests[requests.length - 1]).toEqual({
      page: 1,
      pageSize: 50,
      search: "An",
      status: "cancelled",
      paymentStatus: "refunded"
    });
  });
});
