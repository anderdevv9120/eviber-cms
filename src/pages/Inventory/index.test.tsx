import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError } from "@/utils/request";
import * as api from "@/services/inventory";
import Inventory from "./index";

vi.mock("@/services/inventory", () => ({
  getInventoryAPI: vi.fn()
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

beforeEach(() => {
  vi.mocked(api.getInventoryAPI)
    .mockReset()
    .mockImplementation(async () => page(rows));
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
