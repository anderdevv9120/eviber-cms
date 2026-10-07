import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/order-fixtures";
import type { SalesReport, SalesReportQuery } from "@/services/reports";
import { formatOrderAmount } from "../Orders/order-display";
import Reports from "./index";

// Testing Library collapses the NBSP in Intl currency output when matching text.
const money = (amount: number, currency: string) =>
  formatOrderAmount(amount, currency).replace(/\s/g, " ");
const generatedAt = "2026-10-20T03:00:00.000Z";
const vnd = (amount: number) => [{ currency: "VND", amount }];
const month = { from: "2026-10-01", to: "2026-10-20", deliveredOnly: false };
const report = (query: SalesReportQuery, overrides: Partial<SalesReport> = {}): SalesReport => ({
  metadata: { ...query, timezone: "Asia/Ho_Chi_Minh", generatedAt },
  ordersPlaced: 9,
  paidOrderCount: 4,
  unitsSold: 7,
  paidOrderValue: [
    { currency: "USD", amount: 25 },
    { currency: "VND", amount: 1500000 }
  ],
  refundedOrderCount: 1,
  refundedOrderValue: vnd(300000),
  fulfillmentStatuses: {
    pending: 2,
    confirmed: 1,
    shipped: 1,
    delivered: 3,
    cancelled: 1,
    returned: 0,
    unknown: 1
  },
  paymentStatuses: { unpaid: 3, paid: 4, refunded: 1, failed: 0, unknown: 1 },
  daily: [
    { date: "2026-10-01", paidOrderCount: 2, unitsSold: 3, paidOrderValue: vnd(1000000) },
    { date: "2026-10-02", paidOrderCount: 0, unitsSold: 0, paidOrderValue: [] },
    {
      date: "2026-10-03",
      paidOrderCount: 2,
      unitsSold: 4,
      paidOrderValue: [{ currency: "USD", amount: 25 }, ...vnd(500000)]
    }
  ],
  topProducts: [
    {
      productId: "product-1",
      label: "Áo thun",
      missingLabel: false,
      unitsSold: 5,
      merchandiseValue: vnd(900000)
    },
    {
      productId: "product-2",
      label: "product-2",
      missingLabel: true,
      unitsSold: 2,
      merchandiseValue: []
    }
  ],
  topSkus: [
    {
      variantId: "variant-1",
      label: "AO-M",
      missingLabel: false,
      unitsSold: 5,
      merchandiseValue: vnd(900000)
    }
  ],
  excludedMonetaryData: { paidOrders: 0, refundedOrders: 0, items: 0 },
  ...overrides
});

function serve(onSales: (query: SalesReportQuery) => unknown = query => report(query)) {
  const calls: SalesReportQuery[] = [];
  const signals: AbortSignal[] = [];
  axiosRequest.defaults.adapter = async config => {
    expect(config.url).toBe("/reports/sales");
    expect(config.toastError).toBe(false);
    calls.push(config.params);
    signals.push(config.signal as AbortSignal);
    return response(config, await onSales(config.params));
  };
  return { calls, signals };
}
function setup(path = "/reports") {
  const router = createMemoryRouter([{ path: "/reports", element: <Reports /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
}
const group = (name: string) => within(screen.getByRole("group", { name }));
const region = (name: string) => within(screen.getByRole("region", { name }));
const search = (router: ReturnType<typeof setup>) => router.state.location.search;
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const dateInput = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const deliveredSwitch = () => screen.getByRole("switch", { name: "Chỉ đơn đã giao" });
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
const loaded = () => screen.findByRole("group", { name: "Đơn đã đặt" });

// Only Date is faked so Testing Library timers keep running: 03:00 UTC is 10:00 in Vietnam.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(generatedAt));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Sales reports", () => {
  it("reads This month by default and shows cohort, paid and refunded metrics separately", async () => {
    const { calls } = serve();
    setup();
    expect(screen.getByRole("heading", { name: "Báo cáo bán hàng" })).toBeTruthy();
    await loaded();
    expect(calls).toEqual([month]);
    expect(radio("Tháng này").checked).toBe(true);
    expect(dateInput("Từ ngày").value).toBe("2026-10-01");
    expect(dateInput("Đến ngày").value).toBe("2026-10-20");
    expect(deliveredSwitch().getAttribute("aria-checked")).toBe("false");
    expect(group("Đơn đã đặt").getByText("9")).toBeTruthy();
    expect(group("Đơn đã thanh toán").getByText("4")).toBeTruthy();
    expect(group("Số lượng đã bán").getByText("7")).toBeTruthy();
    const paid = group("Giá trị đơn đã thanh toán");
    expect(paid.getByText(money(1500000, "VND"))).toBeTruthy();
    expect(paid.getByText(money(25, "USD"))).toBeTruthy();
    const refunded = group("Đơn đã hoàn tiền");
    expect(refunded.getByText("1")).toBeTruthy();
    expect(refunded.getByText(money(300000, "VND"))).toBeTruthy();
    expect(screen.queryByText(/doanh thu thuần/i)).toBeNull();
    expect(screen.getByText(/theo ngày tạo đơn/)).toBeTruthy();
    expect(screen.getByText(/01\/10\/2026 – 20\/10\/2026/)).toBeTruthy();
    expect(
      screen.getByText(new RegExp(new Date(generatedAt).toLocaleString("vi-VN")))
    ).toBeTruthy();
  });

  it("applies the delivery toggle only through Apply and restores both modes with history", async () => {
    const { calls } = serve();
    const router = setup();
    await loaded();
    expect(screen.getByText(/Tất cả đơn đủ điều kiện/)).toBeTruthy();
    fireEvent.click(deliveredSwitch());
    expect(calls).toHaveLength(1);
    expect(search(router)).toBe("");
    apply();
    await waitFor(() =>
      expect(search(router)).toBe("?from=2026-10-01&to=2026-10-20&deliveredOnly=true")
    );
    expect(await screen.findByText(/Chỉ đơn đã giao ·/)).toBeTruthy();
    expect(deliveredSwitch().getAttribute("aria-checked")).toBe("true");
    await act(() => router.navigate(-1));
    expect(search(router)).toBe("");
    expect(await screen.findByText(/Tất cả đơn đủ điều kiện/)).toBeTruthy();
    expect(deliveredSwitch().getAttribute("aria-checked")).toBe("false");
    await act(() => router.navigate(1));
    expect(await screen.findByText(/Chỉ đơn đã giao ·/)).toBeTruthy();
    expect(calls.map(query => query.deliveredOnly)).toEqual([false, true, false, true]);
  });

  it("drafts presets and custom dates, committing only valid complete ranges", async () => {
    const { calls } = serve();
    const router = setup();
    await loaded();
    fireEvent.click(radio("7 ngày gần nhất"));
    expect(dateInput("Từ ngày").value).toBe("2026-10-14");
    expect(search(router)).toBe("");
    apply();
    await waitFor(() => expect(search(router)).toBe("?from=2026-10-14&to=2026-10-20"));
    await screen.findByText(/14\/10\/2026 – 20\/10\/2026/);
    expect(radio("7 ngày gần nhất").checked).toBe(true);
    fireEvent.click(radio("Hôm nay"));
    apply();
    await waitFor(() => expect(search(router)).toBe("?from=2026-10-20&to=2026-10-20"));
    await screen.findByText(/20\/10\/2026 – 20\/10\/2026/);
    expect(radio("Hôm nay").checked).toBe(true);

    for (const [from, to, error] of [
      ["2026-10-05", "", "Ngày kết thúc bị thiếu hoặc không hợp lệ"],
      ["2026-10-09", "2026-10-05", "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"],
      ["2025-10-01", "2026-10-02", "Khoảng thời gian tối đa 366 ngày"]
    ]) {
      fireEvent.change(dateInput("Từ ngày"), { target: { value: from } });
      fireEvent.change(dateInput("Đến ngày"), { target: { value: to } });
      expect(radio("Tùy chọn").checked).toBe(true);
      apply();
      expect(screen.getByText(error)).toBeTruthy();
    }
    expect(search(router)).toBe("?from=2026-10-20&to=2026-10-20");
    expect(calls).toHaveLength(3);
    fireEvent.change(dateInput("Từ ngày"), { target: { value: "2025-10-20" } });
    fireEvent.change(dateInput("Đến ngày"), { target: { value: "2026-10-20" } });
    apply();
    await waitFor(() => expect(search(router)).toBe("?from=2025-10-20&to=2026-10-20"));
    expect(calls[calls.length - 1]).toEqual({
      from: "2025-10-20",
      to: "2026-10-20",
      deliveredOnly: false
    });
  });

  it("opens a shared custom URL as Custom with its committed dates", async () => {
    const { calls } = serve();
    setup("/reports?from=2026-09-05&to=2026-10-02");
    await loaded();
    expect(radio("Tùy chọn").checked).toBe(true);
    expect(dateInput("Từ ngày").value).toBe("2026-09-05");
    expect(dateInput("Đến ngày").value).toBe("2026-10-02");
    expect(calls).toEqual([{ from: "2026-09-05", to: "2026-10-02", deliveredOnly: false }]);
  });

  it.each([
    ["?from=2026-02-30&to=2026-03-01", "Ngày bắt đầu bị thiếu hoặc không hợp lệ"],
    ["?from=2026-10-01&from=2026-10-02&to=2026-10-03", "Ngày bắt đầu bị thiếu hoặc không hợp lệ"],
    ["?to=2026-10-03", "Ngày bắt đầu bị thiếu hoặc không hợp lệ"],
    ["?deliveredOnly=yes", "Bộ lọc chỉ đơn đã giao không hợp lệ"]
  ])("shows a correction state for %s instead of reading another range", async (query, error) => {
    const { calls } = serve();
    const router = setup(`/reports${query}`);
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Đơn đã đặt" })).toBeNull();
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Dùng giá trị mặc định" }));
    await loaded();
    expect(search(router)).toBe("");
    expect(calls).toEqual([month]);
  });

  it("draws one scaled chart per currency that agrees with the daily table, including zero days", async () => {
    serve();
    setup();
    await loaded();
    const daily = region("Giá trị đơn đã thanh toán theo ngày");
    const vndChart = daily.getByRole("img", { name: /VND/ });
    const usdChart = daily.getByRole("img", { name: /USD/ });
    const bars = (chart: HTMLElement) =>
      Array.from(chart.querySelectorAll("rect")).map(bar => ({
        title: bar.querySelector("title")?.textContent,
        height: Number(bar.getAttribute("height"))
      }));
    expect(bars(vndChart)).toEqual([
      { title: `01/10/2026: ${formatOrderAmount(1000000, "VND")}`, height: 100 },
      { title: `02/10/2026: ${formatOrderAmount(0, "VND")}`, height: 0 },
      { title: `03/10/2026: ${formatOrderAmount(500000, "VND")}`, height: 50 }
    ]);
    expect(bars(usdChart).map(bar => bar.height)).toEqual([0, 0, 100]);
    const rows = daily.getAllByRole("row");
    expect(rows).toHaveLength(4);
    const zeroDay = within(rows[2]);
    expect(zeroDay.getByText("02/10/2026")).toBeTruthy();
    expect(zeroDay.getByText(money(0, "VND"))).toBeTruthy();
    expect(zeroDay.getByText(money(0, "USD"))).toBeTruthy();
    const third = within(rows[3]);
    expect(third.getByText(money(500000, "VND"))).toBeTruthy();
    expect(third.getByText(money(25, "USD"))).toBeTruthy();
    expect(third.getByText("4")).toBeTruthy();
  });

  it("shows empty and all-zero results without a chart scale or invented zero amounts", async () => {
    serve(query =>
      report(query, {
        ordersPlaced: 0,
        paidOrderCount: 0,
        unitsSold: 0,
        paidOrderValue: [],
        refundedOrderCount: 0,
        refundedOrderValue: [],
        daily: [{ date: "2026-10-01", paidOrderCount: 0, unitsSold: 0, paidOrderValue: [] }],
        topProducts: [],
        topSkus: []
      })
    );
    setup();
    await loaded();
    const daily = region("Giá trị đơn đã thanh toán theo ngày");
    expect(daily.queryByRole("img")).toBeNull();
    expect(daily.getByText("Không có giá trị đơn đã thanh toán trong khoảng này")).toBeTruthy();
    expect(daily.getAllByRole("row")).toHaveLength(2);
    expect(group("Giá trị đơn đã thanh toán").getByText("0")).toBeTruthy();
    expect(region("Sản phẩm bán chạy").getByText("Không có sản phẩm bán ra")).toBeTruthy();
    expect(region("SKU bán chạy").getByText("Không có SKU bán ra")).toBeTruthy();
  });

  it("discloses excluded money and keeps unavailable amounts distinct from zero", async () => {
    serve(query =>
      report(query, {
        paidOrderValue: [],
        excludedMonetaryData: { paidOrders: 2, refundedOrders: 1, items: 3 }
      })
    );
    setup();
    await loaded();
    const paid = group("Giá trị đơn đã thanh toán");
    expect(paid.getByText("Không có số liệu tiền hợp lệ")).toBeTruthy();
    expect(paid.queryByText("0")).toBeNull();
    expect(
      screen.getByText(
        "Không tính vào tổng tiền do thiếu hoặc sai dữ liệu: 2 đơn đã thanh toán, 1 đơn đã hoàn tiền, 3 sản phẩm trong đơn."
      )
    ).toBeTruthy();
    const products = region("Sản phẩm bán chạy");
    const missing = within(products.getByText("product-2").closest("tr")!);
    expect(missing.getByText("Thiếu tên")).toBeTruthy();
    expect(missing.getByText("Không có số liệu")).toBeTruthy();
    const named = within(products.getByText("Áo thun").closest("tr")!);
    expect(named.getByText("product-1")).toBeTruthy();
    expect(named.getByText("5")).toBeTruthy();
    expect(named.getByText(money(900000, "VND"))).toBeTruthy();
    const sku = within(region("SKU bán chạy").getByText("AO-M").closest("tr")!);
    expect(sku.getByText("variant-1")).toBeTruthy();
  });

  it("shows a day whose paid orders have no valid money as unavailable, not zero", async () => {
    serve(query =>
      report(query, {
        daily: [
          { date: "2026-10-01", paidOrderCount: 2, unitsSold: 3, paidOrderValue: vnd(1000000) },
          { date: "2026-10-02", paidOrderCount: 1, unitsSold: 1, paidOrderValue: [] }
        ],
        excludedMonetaryData: { paidOrders: 1, refundedOrders: 0, items: 0 }
      })
    );
    setup();
    await loaded();
    const daily = region("Giá trị đơn đã thanh toán theo ngày");
    const day = within(daily.getAllByRole("row")[2]);
    expect(day.getByText("Không có số liệu")).toBeTruthy();
    expect(day.queryByText(money(0, "VND"))).toBeNull();
    const bar = daily.getByRole("img", { name: /VND/ }).querySelectorAll("rect")[1];
    expect(bar.querySelector("title")?.textContent).toBe("02/10/2026: Không có số liệu");
  });

  it("shows fulfillment and payment breakdowns independently with unknown buckets", async () => {
    serve();
    setup();
    await loaded();
    const fulfillment = region("Trạng thái giao hàng");
    expect(fulfillment.getByRole("row", { name: "Đã giao hàng 3" })).toBeTruthy();
    expect(fulfillment.getByRole("row", { name: "Không xác định 1" })).toBeTruthy();
    expect(fulfillment.getAllByRole("row")).toHaveLength(8);
    const payment = region("Trạng thái thanh toán");
    expect(payment.getByRole("row", { name: "Đã thanh toán 4" })).toBeTruthy();
    expect(payment.getByRole("row", { name: "Đã hoàn tiền 1" })).toBeTruthy();
    expect(payment.getAllByRole("row")).toHaveLength(6);
  });

  it("ignores a superseded read and never shows old totals for new filters", async () => {
    const slow = deferred<SalesReport>();
    const { calls, signals } = serve(query =>
      query.from === month.from ? slow.promise : report(query, { ordersPlaced: 5 })
    );
    setup();
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(radio("7 ngày gần nhất"));
    apply();
    await loaded();
    expect(group("Đơn đã đặt").getByText("5")).toBeTruthy();
    await act(async () => slow.resolve(report(month, { ordersPlaced: 999 })));
    expect(screen.queryByText("999")).toBeNull();
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
  });

  it("shows a retryable error without zero metrics and refreshes the committed query", async () => {
    let fails = true;
    const { calls } = serve(query => {
      if (fails) throw new Error("Báo cáo lỗi");
      return report(query);
    });
    setup("/reports?from=2026-10-14&to=2026-10-20&deliveredOnly=true");
    expect(await screen.findByText("Báo cáo lỗi")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Đơn đã đặt" })).toBeNull();
    fails = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await loaded();
    fireEvent.click(radio("Hôm nay"));
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    const committed = { from: "2026-10-14", to: "2026-10-20", deliveredOnly: true };
    expect(calls).toEqual([committed, committed, committed]);
  });
});
