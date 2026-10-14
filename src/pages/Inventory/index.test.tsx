import "@/test/attribute-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError } from "@/utils/request";
import * as api from "@/services/inventory";
import { INVENTORY_ERROR } from "./inventory-errors";
import Inventory from "./index";

vi.mock("@/services/inventory", () => ({
  getInventoryAPI: vi.fn(),
  adjustStockAPI: vi.fn(),
  getInventoryMovementsAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  errorNotification: vi.fn(),
  successNotification: vi.fn()
}));

const productId = "000000000000000000000001";
const row = (overrides: Partial<api.InventoryRow>): api.InventoryRow => ({
  variantId: "v1",
  productId,
  productName: "Áo thun",
  productStatus: "PUBLISH",
  sku: "SKU-1",
  attributeLabels: ["Đỏ", "M"],
  image: null,
  variantStatus: "ACTIVE",
  inventoryCount: 20,
  ...overrides
});
const rows = [
  row({ variantId: "v0", sku: "SKU-0", inventoryCount: 0 }),
  row({ variantId: "v3", sku: "SKU-3", inventoryCount: 3, productStatus: "DRAFT" }),
  row({ variantId: "v20", sku: "SKU-20", variantStatus: "INACTIVE" })
];
const page = (data: api.InventoryRow[], totalPage = 1) => ({
  data: {
    data,
    total: data.length,
    page: 1,
    pageSize: 10,
    totalPage,
    metadata: { lowStockThreshold: 5, stock: "all" as const }
  },
  message: "success"
});
const renderPage = (path = "/inventory") => {
  const router = createMemoryRouter([{ path: "/inventory", element: <Inventory /> }], {
    initialEntries: [path]
  });
  return { router, ...render(<RouterProvider router={router} />) };
};
const lastQuery = () => vi.mocked(api.getInventoryAPI).mock.lastCall?.[0];
const adjusted = (source: api.InventoryRow, inventoryCount: number): api.AdjustStockResult => ({
  row: { ...source, inventoryCount },
  movement: {
    id: "m1",
    createdAt: "2026-10-14T00:00:00.000Z",
    reason: "manual_adjust",
    delta: inventoryCount - source.inventoryCount,
    stockAfter: inventoryCount,
    note: "Nhập kho",
    actor: null,
    order: null
  }
});
const cellOf = (sku: string) => within(screen.getByText(sku).closest("tr")!);
// The drawer and the modal can be open together.
const dialogTitled = (title: string) =>
  waitFor(() => {
    const found = screen.getAllByRole("dialog").find(el => el.textContent?.includes(title));
    if (!found) throw new Error(`No dialog titled ${title}`);
    return found;
  });
const adjust = async (sku: string, amount: number) => {
  fireEvent.click(screen.getByRole("button", { name: `Điều chỉnh ${sku}` }));
  const dialog = within(await dialogTitled("Điều chỉnh tồn kho"));
  fireEvent.change(dialog.getByRole("spinbutton"), { target: { value: String(amount) } });
  fireEvent.change(dialog.getByLabelText("Ghi chú"), { target: { value: "Nhập kho" } });
  fireEvent.click(dialog.getByRole("button", { name: "Lưu điều chỉnh" }));
};

beforeEach(() => {
  vi.mocked(api.getInventoryAPI)
    .mockReset()
    .mockImplementation(async () => page(rows));
  vi.mocked(api.adjustStockAPI).mockReset();
  vi.mocked(api.getInventoryMovementsAPI)
    .mockReset()
    .mockImplementation(async variantId => ({
      data: {
        data: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPage: 1,
        variant: rows.find(item => item.variantId === variantId)!
      },
      message: "success"
    }));
});

describe("Inventory list", () => {
  it("renders rows with badges, stock colours, the hint and product links", async () => {
    renderPage();
    const first = within((await screen.findByText("SKU-0")).closest("tr")!);
    expect(first.getByText("Đỏ / M")).toBeTruthy();
    expect(first.getAllByText("Đang bán", { selector: ".ant-tag" })).toHaveLength(2); // product + variant
    expect(first.getByRole("link", { name: "Áo thun" }).getAttribute("href")).toBe(
      `/products/${productId}`
    );
    expect(first.getByText("0").className).toContain("text-red-600");
    const low = within(screen.getByText("SKU-3").closest("tr")!);
    expect(low.getByText("Nháp")).toBeTruthy();
    expect(low.getByText("3").className).toContain("text-orange-500");
    const ok = within(screen.getByText("SKU-20").closest("tr")!);
    expect(ok.getByText("Ngừng bán")).toBeTruthy();
    expect(ok.getByText("20").className).not.toMatch(/text-(red|orange)/);
    expect(
      screen.getByText(
        "Đếm trên mọi biến thể chưa xoá — khác số liệu Dashboard (chỉ sản phẩm đang bán)."
      )
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Điều chỉnh/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Lịch sử/ })).toHaveLength(3);
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 });
  });

  it("updates the URL and refetches when a filter changes", async () => {
    const { router } = renderPage();
    await screen.findByText("SKU-0");
    fireEvent.click(screen.getByRole("radio", { name: "Hết hàng" }));
    await waitFor(() => expect(lastQuery()).toEqual({ stock: "out", page: 1, pageSize: 10 }));
    expect(router.state.location.search).toBe("?stock=out");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lọc trạng thái sản phẩm" }));
    fireEvent.click(
      await screen.findByText("Nháp", { selector: ".ant-select-item-option-content" })
    );
    await waitFor(() => expect(lastQuery()?.productStatus).toBe("DRAFT"));
    expect(router.state.location.search).toBe("?productStatus=DRAFT&stock=out");
  });

  it("shows the threshold input only for Sắp hết and commits a valid value", async () => {
    const { router } = renderPage();
    await screen.findByText("SKU-0");
    expect(screen.queryByRole("textbox", { name: "Ngưỡng sắp hết" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Sắp hết" }));
    const input = await screen.findByRole("textbox", { name: "Ngưỡng sắp hết" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(screen.getByText("Ngưỡng tồn kho phải là số nguyên từ 1 đến 1000")).toBeTruthy();
    expect(router.state.location.search).toBe("?stock=low");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    await waitFor(() =>
      expect(lastQuery()).toEqual({ stock: "low", lowStockThreshold: 12, page: 1, pageSize: 10 })
    );
    expect(router.state.location.search).toBe("?stock=low&lowStockThreshold=12");
    fireEvent.click(screen.getByRole("radio", { name: "Tất cả" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.queryByRole("textbox", { name: "Ngưỡng sắp hết" })).toBeNull();
  });

  it("shows an inline error and sends no request for an invalid URL param", async () => {
    const { router } = renderPage("/inventory?stock=critical&pageSize=7");
    expect(await screen.findByText("Chế độ tồn kho không hợp lệ")).toBeTruthy();
    expect(screen.getByText("Số biến thể mỗi trang không hợp lệ")).toBeTruthy();
    expect(api.getInventoryAPI).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dùng giá trị mặc định" }));
    await waitFor(() => expect(lastQuery()).toEqual({ page: 1, pageSize: 10 }));
    expect(router.state.location.search).toBe("");
  });

  it("shows a removable product chip named after the first row, or the id without rows", async () => {
    const { router, unmount } = renderPage(`/inventory?productId=${productId}`);
    const chip = (await screen.findByText("Sản phẩm: Áo thun")).closest(".ant-tag")!;
    expect(lastQuery()).toEqual({ productId, page: 1, pageSize: 10 });
    fireEvent.click(chip.querySelector(".ant-tag-close-icon")!);
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.queryByText(/^Sản phẩm: /)).toBeNull();
    unmount();

    vi.mocked(api.getInventoryAPI).mockResolvedValue(page([]));
    renderPage(`/inventory?productId=${productId}`);
    expect(await screen.findByText(`Sản phẩm: ${productId}`)).toBeTruthy();
    expect(await screen.findByText("Không có biến thể")).toBeTruthy();
  });

  it("shows a read failure with retry", async () => {
    vi.mocked(api.getInventoryAPI).mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500));
    renderPage();
    expect(await screen.findByText("Máy chủ lỗi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("SKU-0")).toBeTruthy();
  });

  it("moves back to the last page when the requested page no longer exists", async () => {
    vi.mocked(api.getInventoryAPI).mockImplementation(async query =>
      query.page === 9 ? page([], 2) : page(rows, 2)
    );
    const { router } = renderPage("/inventory?page=9");
    await screen.findByText("SKU-0");
    expect(router.state.location.search).toBe("?page=2");
    expect(lastQuery()?.page).toBe(2);
  });
});

describe("Inventory adjust", () => {
  it("opens the modal for the clicked row and replaces that row with the response row", async () => {
    vi.mocked(api.adjustStockAPI).mockResolvedValue({
      data: adjusted(rows[1], 13),
      message: "success"
    });
    renderPage();
    await screen.findByText("SKU-3");
    await adjust("SKU-3", 10);
    expect(within(screen.getByRole("dialog")).getByText(/SKU-3/)).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("3 → 13")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.adjustStockAPI).toHaveBeenCalledWith("v3", { delta: 10, note: "Nhập kho" });
    expect(cellOf("SKU-3").getByText("13")).toBeTruthy();
    expect(api.getInventoryAPI).toHaveBeenCalledTimes(1);
  });

  it("drops a replaced row, showing the server row again, after the next list read", async () => {
    vi.mocked(api.adjustStockAPI).mockResolvedValue({
      data: adjusted(rows[1], 13),
      message: "success"
    });
    renderPage();
    await screen.findByText("SKU-3");
    await adjust("SKU-3", 10);
    await waitFor(() => expect(cellOf("SKU-3").getByText("13")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(api.getInventoryAPI).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cellOf("SKU-3").getByText("3")).toBeTruthy());
    expect(cellOf("SKU-3").queryByText("13")).toBeNull();
  });

  it("keeps two successive replacements made before the next read", async () => {
    vi.mocked(api.adjustStockAPI)
      .mockResolvedValueOnce({ data: adjusted(rows[1], 13), message: "success" })
      .mockResolvedValueOnce({ data: adjusted(rows[2], 25), message: "success" });
    renderPage();
    await screen.findByText("SKU-3");
    await adjust("SKU-3", 10);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await adjust("SKU-20", 5);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cellOf("SKU-3").getByText("13")).toBeTruthy();
    expect(cellOf("SKU-20").getByText("25")).toBeTruthy();
    expect(api.getInventoryAPI).toHaveBeenCalledTimes(1);
  });

  it("closes the modal and refetches the list when the variant is gone", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValue(
      new ApiError("Biến thể không tồn tại", 404, { code: INVENTORY_ERROR.VARIANT_NOT_FOUND })
    );
    renderPage();
    await screen.findByText("SKU-3");
    await adjust("SKU-3", 10);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(api.getInventoryAPI).toHaveBeenCalledTimes(2));
  });
});

describe("Inventory history", () => {
  // Closing the modal over an open drawer leaves antd's portal node in <body>; drop it between tests.
  afterEach(() => document.querySelectorAll(".ant-modal-root").forEach(node => node.remove()));

  it("opens the drawer for the clicked row", async () => {
    renderPage();
    await screen.findByText("SKU-3");
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử SKU-3" }));
    const drawer = within(await dialogTitled("Lịch sử tồn kho"));
    await waitFor(() => expect(api.getInventoryMovementsAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.getInventoryMovementsAPI).mock.lastCall?.[0]).toBe("v3");
    expect(await drawer.findByText("Lịch sử tồn kho")).toBeTruthy();
    expect(await drawer.findByText("SKU-3")).toBeTruthy();
  });

  it("refetches page 1 after an adjustment of the variant whose drawer is open", async () => {
    vi.mocked(api.adjustStockAPI).mockResolvedValue({
      data: adjusted(rows[1], 13),
      message: "success"
    });
    renderPage();
    await screen.findByText("SKU-3");
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử SKU-3" }));
    await waitFor(() => expect(api.getInventoryMovementsAPI).toHaveBeenCalledTimes(1));
    await adjust("SKU-3", 10);
    await waitFor(() => expect(api.getInventoryMovementsAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.getInventoryMovementsAPI).mock.lastCall?.slice(0, 2)).toEqual([
      "v3",
      { page: 1, pageSize: 10 }
    ]);
  });

  it("does not refetch the drawer after an adjustment of another variant", async () => {
    vi.mocked(api.adjustStockAPI).mockResolvedValue({
      data: adjusted(rows[2], 25),
      message: "success"
    });
    renderPage();
    await screen.findByText("SKU-3");
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử SKU-3" }));
    await waitFor(() => expect(api.getInventoryMovementsAPI).toHaveBeenCalledTimes(1));
    await adjust("SKU-20", 5);
    await waitFor(() => expect(cellOf("SKU-20").getByText("25")).toBeTruthy());
    expect(api.getInventoryMovementsAPI).toHaveBeenCalledTimes(1);
  });
});
