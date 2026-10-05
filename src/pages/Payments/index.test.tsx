import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
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
    for (const name of [
      "Ghi nhận thanh toán",
      "Ghi nhận hoàn tiền",
      "Điều chỉnh trạng thái thanh toán"
    ])
      expect(row.getByRole("button", { name })).toBeTruthy();
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

describe("Payments row actions", () => {
  const paid = { ...order, revision: 5, paymentStatus: "paid" as const };
  const route = (
    handlers: { list: () => unknown; detail?: unknown; patch?: () => unknown },
    log: string[]
  ) => {
    axiosRequest.defaults.adapter = async config => {
      const kind =
        config.method === "patch" ? "patch" : config.url === "/orders" ? "list" : "detail";
      log.push(kind);
      if (kind === "list") return response(config, await handlers.list());
      if (kind === "detail") return response(config, handlers.detail);
      return response(config, await handlers.patch!());
    };
  };
  const openReceipt = async () => {
    await screen.findByRole("link", { name: "Chi tiết" });
    fireEvent.click(
      within(screen.getByRole("row", { name: /ORD-SNAPSHOT/ })).getByRole("button", {
        name: "Ghi nhận thanh toán"
      })
    );
    return within(await screen.findByRole("dialog"));
  };

  it("loads fresh detail before acting, then refreshes the filtered list and drops the row", async () => {
    const log: string[] = [];
    let lists = 0;
    route(
      {
        list: () => orderList(lists++ === 0 ? [order] : [], 1, lists === 1 ? 1 : 0),
        detail: { ...order, revision: 7 },
        patch: () => paid
      },
      log
    );
    setup("/payments?paymentStatus=unpaid");
    const dialog = await openReceipt();
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText("Đã ghi nhận thao tác.");
    await waitFor(() => expect(screen.getByText("Không có đơn hàng")).toBeTruthy());
    expect(log).toEqual(["list", "detail", "patch", "list"]);
  });

  it("recovers to page 1 once when the committed change empties the current page", async () => {
    const log: string[] = [];
    const pages = [orderList([order], 2, 11), orderList([], 2, 10), orderList([order], 1, 10)];
    let lists = 0;
    route({ list: () => pages[lists++], detail: order, patch: () => paid }, log);
    const router = setup("/payments?page=2");
    const dialog = await openReceipt();
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText("Đã ghi nhận thao tác.");
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await screen.findByText("Tổng 10 đơn hàng");
    expect(log).toEqual(["list", "detail", "patch", "list", "list"]);
  });

  it("keeps the success and hides row actions when the post-commit list refresh fails", async () => {
    const log: string[] = [];
    let lists = 0;
    route(
      {
        list: () => {
          if (lists++ > 0) throw new Error("Không tải được danh sách");
          return orderList([order]);
        },
        detail: order,
        patch: () => paid
      },
      log
    );
    setup();
    const dialog = await openReceipt();
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText("Đã ghi nhận thao tác.");
    await dialog.findByText(/Không làm mới được dữ liệu/);
    expect(screen.queryByRole("link", { name: "Chi tiết" })).toBeNull();
    expect(screen.queryByRole("row", { name: /ORD-SNAPSHOT/ })).toBeNull();
    expect(log.filter(kind => kind === "patch")).toHaveLength(1);
  });

  it("reloads the list after a conflict and does not replay the PATCH", async () => {
    const log: string[] = [];
    let lists = 0;
    route(
      {
        list: () => orderList([lists++ === 0 ? order : { ...order, paymentStatus: "paid" }]),
        detail: order,
        patch: () => {
          throw new AxiosError("c", "ERR_BAD_REQUEST", undefined, null, {
            config: {} as never,
            data: { message: "Đơn hàng đã thay đổi" },
            status: 409,
            statusText: "",
            headers: {}
          });
        }
      },
      log
    );
    setup();
    const dialog = await openReceipt();
    fireEvent.click(await dialog.findByRole("button", { name: "Xác nhận" }));
    await dialog.findByText(/đã được thay đổi bởi thao tác khác/);
    await waitFor(() =>
      // The dialog's own summary table also has an ORD-SNAPSHOT row; the list row comes first.
      expect(
        within(screen.getAllByRole("row", { name: /ORD-SNAPSHOT/ })[0]).getByText("Đã thanh toán")
      ).toBeTruthy()
    );
    expect(log).toEqual(["list", "detail", "patch", "detail", "list"]);
  });
});
