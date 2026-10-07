import { describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/order-fixtures";
import type { DashboardSummary, StockReport, StockReportQuery } from "@/services/reports";
import Dashboard from "./index";

const generatedAt = "2026-10-07T03:00:00.000Z";
const summary = (lowStockThreshold = 5, pending = 3): DashboardSummary => ({
  metadata: { lowStockThreshold, generatedAt },
  orders: { pending, awaitingShipment: 4, awaitingTransfer: 2, refundNeeded: 1 },
  catalog: { publishedProducts: 12, activeSkus: 30, lowStockSkus: 7, outOfStockSkus: 0 }
});
type StockParams = Required<StockReportQuery>;
const stock = (
  params: StockParams,
  label: string = params.stockStatus,
  total = 1
): StockReport => ({
  metadata: {
    lowStockThreshold: params.lowStockThreshold,
    stockStatus: params.stockStatus,
    generatedAt
  },
  data: [
    {
      variantId: `${label}-variant`,
      productId: "product-id",
      productName: `${label} product`,
      sku: `${label}-SKU`,
      inventoryCount: params.stockStatus === "out" ? 0 : 2
    }
  ],
  total,
  page: params.page,
  pageSize: params.pageSize,
  totalPage: Math.max(1, Math.ceil(total / params.pageSize))
});
interface Calls {
  summary: unknown[];
  stock: StockParams[];
  signals: Record<"summary" | "stock", AbortSignal[]>;
}
function serve(
  onSummary: (params: { lowStockThreshold: number }) => unknown = params =>
    summary(params.lowStockThreshold),
  onStock: (params: StockParams) => unknown = params => stock(params, params.stockStatus, 40)
) {
  const calls: Calls = { summary: [], stock: [], signals: { summary: [], stock: [] } };
  axiosRequest.defaults.adapter = async config => {
    expect(config.toastError).toBe(false);
    if (config.url === "/reports/dashboard") {
      calls.summary.push(config.params);
      calls.signals.summary.push(config.signal as AbortSignal);
      return response(config, await onSummary(config.params));
    }
    expect(config.url).toBe("/reports/stock");
    calls.stock.push(config.params);
    calls.signals.stock.push(config.signal as AbortSignal);
    return response(config, await onStock(config.params));
  };
  return calls;
}

function setup(path = "/dashboard") {
  const router = createMemoryRouter([{ path: "/dashboard", element: <Dashboard /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
}
const summaryRegion = () => screen.getByRole("region", { name: "Tình trạng hiện tại" });
const stockRegion = () => screen.getByRole("region", { name: "Tồn kho cần chú ý" });
const search = (router: ReturnType<typeof setup>) => router.state.location.search;
const defaults = { lowStockThreshold: 5, stockStatus: "low", page: 1, pageSize: 10 };
const thresholdError = "Ngưỡng tồn kho phải là số nguyên từ 1 đến 1000";

describe("Operational Dashboard", () => {
  it("shows current cards with exact drill-downs, applied metadata and the default low-stock list", async () => {
    const calls = serve();
    setup();
    expect(screen.getByRole("heading", { name: "Tổng quan vận hành" })).toBeTruthy();
    const pending = await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    expect(pending.getAttribute("href")).toBe("/orders?status=pending");
    for (const [name, href] of [
      ["Đơn chờ giao hàng: 4", "/orders?status=confirmed"],
      ["Chờ chuyển khoản: 2", "/payments?attention=awaiting-transfer"],
      ["Cần hoàn tiền: 1", "/payments?attention=refund-needed"]
    ])
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
    const region = within(summaryRegion());
    expect(region.getByText("Sản phẩm đang bán")).toBeTruthy();
    expect(region.queryByRole("link", { name: /Sản phẩm đang bán|SKU đang bán/ })).toBeNull();
    expect(region.getByRole("button", { name: "SKU sắp hết hàng: 7" })).toBeTruthy();
    expect(region.getByRole("button", { name: "SKU hết hàng: 0" })).toBeTruthy();
    expect(region.getByText(/Ngưỡng đang áp dụng: 5/)).toBeTruthy();
    expect(
      region.getByText(new RegExp(new Date(generatedAt).toLocaleString("vi-VN")))
    ).toBeTruthy();
    const table = within(stockRegion());
    expect(await table.findByText("low-SKU")).toBeTruthy();
    expect(table.getByText("low product")).toBeTruthy();
    expect(table.getByText(/Ngưỡng đang áp dụng: 5/)).toBeTruthy();
    expect(calls.summary).toEqual([{ lowStockThreshold: 5 }]);
    expect(calls.stock).toEqual([defaults]);
  });

  it("keeps section errors independent, never shows failed reads as zeros and retries one section", async () => {
    let summaryFails = true;
    let stockFails = true;
    const calls = serve(
      params => {
        if (summaryFails) throw new Error("Tổng quan lỗi");
        return summary(params.lowStockThreshold);
      },
      params => {
        if (stockFails) throw new Error("Tồn kho lỗi");
        return stock(params);
      }
    );
    setup();
    expect(await within(summaryRegion()).findByText("Tổng quan lỗi")).toBeTruthy();
    expect(await within(stockRegion()).findByText("Tồn kho lỗi")).toBeTruthy();
    expect(within(summaryRegion()).queryByRole("link")).toBeNull();
    expect(within(summaryRegion()).queryByText("0")).toBeNull();
    expect(within(stockRegion()).queryByRole("table")).toBeNull();
    stockFails = false;
    fireEvent.click(within(stockRegion()).getByRole("button", { name: "Thử lại" }));
    expect(await within(stockRegion()).findByText("low-SKU")).toBeTruthy();
    expect(within(summaryRegion()).getByText("Tổng quan lỗi")).toBeTruthy();
    expect(calls.summary).toHaveLength(1);
    summaryFails = false;
    fireEvent.click(within(summaryRegion()).getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    expect(calls.summary).toHaveLength(2);
    expect(calls.stock).toHaveLength(2);
  });

  it("applies a threshold only through Apply, resets the stock page and rejects invalid values", async () => {
    const calls = serve();
    const router = setup("/dashboard?stockStatus=out&page=3");
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    await within(stockRegion()).findByText("out-SKU");
    const input = screen.getByRole("textbox", { name: "Ngưỡng tồn kho thấp" });
    expect((input as HTMLInputElement).value).toBe("5");
    for (const value of ["0", "1001", "2.5", "-1", "", "abc"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
      expect(screen.getByText(thresholdError)).toBeTruthy();
      expect(input.getAttribute("aria-invalid")).toBe("true");
    }
    expect(search(router)).toBe("?stockStatus=out&page=3");
    expect(calls.summary).toHaveLength(1);
    expect(calls.stock).toHaveLength(1);
    fireEvent.change(input, { target: { value: "1000" } });
    expect(calls.summary).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(search(router)).toBe("?lowStockThreshold=1000&stockStatus=out"));
    expect(screen.queryByText(thresholdError)).toBeNull();
    expect(await within(summaryRegion()).findByText(/Ngưỡng đang áp dụng: 1000/)).toBeTruthy();
    expect(calls.summary).toEqual([{ lowStockThreshold: 5 }, { lowStockThreshold: 1000 }]);
    expect(calls.stock[calls.stock.length - 1]).toEqual({
      lowStockThreshold: 1000,
      stockStatus: "out",
      page: 1,
      pageSize: 10
    });
    // The committed threshold remounts the form, so the draft input is a new element.
    fireEvent.change(screen.getByRole("textbox", { name: "Ngưỡng tồn kho thấp" }), {
      target: { value: "1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(search(router)).toBe("?lowStockThreshold=1&stockStatus=out"));
  });

  it("shows a correction state for an invalid URL threshold without reading another threshold", async () => {
    const calls = serve();
    const router = setup("/dashboard?lowStockThreshold=0&page=2");
    expect(await screen.findByText(thresholdError)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Đơn chờ xử lý/ })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(calls.summary).toEqual([]);
    expect(calls.stock).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Dùng giá trị mặc định" }));
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    expect(search(router)).toBe("?page=2");
    expect(calls.summary).toEqual([{ lowStockThreshold: 5 }]);
    expect(calls.stock).toEqual([{ ...defaults, page: 2 }]);
  });

  it.each([
    ["?stockStatus=all", "Chế độ tồn kho không hợp lệ"],
    ["?page=0", "Trang tồn kho không hợp lệ"],
    ["?pageSize=100", "Số SKU mỗi trang không hợp lệ"],
    ["?page=2&page=3", "Trang tồn kho không hợp lệ"]
  ])(
    "keeps cards for %s but corrects the stock list instead of reading it",
    async (query, error) => {
      const calls = serve();
      setup(`/dashboard${query}`);
      await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
      expect(within(stockRegion()).getByText(error)).toBeTruthy();
      expect(within(stockRegion()).queryByRole("table")).toBeNull();
      expect(calls.stock).toEqual([]);
    }
  );

  it("selects low/out mode from cards and control, resets the page and restores history", async () => {
    const calls = serve();
    const router = setup("/dashboard?page=2");
    await within(stockRegion()).findByText("low-SKU");
    fireEvent.click(screen.getByRole("button", { name: "SKU hết hàng: 0" }));
    await waitFor(() => expect(search(router)).toBe("?stockStatus=out"));
    await within(stockRegion()).findByText("out-SKU");
    expect(
      (within(stockRegion()).getByRole("radio", { name: "Hết hàng" }) as HTMLInputElement).checked
    ).toBe(true);
    fireEvent.click(within(stockRegion()).getByRole("radio", { name: "Sắp hết hàng" }));
    await waitFor(() => expect(search(router)).toBe(""));
    await within(stockRegion()).findByText("low-SKU");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Số SKU mỗi trang" }));
    fireEvent.click(await screen.findByText("20 / trang"));
    await waitFor(() => expect(search(router)).toBe("?pageSize=20"));
    await act(() => router.navigate(-1));
    expect(search(router)).toBe("");
    await act(() => router.navigate(-1));
    expect(search(router)).toBe("?stockStatus=out");
    await within(stockRegion()).findByText("out-SKU");
    await act(() => router.navigate(-1));
    expect(search(router)).toBe("?page=2");
    await within(stockRegion()).findByText("low-SKU");
    expect(calls.summary).toHaveLength(1);
    expect(
      calls.stock.map(({ stockStatus, page, pageSize }) => [stockStatus, page, pageSize])
    ).toEqual([
      ["low", 2, 10],
      ["out", 1, 10],
      ["low", 1, 10],
      ["low", 1, 20],
      ["low", 1, 10],
      ["out", 1, 10],
      ["low", 2, 10]
    ]);
  });

  it("recovers a shrunken stock page with one bounded read on load and on refresh", async () => {
    let total = 30;
    const calls = serve(undefined, params => stock(params, `page-${params.page}`, total));
    const router = setup("/dashboard?page=5&pageSize=20");
    await within(stockRegion()).findByText("page-2-SKU");
    expect(search(router)).toBe("?page=2&pageSize=20");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(calls.stock.map(params => params.page)).toEqual([5, 2]);
    total = 5;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await within(stockRegion()).findByText("page-1-SKU");
    expect(search(router)).toBe("?pageSize=20");
    expect(calls.stock.map(params => params.page)).toEqual([5, 2, 2, 1]);
    expect(calls.summary).toHaveLength(2);
  });

  it("stops after one recovery read even when the list shrinks again", async () => {
    let total = 30;
    const calls = serve(undefined, params => {
      const report = stock(params, `page-${params.page}`, total);
      total = 1;
      return report;
    });
    setup("/dashboard?page=5&pageSize=20");
    await within(stockRegion()).findByText("page-2-SKU");
    expect(calls.stock.map(params => params.page)).toEqual([5, 2]);
  });

  it("ignores a superseded stock read and aborts reads when unmounted", async () => {
    const slowLow = deferred<StockReport>();
    const first = serve(undefined, params =>
      params.stockStatus === "low" ? slowLow.promise : stock(params)
    );
    setup();
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    fireEvent.click(within(stockRegion()).getByRole("radio", { name: "Hết hàng" }));
    await within(stockRegion()).findByText("out-SKU");
    await act(async () => slowLow.resolve(stock({ ...defaults, stockStatus: "low" }, "stale")));
    expect(within(stockRegion()).queryByText("stale-SKU")).toBeNull();
    expect(within(stockRegion()).getByText("out-SKU")).toBeTruthy();
    expect(first.signals.stock.map(signal => signal.aborted)).toEqual([true, false]);
    const pending = deferred<DashboardSummary>();
    const second = serve(() => pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(second.signals.summary).toHaveLength(1));
    cleanup();
    expect(second.signals.summary[0].aborted).toBe(true);
  });

  it("refreshes both sections, disabling duplicate refresh/apply while pending", async () => {
    serve();
    setup();
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 3" });
    await within(stockRegion()).findByText("low-SKU");
    const nextSummary = deferred<DashboardSummary>();
    const nextStock = deferred<StockReport>();
    const calls = serve(
      () => nextSummary.promise,
      () => nextStock.promise
    );
    const refresh = screen.getByRole("button", { name: "Tải lại" });
    fireEvent.click(refresh);
    await waitFor(() => expect(calls.summary).toHaveLength(1));
    expect(calls.stock).toEqual([defaults]);
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Áp dụng" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.queryByRole("link", { name: "Đơn chờ xử lý: 3" })).toBeNull();
    await act(async () => nextSummary.resolve(summary(5, 9)));
    await screen.findByRole("link", { name: "Đơn chờ xử lý: 9" });
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    await act(async () => nextStock.resolve(stock(defaults as StockParams, "fresh")));
    await within(stockRegion()).findByText("fresh-SKU");
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  });
});
