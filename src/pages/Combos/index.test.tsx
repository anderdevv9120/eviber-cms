import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { errorNotification } from "@/utils/notification";
import * as api from "@/services/combos";
import { deferred } from "@/test/attribute-fixtures";
import Combos from "./index";

vi.mock("@/services/combos", () => ({
  listCombosAPI: vi.fn(),
  changeComboStatusAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const row: api.ComboListRow = {
  _id: "p1",
  name: "Combo dạo phố",
  slug: "ao-thun",
  status: "DRAFT",
  image: "/images/ao.jpg",
  pricing: { mode: "PERCENT", value: 15 },
  priceRange: { min: 100000, max: 200000 },
  availability: "AVAILABLE",
  issues: [],
  revision: 4,
  updated_at: "2026-10-09T03:00:00.000Z"
};
const page = (data: api.ComboListRow[]) => ({
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
const renderList = (path = "/catalog/combos") => {
  const router = createMemoryRouter(
    [
      { path: "/catalog/combos", element: <Combos /> },
      { path: "/catalog/combos/new", element: <div>Tạo combo ở Task 10</div> }
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
const lastListQuery = () => vi.mocked(api.listCombosAPI).mock.lastCall?.[0];

beforeEach(() => {
  useAppStore.getState().setProfile(profile);
  vi.mocked(api.listCombosAPI)
    .mockReset()
    .mockImplementation(async query =>
      page(query.status === "DELETED" ? [{ ...row, status: "DELETED" }] : [row])
    );
  vi.mocked(api.changeComboStatusAPI)
    .mockReset()
    .mockResolvedValue({ data: {} as api.ComboEditorView, message: "success" });
  vi.mocked(errorNotification).mockReset();
});

describe("Combos list", () => {
  it("renders thumbnail, status, variants, price range and stock", async () => {
    renderList();
    const cells = within((await screen.findByText("Combo dạo phố")).closest("tr")!);
    expect(cells.getByRole("img", { name: "Combo dạo phố" })).toBeTruthy();
    expect(cells.getByText("Nháp")).toBeTruthy();
    expect(cells.getByText("−15%")).toBeTruthy();
    expect(cells.getByText(/100\.000.*–.*200\.000/)).toBeTruthy();
    expect(cells.getByText("Còn hàng")).toBeTruthy();
    expect(lastListQuery()).toEqual({ page: 1, pageSize: 20 });
  });

  it("debounces search into the URL and the API query", async () => {
    const { router } = renderList();
    await screen.findByText("Combo dạo phố");
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm combo" }), {
      target: { value: " ao " }
    });
    expect(router.state.location.search).toBe("");
    await waitFor(() => expect(router.state.location.search).toBe("?q=ao"), { timeout: 2000 });
    await waitFor(() => expect(lastListQuery()).toMatchObject({ search: "ao", page: 1 }));
  });

  it("filters status and toggles attention in URL and API query", async () => {
    const { router } = renderList();
    await screen.findByText("Combo dạo phố");
    fireEvent.click(screen.getByRole("checkbox", { name: "Lọc cần xử lý" }));
    await waitFor(() => expect(router.state.location.search).toBe("?attention=1"));
    await waitFor(() =>
      expect(lastListQuery()).toEqual({ attention: "true", page: 1, pageSize: 20 })
    );
    await select("Lọc trạng thái", "Đang bán");
    await waitFor(() =>
      expect(lastListQuery()).toEqual({
        status: "PUBLISH",
        attention: "true",
        page: 1,
        pageSize: 20
      })
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Lọc cần xử lý" }));
    await waitFor(() => expect(router.state.location.search).toBe("?status=PUBLISH"));
    await waitFor(() =>
      expect(lastListQuery()).toEqual({ status: "PUBLISH", page: 1, pageSize: 20 })
    );
  });

  it("shows attention reasons from live piece issues in a tooltip", async () => {
    vi.mocked(api.listCombosAPI).mockResolvedValue(
      page([
        {
          ...row,
          availability: "HIDDEN",
          issues: [{ productId: "shoe", productName: "Giày canvas", kind: "PRODUCT_NOT_PUBLISHED" }]
        }
      ])
    );
    renderList();
    const tag = await screen.findByText("Cần xử lý");
    fireEvent.mouseOver(tag);
    expect(await screen.findByRole("tooltip")).toHaveProperty("textContent", "Giày canvas đã ẩn");
  });

  it("renders fixed pricing, unavailable stock and absent price/image without inventing fields", async () => {
    vi.mocked(api.listCombosAPI).mockResolvedValue(
      page([
        {
          ...row,
          image: null,
          pricing: { mode: "FIXED", value: 150000 },
          priceRange: null,
          availability: "OUT_OF_STOCK"
        }
      ])
    );
    renderList();
    const cells = within(
      (await screen.findByRole("link", { name: "Combo dạo phố" })).closest("tr")!
    );
    expect(cells.getByText(/150\.000/)).toBeTruthy();
    expect(cells.getByText("Hết hàng")).toBeTruthy();
    expect(cells.getAllByText("—")).toHaveLength(2);
    expect(cells.getByRole("link", { name: "Combo dạo phố" }).getAttribute("href")).toBe(
      "/catalog/combos/p1"
    );
    expect(cells.queryByRole("link", { name: "Sửa combo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thêm combo" }));
    expect(await screen.findByText("Tạo combo ở Task 10")).toBeTruthy();
  });

  it("publishes with the current revision and reloads", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Combo dạo phố" }));
    await waitFor(() =>
      expect(api.changeComboStatusAPI).toHaveBeenCalledWith("p1", {
        status: "PUBLISH",
        expectedRevision: 4
      })
    );
    await waitFor(() => expect(api.listCombosAPI).toHaveBeenCalledTimes(2));
  });

  it("shows Restore and hides Archive under the Archived filter", async () => {
    renderList("/catalog/combos?status=DELETED");
    await screen.findByText("Combo dạo phố");
    expect(screen.queryByRole("button", { name: "Lưu trữ Combo dạo phố" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục Combo dạo phố" }));
    await waitFor(() =>
      expect(api.changeComboStatusAPI).toHaveBeenCalledWith("p1", {
        status: "DRAFT",
        expectedRevision: 4
      })
    );
  });

  it("stops selling only after confirmation", async () => {
    vi.mocked(api.listCombosAPI).mockResolvedValue(page([{ ...row, status: "PUBLISH" }]));
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng bán Combo dạo phố" }));
    expect(api.changeComboStatusAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng bán combo" }));
    await waitFor(() =>
      expect(api.changeComboStatusAPI).toHaveBeenCalledWith("p1", {
        status: "UNPUBLISH",
        expectedRevision: 4
      })
    );
  });

  it("archives only after confirmation, sending the row revision", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ Combo dạo phố" }));
    expect(api.changeComboStatusAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ combo" }));
    await waitFor(() =>
      expect(api.changeComboStatusAPI).toHaveBeenCalledWith("p1", {
        status: "DELETED",
        expectedRevision: 4
      })
    );
    await waitFor(() => expect(api.listCombosAPI).toHaveBeenCalledTimes(2));
  });

  it("refetches the list and explains a 409 from a row action", async () => {
    vi.mocked(api.changeComboStatusAPI).mockRejectedValue(
      new ApiError("Combo vừa được thay đổi, vui lòng tải lại", 409)
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Combo dạo phố" }));
    expect(await screen.findByText("Combo vừa được thay đổi, vui lòng tải lại")).toBeTruthy();
    expect(api.listCombosAPI).toHaveBeenCalledTimes(2);
  });

  it.each(["success", 409, 404] as const)(
    "refreshes the current filters and page after a deferred status action: %s",
    async outcome => {
      const mutation = deferred<Awaited<ReturnType<typeof api.changeComboStatusAPI>>>();
      const pendingPage = deferred<ReturnType<typeof page>>();
      vi.mocked(api.changeComboStatusAPI).mockReturnValue(mutation.promise);
      vi.mocked(api.listCombosAPI).mockResolvedValue({
        ...page([row]),
        data: { ...page([row]).data, total: 40, totalPage: 2 }
      });
      const { router } = renderList();
      fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Combo dạo phố" }));
      await waitFor(() => expect(api.changeComboStatusAPI).toHaveBeenCalledTimes(1));

      await select("Lọc trạng thái", "Đang bán");
      await screen.findByRole("link", { name: row.name });
      fireEvent.click(screen.getByRole("checkbox", { name: "Lọc cần xử lý" }));
      await screen.findByRole("link", { name: row.name });
      vi.mocked(api.listCombosAPI).mockReturnValueOnce(pendingPage.promise);
      fireEvent.click(screen.getByTitle("2"));
      await waitFor(() =>
        expect(lastListQuery()).toEqual({
          status: "PUBLISH",
          attention: "true",
          page: 2,
          pageSize: 20
        })
      );
      expect(router.state.location.search).toBe("?status=PUBLISH&attention=1&page=2");
      const pendingSignal = vi.mocked(api.listCombosAPI).mock.lastCall?.[1];
      const refreshed = {
        ...row,
        name: "Combo vừa tải lại",
        status: "PUBLISH" as const,
        revision: 5
      };
      vi.mocked(api.listCombosAPI).mockResolvedValue({
        ...page([refreshed]),
        data: { ...page([refreshed]).data, page: 2, total: 40, totalPage: 2 }
      });

      await act(async () => {
        if (outcome === "success")
          mutation.resolve({ data: {} as api.ComboEditorView, message: "success" });
        else mutation.reject(new ApiError("Combo không còn mới nhất", outcome));
      });
      await act(async () => pendingPage.resolve(page([row])));

      expect(lastListQuery()).toEqual({
        status: "PUBLISH",
        attention: "true",
        page: 2,
        pageSize: 20
      });
      expect(pendingSignal?.aborted).toBe(true);
      expect(await screen.findByRole("link", { name: refreshed.name })).toBeTruthy();
      expect(screen.queryByLabelText("Đang tải combo")).toBeNull();
      expect(router.state.location.search).toBe("?status=PUBLISH&attention=1&page=2");
      if (outcome !== "success")
        expect(screen.getByText("Combo vừa được thay đổi, vui lòng tải lại")).toBeTruthy();
    }
  );

  it("lists missing publish requirements in Vietnamese", async () => {
    vi.mocked(api.changeComboStatusAPI).mockRejectedValue(
      new ApiError("Combo chưa đủ điều kiện để đăng bán", 400, {
        code: "combo00007",
        missing: ["CATEGORY", "PIECE_PUBLISHED", "LOCKED_VARIANT_ACTIVE"]
      })
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng bán Combo dạo phố" }));
    await waitFor(() =>
      expect(errorNotification).toHaveBeenCalledWith(
        "Combo chưa đủ điều kiện để đăng bán: thiếu danh mục, sản phẩm thành phần đang bán, biến thể cố định đang bán"
      )
    );
  });

  it("shows a load error with Thử lại that refetches", async () => {
    vi.mocked(api.listCombosAPI).mockRejectedValueOnce(new ApiError("Mất kết nối"));
    renderList();
    expect(await screen.findByText("Mất kết nối")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Combo dạo phố")).toBeTruthy();
  });
});
