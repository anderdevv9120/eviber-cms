import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { deferred, orderList, response } from "@/test/order-fixtures";
import Orders from "../Orders";
import type { DashboardSummary } from "@/services/reports";
import Dashboard from "./index";

const summary = (pending = 3): DashboardSummary => ({
  metadata: { lowStockThreshold: 5, generatedAt: "2026-10-07T03:00:00.000Z" },
  orders: { pending, awaitingShipment: 4, awaitingTransfer: 2, refundNeeded: 1 },
  catalog: { publishedProducts: 12, activeSkus: 12345, lowStockSkus: 7, outOfStockSkus: 0 }
});
function serve(onSummary: () => unknown = () => summary()) {
  const calls: { params: unknown; signal: AbortSignal }[] = [];
  axiosRequest.defaults.adapter = async config => {
    expect(config.toastError).toBe(false);
    expect(config.url).toBe("/reports/dashboard");
    calls.push({ params: config.params, signal: config.signal as AbortSignal });
    return response(config, await onSummary());
  };
  return calls;
}
function setup() {
  const router = createMemoryRouter([{ path: "/dashboard", element: <Dashboard /> }], {
    initialEntries: ["/dashboard"]
  });
  render(<RouterProvider router={router} />);
  return router;
}
const summaryRegion = () => screen.getByRole("region", { name: "Tình trạng hiện tại" });

describe("Operational Dashboard", () => {
  it("opens refund work in the existing order list through the shared attention query", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/reports/dashboard") return response(config, summary());
      expect(config.url).toBe("/orders");
      requests.push(config.params);
      return response(config, orderList());
    };
    const router = createMemoryRouter(
      [
        { path: "/dashboard", element: <Dashboard /> },
        { path: "/orders", element: <Orders /> }
      ],
      { initialEntries: ["/dashboard"] }
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole("link", { name: "Cần hoàn tiền: 1" }));
    await screen.findByRole("link", { name: "Chi tiết" });
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/orders?attention=refund-needed"
    );
    expect(requests).toEqual([{ page: 1, pageSize: 10, attention: "refund-needed" }]);
  });
  it("shows current cards with exact drill-downs into Đơn hàng and Tồn kho", async () => {
    const calls = serve();
    setup();
    expect(screen.getByRole("heading", { name: "Tổng quan vận hành" })).toBeTruthy();
    const pending = await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    expect(pending.getAttribute("href")).toBe("/orders?status=pending");
    for (const [name, href] of [
      ["Đơn chờ giao hàng: 4", "/orders?status=confirmed"],
      ["Chờ chuyển khoản: 2", "/orders?attention=awaiting-transfer"],
      ["Cần hoàn tiền: 1", "/orders?attention=refund-needed"],
      ["SKU sắp hết hàng: 7", "/inventory?productStatus=PUBLISH&variantStatus=ACTIVE&stock=low"],
      ["SKU hết hàng: 0", "/inventory?productStatus=PUBLISH&variantStatus=ACTIVE&stock=out"]
    ])
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
    const region = within(summaryRegion());
    expect(region.getByText("12.345")).toBeTruthy();
    expect(region.queryByRole("link", { name: /Sản phẩm đang bán|SKU đang bán/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Tồn kho cần chú ý" })).toBeNull();
    expect(screen.queryByLabelText("Ngưỡng tồn kho thấp")).toBeNull();
    expect(calls.map(call => call.params)).toEqual([undefined]);
  });

  it("never shows a failed read as zeros and retries it", async () => {
    let fails = true;
    serve(() => {
      if (fails) throw new Error("Tổng quan lỗi");
      return summary();
    });
    setup();
    expect(await screen.findByText("Tổng quan lỗi")).toBeTruthy();
    expect(screen.queryByText("Đơn chờ xử lý")).toBeNull();
    fails = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" })).toBeTruthy();
  });

  it("refreshes with the button disabled while the read is pending", async () => {
    const next = deferred<DashboardSummary>();
    let first = true;
    const calls = serve(() => {
      if (first) {
        first = false;
        return summary();
      }
      return next.promise;
    });
    setup();
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    const reload = screen.getByRole("button", { name: "Tải lại" }) as HTMLButtonElement;
    fireEvent.click(reload);
    await waitFor(() => expect(reload.disabled).toBe(true));
    next.resolve(summary(9));
    expect(await screen.findByRole("link", { name: "Đơn chờ xử lý: 9" })).toBeTruthy();
    expect(reload.disabled).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("aborts the pending read when unmounted", async () => {
    const pending = deferred<DashboardSummary>();
    const calls = serve(() => pending.promise);
    setup();
    await waitFor(() => expect(calls).toHaveLength(1));
    cleanup();
    expect(calls[0].signal.aborted).toBe(true);
    pending.resolve(summary());
  });
});
