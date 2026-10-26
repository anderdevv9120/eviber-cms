import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/categories";
import * as imagesApi from "@/services/images";
import { CATEGORY_ERROR } from "./category-errors";
import Categories from "./index";
import { PATH } from "@/constants/paths";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/categories", () => ({
  listCategoriesAPI: vi.fn(),
  createCategoryAPI: vi.fn(),
  updateCategoryAPI: vi.fn(),
  deleteCategoryAPI: vi.fn(),
  reorderCategoriesAPI: vi.fn()
}));
vi.mock("@/services/images", () => ({ uploadImageAPI: vi.fn() }));

const category = (
  id: string,
  name: string,
  sortOrder: number,
  productCount = 0,
  couponCount = 0,
  comboCount = 0
): api.Category => ({
  _id: id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  description: "",
  imageUrl: `/images/${id}.jpg`,
  sortOrder,
  revision: 0,
  productCount,
  couponCount,
  comboCount
});
const shirts = category("a", "Ao So Mi", 0, 3, 2, 4);
const pants = category("b", "Quan Jean", 1);
const ok = <T,>(data: T) => ({ data, message: "success" });

const setup = () => {
  const router = createMemoryRouter(
    [
      { path: PATH.CATEGORIES, element: <Categories /> },
      { path: "/products", element: <p>Trang sản phẩm</p> },
      { path: "/other", element: <p>Trang khác</p> }
    ],
    { initialEntries: [PATH.CATEGORIES] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const rowNames = () => rows().map(row => row.querySelector("strong")?.textContent);
const drag = (label: string, target: HTMLElement) => {
  const handle = screen.getByRole("button", { name: `Sắp xếp ${label}` });
  const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(handle, { dataTransfer });
};
const isDisabled = (name: string) => screen.getByRole("button", { name }).hasAttribute("disabled");

describe("categories page", () => {
  beforeEach(() => {
    vi.mocked(api.listCategoriesAPI)
      .mockReset()
      .mockResolvedValue(ok([shirts, pants]));
    vi.mocked(api.reorderCategoriesAPI)
      .mockReset()
      .mockResolvedValue(ok([pants, shirts]));
    vi.mocked(api.deleteCategoryAPI).mockReset().mockResolvedValue(ok(true));
  });

  it("shows a load error and retries", async () => {
    vi.mocked(api.listCategoriesAPI).mockRejectedValueOnce(new ApiError("Mất kết nối", 500));
    setup();
    expect(await screen.findByText("Mất kết nối")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Ao So Mi")).toBeTruthy();
  });

  it("shows the empty state with the add button", async () => {
    vi.mocked(api.listCategoriesAPI).mockResolvedValue(ok([]));
    setup();
    expect(await screen.findByText("Chưa có danh mục")).toBeTruthy();
    expect(isDisabled("Thêm danh mục")).toBe(false);
  });

  it("lists categories in server order with thumbnails and counts", async () => {
    setup();
    await screen.findByText("Ao So Mi");
    expect(rowNames()).toEqual(["Ao So Mi", "Quan Jean"]);
    expect(rows()[0].querySelector("img")?.getAttribute("src")).toBe(
      "http://api.test:8001/images/a.jpg"
    );
    expect(within(rows()[0]).getByText("ao-so-mi")).toBeTruthy();
    expect(within(rows()[0]).getByText("3")).toBeTruthy();
    expect(within(rows()[0]).getByText("2")).toBeTruthy();
    expect(within(rows()[0]).getByText("4")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Combo" })).toBeTruthy();
  });

  it("saves a dragged order and reloads", async () => {
    setup();
    await screen.findByText("Ao So Mi");
    drag("Quan Jean", rows()[0]);
    expect(rowNames()).toEqual(["Quan Jean", "Ao So Mi"]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await waitFor(() => expect(api.reorderCategoriesAPI).toHaveBeenCalledWith(["b", "a"]));
    await waitFor(() => expect(api.listCategoriesAPI).toHaveBeenCalledTimes(2));
  });

  it("discards a dragged order", async () => {
    setup();
    await screen.findByText("Ao So Mi");
    drag("Quan Jean", rows()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Hủy thay đổi" }));
    expect(rowNames()).toEqual(["Ao So Mi", "Quan Jean"]);
    expect(screen.queryByRole("button", { name: "Lưu thứ tự" })).toBeNull();
  });

  it("disables add, edit and delete while the order is unsaved", async () => {
    setup();
    await screen.findByText("Ao So Mi");
    expect(isDisabled("Thêm danh mục")).toBe(false);
    drag("Quan Jean", rows()[0]);
    expect(isDisabled("Thêm danh mục")).toBe(true);
    expect(isDisabled("Sửa Ao So Mi")).toBe(true);
    expect(isDisabled("Xóa Quan Jean")).toBe(true);
  });

  it("reloads and discards the draft when the order is stale", async () => {
    vi.mocked(api.reorderCategoriesAPI).mockRejectedValue(
      new ApiError("stale", 409, { code: CATEGORY_ERROR.ORDER_STALE })
    );
    setup();
    await screen.findByText("Ao So Mi");
    drag("Quan Jean", rows()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    expect(
      await screen.findByText(
        "Danh sách danh mục đã thay đổi. Đã tải lại; kiểm tra rồi thao tác lại."
      )
    ).toBeTruthy();
    expect(api.listCategoriesAPI).toHaveBeenCalledTimes(2);
    expect(rowNames()).toEqual(["Ao So Mi", "Quan Jean"]);
    expect(screen.queryByRole("button", { name: "Lưu thứ tự" })).toBeNull();
  });

  it("deletes a category after confirmation and reloads", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Quan Jean" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa danh mục" }));
    await waitFor(() => expect(api.deleteCategoryAPI).toHaveBeenCalledWith("b"));
    await waitFor(() => expect(api.listCategoriesAPI).toHaveBeenCalledTimes(2));
  });

  it("explains an in-use category with links to its products and vouchers", async () => {
    vi.mocked(api.deleteCategoryAPI).mockRejectedValue(
      new ApiError("in use", 409, {
        code: CATEGORY_ERROR.IN_USE,
        productCount: 3,
        couponCount: 2,
        comboCount: 4
      })
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Ao So Mi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa danh mục" }));
    expect(
      await screen.findByText(
        "Không thể xóa: đang dùng bởi 3 sản phẩm (kể cả đã lưu trữ) và 2 voucher và 4 combo"
      )
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" }).getAttribute("href")).toBe(
      "/products?categoryId=a"
    );
    expect(screen.getByRole("link", { name: "Xem voucher" }).getAttribute("href")).toBe(
      "/vouchers"
    );
    expect(screen.getByRole("link", { name: "Xem combo" }).getAttribute("href")).toBe(
      "/catalog/combos"
    );
  });

  it("adds a category from the form and reloads", async () => {
    vi.mocked(api.createCategoryAPI).mockResolvedValue(ok(pants));
    vi.mocked(imagesApi.uploadImageAPI).mockResolvedValue(ok({ path: "/images/b.jpg" }));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Thêm danh mục" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tên danh mục"), {
      target: { value: "Quan Jean" }
    });
    fireEvent.change(dialog.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(["x"], "b.png", { type: "image/png" })] }
    });
    await within(dialog).findByRole("img", { name: "Ảnh danh mục xem trước" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu danh mục" }));
    await waitFor(() => expect(api.createCategoryAPI).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.listCategoriesAPI).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks before leaving with an unsaved order", async () => {
    const router = setup();
    await screen.findByText("Ao So Mi");
    drag("Quan Jean", rows()[0]);
    void router.navigate("/other");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Thứ tự chưa được lưu").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    expect(await screen.findByText("Trang khác")).toBeTruthy();
  });
});

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("category permission actions", () => {
  it.each([
    ["CATEGORY_CREATE", false, true, true, true],
    ["CATEGORY_UPDATE", true, false, true, false],
    ["CATEGORY_DELETE", true, true, false, true]
  ] as const)(
    "uses %s only for its corresponding actions",
    async (permission, create, update, remove, reorder) => {
      useAppStore.getState().setProfile(staffProfile(["CATEGORY_READ", permission]));
      setup();
      await screen.findByText("Ao So Mi");
      expect(isDisabled("Thêm danh mục")).toBe(create);
      expect(isDisabled("Sửa Ao So Mi")).toBe(update);
      expect(isDisabled("Xóa Quan Jean")).toBe(remove);
      expect(isDisabled("Sắp xếp Ao So Mi")).toBe(reorder);
    }
  );

  beforeEach(() => {
    vi.mocked(api.listCategoriesAPI)
      .mockReset()
      .mockResolvedValue(ok([shirts, pants]));
    vi.mocked(api.deleteCategoryAPI).mockReset().mockResolvedValue(ok(true));
  });
  it("keeps read data but denies create/update/delete/reorder to read-only staff", async () => {
    useAppStore.getState().setProfile(staffProfile(["CATEGORY_READ"]));
    setup();
    await screen.findByText("Ao So Mi");
    for (const name of ["Thêm danh mục", "Sửa Ao So Mi", "Xóa Ao So Mi", "Sắp xếp Ao So Mi"])
      expect(isDisabled(name)).toBe(true);
    expect(api.deleteCategoryAPI).not.toHaveBeenCalled();
  });
  it("rechecks a pending delete confirmation after permission removal", async () => {
    setup();
    await screen.findByText("Quan Jean");
    fireEvent.click(screen.getByRole("button", { name: "Xóa Quan Jean" }));
    const confirm = await screen.findByRole("button", { name: "Xóa danh mục" });
    act(() => useAppStore.getState().setProfile(staffProfile(["CATEGORY_READ"])));
    fireEvent.click(confirm);
    expect(api.deleteCategoryAPI).not.toHaveBeenCalled();
  });
});
