import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { errorNotification, warningNotification } from "@/utils/notification";
import * as api from "@/services/products";
import * as categoriesApi from "@/services/categories";
import * as combosApi from "@/services/combos";
import Products from "./index";

vi.mock("@/services/categories", () => ({ listCategoriesAPI: vi.fn() }));
vi.mock("@/services/products", () => ({
  listProductsAPI: vi.fn(),
  changeProductStatusAPI: vi.fn()
}));
vi.mock("@/services/combos", () => ({ listAffectedCombosAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn(),
  warningNotification: vi.fn()
}));

const categoryId = "000000000000000000000002";
const row: api.ProductListRow = {
  _id: "p1",
  name: "Áo thun",
  slug: "ao-thun",
  status: "DRAFT",
  image: "/images/ao.jpg",
  variantCount: 3,
  activeVariantCount: 2,
  minPrice: 100000,
  maxPrice: 200000,
  totalStock: 15,
  revision: 4,
  updated_at: "2026-10-09T03:00:00.000Z"
};
const page = (data: api.ProductListRow[]) => ({
  data: { data, total: data.length, page: 1, pageSize: 20, totalPage: 1 },
  message: "success"
});
const profile = {
  _id: "admin-a",
  email: "admin@example.test",
  phone: "",
  firstName: "Admin",
  lastName: "",
  roles: ["ADMIN"],
  status: "ACTIVE"
};
const renderList = (path = "/products") => {
  const router = createMemoryRouter(
    [
      { path: "/products", element: <Products /> },
      { path: "/catalog/combos", element: <p>Combo cần xử lý</p> }
    ],
    {
      initialEntries: [path]
    }
  );
  return { router, ...render(<RouterProvider router={router} />) };
};
const select = async (label: string, text: string) => {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByText(text, { selector: ".ant-select-item-option-content" }));
};
const lastListQuery = () => vi.mocked(api.listProductsAPI).mock.lastCall?.[0];

beforeEach(() => {
  useAppStore.getState().setProfile(profile);
  vi.mocked(api.listProductsAPI)
    .mockReset()
    .mockImplementation(async query =>
      page(query.status === "DELETED" ? [{ ...row, status: "DELETED" }] : [row])
    );
  vi.mocked(categoriesApi.listCategoriesAPI)
    .mockReset()
    .mockResolvedValue({
      data: [{ _id: categoryId, name: "Áo" }] as categoriesApi.Category[],
      message: "success"
    });
  vi.mocked(api.changeProductStatusAPI)
    .mockReset()
    .mockResolvedValue({ data: {} as api.ProductEditorView, message: "success" });
  vi.mocked(errorNotification).mockReset();
  vi.mocked(warningNotification).mockReset();
  vi.mocked(combosApi.listAffectedCombosAPI)
    .mockReset()
    .mockResolvedValue({ data: { combos: [] }, message: "success" });
});

describe("Products list", () => {
  it("renders thumbnail, status, variants, price range and stock", async () => {
    renderList();
    const cells = within((await screen.findByText("Áo thun")).closest("tr")!);
    expect(cells.getByRole("img", { name: "Áo thun" })).toBeTruthy();
    expect(cells.getByText("Nháp")).toBeTruthy();
    expect(cells.getByText("2/3")).toBeTruthy();
    expect(cells.getByText(/100\.000.*–.*200\.000/)).toBeTruthy();
    expect(cells.getByText("15")).toBeTruthy();
    expect(lastListQuery()).toEqual({ page: 1, pageSize: 20 });
  });

  it("debounces search into the URL and the API query", async () => {
    const { router } = renderList();
    await screen.findByText("Áo thun");
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm sản phẩm" }), {
      target: { value: " ao " }
    });
    expect(router.state.location.search).toBe("");
    await waitFor(() => expect(router.state.location.search).toBe("?q=ao"), { timeout: 2000 });
    await waitFor(() => expect(lastListQuery()).toMatchObject({ q: "ao", page: 1 }));
  });

  it("filters by status and category through the URL", async () => {
    const { router } = renderList("/products?page=2");
    await screen.findByText("Áo thun");
    await select("Lọc danh mục", "Áo");
    await waitFor(() => expect(router.state.location.search).toBe(`?categoryId=${categoryId}`));
    await select("Lọc trạng thái", "Đang bán");
    await waitFor(() =>
      expect(lastListQuery()).toEqual({ status: "PUBLISH", categoryId, page: 1, pageSize: 20 })
    );
  });

  it("shows Restore and hides Archive under the Archived filter", async () => {
    renderList("/products?status=DELETED");
    await screen.findByText("Áo thun");
    expect(screen.queryByRole("button", { name: "Lưu trữ Áo thun" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục Áo thun" }));
    await waitFor(() =>
      expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
        status: "DRAFT",
        expectedRevision: 4
      })
    );
  });

  it("stops selling only after confirmation", async () => {
    vi.mocked(api.listProductsAPI).mockResolvedValue(page([{ ...row, status: "PUBLISH" }]));
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng bán Áo thun" }));
    expect(api.changeProductStatusAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Tiếp tục" }));
    await waitFor(() =>
      expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
        status: "UNPUBLISH",
        expectedRevision: 4
      })
    );
  });

  it("archives only after confirmation, sending the row revision", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ Áo thun" }));
    expect(api.changeProductStatusAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Tiếp tục" }));
    await waitFor(() =>
      expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
        status: "DELETED",
        expectedRevision: 4
      })
    );
    await waitFor(() => expect(api.listProductsAPI).toHaveBeenCalledTimes(2));
  });

  it("archives with two affected combos once and offers the attention list", async () => {
    vi.mocked(combosApi.listAffectedCombosAPI).mockResolvedValue({
      data: {
        combos: [
          { _id: "c1", name: "Combo 1", status: "PUBLISH" },
          { _id: "c2", name: "Combo 2", status: "DRAFT" }
        ]
      },
      message: "success"
    });
    const { router } = renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ Áo thun" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Combo 1");
    expect(dialog.textContent).toContain("Combo 2");
    const okButton = within(dialog).getByRole("button", { name: "Tiếp tục" });
    fireEvent.click(okButton);
    fireEvent.click(okButton);
    await waitFor(() => expect(api.changeProductStatusAPI).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(warningNotification).toHaveBeenCalledWith(
        "2 combo bị ảnh hưởng",
        expect.objectContaining({ actions: expect.anything() })
      )
    );
    render(<>{vi.mocked(warningNotification).mock.calls[0][1]?.actions}</>);
    fireEvent.click(screen.getByRole("button", { name: "Sửa combo" }));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        "/catalog/combos?attention=1"
      )
    );
  });

  it("shows a warning in the dialog when combo lookup fails, then archives", async () => {
    vi.mocked(combosApi.listAffectedCombosAPI).mockRejectedValue(new Error("offline"));
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ Áo thun" }));
    expect((await screen.findByRole("dialog")).textContent).toContain(
      "Không kiểm tra được combo bị ảnh hưởng"
    );
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(api.changeProductStatusAPI).toHaveBeenCalledTimes(1));
  });

  it("uses the previous plain question when no combos are affected", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ Áo thun" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Lưu trữ sản phẩm này?");
    expect(dialog.textContent).not.toContain("Combo bị ảnh hưởng");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    expect(api.changeProductStatusAPI).not.toHaveBeenCalled();
  });

  it("refetches the list and explains a 409 from a row action", async () => {
    vi.mocked(api.changeProductStatusAPI).mockRejectedValue(
      new ApiError("Sản phẩm vừa được thay đổi, vui lòng tải lại", 409)
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Áo thun" }));
    expect(await screen.findByText("Sản phẩm vừa được thay đổi, vui lòng thử lại")).toBeTruthy();
    expect(api.listProductsAPI).toHaveBeenCalledTimes(2);
  });

  it("lists missing publish requirements in Vietnamese", async () => {
    vi.mocked(api.changeProductStatusAPI).mockRejectedValue(
      new ApiError("Sản phẩm chưa đủ điều kiện để đăng bán", 400, {
        code: "product00016",
        missing: ["IMAGE", "DESCRIPTION"]
      })
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Áo thun" }));
    await waitFor(() =>
      expect(errorNotification).toHaveBeenCalledWith(
        "Sản phẩm chưa đủ điều kiện để đăng bán: thiếu ảnh sản phẩm, mô tả sản phẩm"
      )
    );
  });

  it("shows a load error with Thử lại that refetches", async () => {
    vi.mocked(api.listProductsAPI).mockRejectedValueOnce(new ApiError("Mất kết nối"));
    renderList();
    expect(await screen.findByText("Mất kết nối")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Áo thun")).toBeTruthy();
  });
});
