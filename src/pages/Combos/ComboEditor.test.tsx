import { ownerProfile } from "@/test/access-fixtures";
import "@/test/attribute-fixtures";
import { deferred } from "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import type { ComboEditorView, ComboProductOption } from "@/services/combos";
import * as combos from "@/services/combos";
import * as categoriesApi from "@/services/categories";
import { uploadImageAPI } from "@/services/images";
import { successNotification } from "@/utils/notification";
import ComboEditor from "./ComboEditor";
import { comboPublishMissing, validateComboPieces } from "./combo-publish";

vi.mock("@/services/combos", () => ({
  getComboAPI: vi.fn(),
  createComboAPI: vi.fn(),
  updateComboAPI: vi.fn(),
  changeComboStatusAPI: vi.fn(),
  listComboProductOptionsAPI: vi.fn()
}));
vi.mock("@/services/categories", () => ({ listCategoriesAPI: vi.fn() }));
vi.mock("@/services/images", () => ({ uploadImageAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
vi.mock("@/components/RichEditor", () => ({ RichEditor: () => <div>Mô tả combo</div> }));

const ok = <T,>(data: T) => ({ data, message: "success" });
const piece = (id: string, status: "PUBLISH" | "DRAFT" = "PUBLISH"): ComboProductOption => ({
  _id: id,
  name: `Món ${id}`,
  slug: id,
  status,
  image: null,
  variants: [
    {
      _id: `${id}-a`,
      sku: `${id}-a`,
      price: 159000,
      originalPrice: 180000,
      status: "ACTIVE",
      inventoryCount: 0,
      attributeLabels: ["M"]
    },
    {
      _id: `${id}-b`,
      sku: `${id}-b`,
      price: 199000,
      originalPrice: 210000,
      status: "INACTIVE",
      inventoryCount: 0,
      attributeLabels: ["L"]
    }
  ]
});
const options = [piece("p1"), piece("p2"), piece("p3", "DRAFT")];
const combo = (overrides: Partial<ComboEditorView> = {}): ComboEditorView => ({
  _id: "combo-1",
  name: "Combo mùa hè",
  slug: "combo-mua-he",
  status: "DRAFT",
  description: "",
  images: [],
  categoryIds: ["c1"],
  seo: { metaTitle: "", metaDescription: "", metaKeywords: [] },
  pricing: { mode: "PERCENT", value: 15 },
  items: options.slice(0, 2).map(product => ({
    productId: product._id,
    product,
    quantity: 1,
    mode: "CHOOSE",
    variantId: null
  })),
  availability: "HIDDEN",
  issues: [],
  publishMissing: [],
  revision: 3,
  updated_at: "2026-10-21T00:00:00Z",
  ...overrides
});

function renderEditor(path = "/catalog/combos/combo-1") {
  const router = createMemoryRouter(
    [
      { path: "/catalog/combos", element: <div>Danh sách</div> },
      { path: "/catalog/combos/new", element: <ComboEditor /> },
      { path: "/catalog/combos/:id", element: <ComboEditor /> }
    ],
    { initialEntries: [path] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
}

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn((file: File) => `blob:http://localhost/${file.name}`);
      static revokeObjectURL = vi.fn();
    }
  );
  vi.mocked(uploadImageAPI)
    .mockReset()
    .mockResolvedValue(ok({ path: "/images/combo.png" }));
  vi.mocked(successNotification).mockClear();
  useAppStore.getState().setProfile({
    _id: "admin",
    email: "admin@example.test",
    phone: "",
    firstName: "Admin",
    lastName: "",
    roles: ["SUPER_ADMIN"],
    access: ownerProfile.access,
    status: "ACTIVE"
  });
  vi.mocked(combos.getComboAPI).mockReset().mockResolvedValue(ok(combo()));
  vi.mocked(combos.createComboAPI)
    .mockReset()
    .mockImplementation(async input =>
      ok(combo({ _id: "created", name: input.name, revision: 0 }))
    );
  vi.mocked(combos.updateComboAPI)
    .mockReset()
    .mockResolvedValue(ok(combo({ revision: 4 })));
  vi.mocked(combos.changeComboStatusAPI)
    .mockReset()
    .mockResolvedValue(ok(combo({ status: "PUBLISH", revision: 5 })));
  vi.mocked(combos.listComboProductOptionsAPI)
    .mockReset()
    .mockResolvedValue(ok({ data: options, total: 3, page: 1, pageSize: 10, totalPage: 1 }));
  vi.mocked(categoriesApi.listCategoriesAPI)
    .mockReset()
    .mockResolvedValue(ok([{ _id: "c1", name: "Áo" }] as categoriesApi.Category[]));
});

describe("ComboEditor", () => {
  it("creates a combo from selected products with server-owned prices", async () => {
    const router = renderEditor("/catalog/combos/new");
    fireEvent.change(await screen.findByRole("textbox", { name: "Tên combo" }), {
      target: { value: "Combo mới" }
    });
    for (const id of ["p1", "p2"]) {
      fireEvent.mouseDown(screen.getByRole("combobox", { name: "Thêm sản phẩm combo" }));
      fireEvent.click(
        await screen.findByText(`Món ${id}`, { selector: ".ant-select-item-option-content" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Thêm món" }));
    }
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: { files: [new File(["image"], "combo.png", { type: "image/png" })] }
    });
    expect(uploadImageAPI).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.createComboAPI).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(combos.createComboAPI).mock.calls[0][0];
    expect(payload.name).toBe("Combo mới");
    expect(payload.pricing).toEqual({ mode: "PERCENT", value: 10 });
    expect(payload.images).toEqual(["/images/combo.png"]);
    expect(payload.items.map(item => item.productId)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(payload)).not.toMatch(/"(price|originalPrice)":/);
    await waitFor(() => expect(router.state.location.pathname).toBe("/catalog/combos/created"));
  });

  it("sends pieces and pricing without client price fields", async () => {
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề SEO" }), {
      target: { value: "Ưu đãi mùa hè" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    const [, payload] = vi.mocked(combos.updateComboAPI).mock.calls[0];
    expect(payload.expectedRevision).toBe(3);
    expect(payload.pricing).toEqual({ mode: "PERCENT", value: 15 });
    expect(payload.seo?.metaTitle).toBe("Ưu đãi mùa hè");
    expect(payload.items).toEqual([
      { productId: "p1", quantity: 1, mode: "CHOOSE", variantId: null },
      { productId: "p2", quantity: 1, mode: "CHOOSE", variantId: null }
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/"(price|originalPrice)":/);
  });

  it("prevents saving one piece", async () => {
    renderEditor("/catalog/combos/new");
    fireEvent.change(await screen.findByRole("textbox", { name: "Tên combo" }), {
      target: { value: "Combo test" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await screen.findByText(/ít nhất 2 món/);
    expect(combos.createComboAPI).not.toHaveBeenCalled();
  });

  it("does not call create when the required name is missing", async () => {
    renderEditor("/catalog/combos/new");
    await screen.findByRole("textbox", { name: "Tên combo" });
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: { files: [new File(["image"], "combo.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Kiểm tra lại thông tin combo.")).toBeTruthy();
    expect(combos.createComboAPI).not.toHaveBeenCalled();
    expect(uploadImageAPI).not.toHaveBeenCalled();
  });

  it.each(["Lưu", "Lưu & Đăng bán"])(
    "previews locally and waits for uploads and the combo write before completing %s",
    async button => {
      const upload = deferred<Awaited<ReturnType<typeof uploadImageAPI>>>();
      const save = deferred<Awaited<ReturnType<typeof combos.updateComboAPI>>>();
      vi.mocked(uploadImageAPI).mockReturnValue(upload.promise);
      vi.mocked(combos.updateComboAPI).mockReturnValue(save.promise);
      renderEditor();
      await screen.findByDisplayValue("Combo mùa hè");
      const file = new File(["image"], "combo.png", { type: "image/png" });
      fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
        target: { files: [file] }
      });
      expect(screen.getByAltText("Ảnh 1").getAttribute("src")).toBe(
        "blob:http://localhost/combo.png"
      );
      expect(uploadImageAPI).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() => expect(uploadImageAPI).toHaveBeenCalledWith(file));
      expect(combos.updateComboAPI).not.toHaveBeenCalled();
      expect(combos.changeComboStatusAPI).not.toHaveBeenCalled();
      expect(successNotification).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/).hasAttribute("disabled")).toBe(
        true
      );
      expect(screen.getByRole("button", { name: "Xóa ảnh 1" }).hasAttribute("disabled")).toBe(true);
      upload.resolve(ok({ path: "/images/combo.png" }));
      await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
      expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].images).toEqual([
        "/images/combo.png"
      ]);
      expect(successNotification).not.toHaveBeenCalled();
      save.resolve(ok(combo({ images: ["/images/combo.png"], revision: 4 })));
      await waitFor(() => expect(successNotification).toHaveBeenCalledTimes(1));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/combo.png");
    }
  );

  it("keeps image order and retries only unfinished uploads after a partial failure", async () => {
    vi.mocked(combos.getComboAPI).mockResolvedValue(ok(combo({ images: ["/images/old.png"] })));
    vi.mocked(uploadImageAPI)
      .mockResolvedValueOnce(ok({ path: "/images/b.png" }))
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValueOnce(ok({ path: "/images/a.png" }));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    const a = new File(["a"], "a.png", { type: "image/png" });
    const b = new File(["b"], "b.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: { files: [a, b] }
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Sắp xếp ảnh 3" }), { key: "ArrowUp" });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Upload failed")).toBeTruthy();
    expect(combos.updateComboAPI).not.toHaveBeenCalled();
    expect(successNotification).not.toHaveBeenCalled();
    expect(screen.getByAltText("Ảnh 3").getAttribute("src")).toBe("blob:http://localhost/a.png");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(uploadImageAPI).mock.calls.map(([file]) => file)).toEqual([b, a, a]);
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].images).toEqual([
      "/images/old.png",
      "/images/b.png",
      "/images/a.png"
    ]);
  });

  it("reuses uploaded images when retrying a failed combo save", async () => {
    vi.mocked(combos.updateComboAPI).mockRejectedValueOnce(new Error("Save failed"));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: { files: [new File(["image"], "combo.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Save failed")).toBeTruthy();
    expect(successNotification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(successNotification).toHaveBeenCalledTimes(1));
    expect(uploadImageAPI).toHaveBeenCalledTimes(1);
    expect(vi.mocked(combos.updateComboAPI).mock.calls[1][1].images).toEqual(["/images/combo.png"]);
  });

  it("discards removed files and releases previews when the editor unmounts", async () => {
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: {
        files: [
          new File(["a"], "a.png", { type: "image/png" }),
          new File(["b"], "b.png", { type: "image/png" })
        ]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh 1" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/a.png");
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(uploadImageAPI).not.toHaveBeenCalled();
    await waitFor(() => expect(successNotification).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/Chọn ảnh (combo|sản phẩm)/), {
      target: { files: [new File(["c"], "c.png", { type: "image/png" })] }
    });
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/c.png");
    expect(uploadImageAPI).not.toHaveBeenCalled();
  });

  it("blocks duplicate products and a locked piece without a valid variant", async () => {
    const duplicated = combo({
      items: [
        { productId: "p1", product: options[0], mode: "CHOOSE", quantity: 1, variantId: null },
        { productId: "p1", product: options[0], mode: "CHOOSE", quantity: 1, variantId: null }
      ]
    });
    const rows = duplicated.items.map((item, i) => ({ ...item, _id: `row-${i}` }));
    expect(Object.keys(validateComboPieces(rows))).toContain("row-1");
    expect(
      validateComboPieces([{ ...rows[0], mode: "LOCKED", variantId: null }, rows[1]])["row-0"]
    ).toMatch(/Chọn biến thể/);
    expect(
      comboPublishMissing({
        categoryIds: ["c1"],
        items: [{ productId: "p1", mode: "LOCKED", variantId: "p1-b", quantity: 1 }],
        products: options
      })
    ).toContain("LOCKED_VARIANT_ACTIVE");

    vi.mocked(combos.getComboAPI).mockResolvedValue(
      ok(
        combo({
          items: [
            { productId: "p1", product: options[0], mode: "LOCKED", quantity: 1, variantId: null },
            { productId: "p2", product: options[1], mode: "CHOOSE", quantity: 1, variantId: null }
          ]
        })
      )
    );
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Chọn biến thể cố định thuộc sản phẩm.")).toBeTruthy();
    expect(combos.updateComboAPI).not.toHaveBeenCalled();
  });

  it("uses the pricing defaults when creating and switching modes", async () => {
    renderEditor("/catalog/combos/new");
    const percent = await screen.findByRole("spinbutton", { name: "Phần trăm giảm" });
    expect(percent.getAttribute("aria-valuenow")).toBe("10");
    expect(percent.getAttribute("aria-valuemin")).toBe("0");
    expect(percent.getAttribute("aria-valuemax")).toBe("100");
    fireEvent.click(screen.getByRole("radio", { name: "Giá cố định" }));
    const fixed = screen.getByRole("spinbutton", { name: "Giá cố định (VND)" });
    expect(fixed.getAttribute("aria-valuenow")).toBe("0");
    expect(fixed.getAttribute("aria-valuemin")).toBe("0");
    expect(fixed.getAttribute("aria-valuemax")).toBe("0");
    fireEvent.click(screen.getByRole("radio", { name: "Giảm theo %" }));
    expect(
      screen.getByRole("spinbutton", { name: "Phần trăm giảm" }).getAttribute("aria-valuenow")
    ).toBe("10");
  });

  it.each([0, 100])("saves a %i percent discount", async value => {
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Phần trăm giảm" }), {
      target: { value: String(value) }
    });
    expect(screen.getByRole("button", { name: "Lưu & Đăng bán" }).hasAttribute("disabled")).toBe(
      false
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].pricing).toEqual({
      mode: "PERCENT",
      value
    });
  });

  it("saves the fixed price default of zero", async () => {
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("radio", { name: "Giá cố định" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].pricing).toEqual({
      mode: "FIXED",
      value: 0
    });
  });

  it.each([
    [159000, 318000],
    [100.9, 200]
  ])("caps fixed prices for unit price %s at %s", async (price, total) => {
    const view = combo();
    view.items = view.items.map(item => ({
      ...item,
      product: {
        ...options[0],
        _id: item.productId,
        variants: options[0].variants.map(variant => ({ ...variant, price }))
      }
    }));
    vi.mocked(combos.getComboAPI).mockResolvedValue(ok(view));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("radio", { name: "Giá cố định" }));
    const fixed = screen.getByRole("spinbutton", { name: "Giá cố định (VND)" });
    expect(fixed.getAttribute("aria-valuemax")).toBe(String(total));
    expect(
      screen.getByText(`Giá: ${new Intl.NumberFormat("vi-VN").format(total)} ₫ → 0 ₫`)
    ).toBeTruthy();
    expect(screen.queryByText(/^Rẻ nhất:/)).toBeNull();
    expect(screen.queryByText(/^Đắt nhất:/)).toBeNull();
    fireEvent.change(fixed, { target: { value: "999999" } });
    fireEvent.blur(fixed);
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].pricing).toEqual({
      mode: "FIXED",
      value: total
    });
  });

  it("preserves fixed pricing when saving a draft with an unavailable total", async () => {
    const view = combo({ pricing: { mode: "FIXED", value: 200000 } });
    view.items[0] = { ...view.items[0], mode: "LOCKED", variantId: "p1-b" };
    vi.mocked(combos.getComboAPI).mockResolvedValue(ok(view));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.change(screen.getByRole("textbox", { name: "Tên combo" }), {
      target: { value: "Combo sửa tên" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].pricing).toEqual(view.pricing);
  });

  it("warns when fixed price exceeds cheapest normal sum but still saves", async () => {
    const view = combo();
    view.items[0].product = {
      ...options[0],
      variants: options[0].variants.map(variant => ({ ...variant, status: "ACTIVE" }))
    };
    vi.mocked(combos.getComboAPI).mockResolvedValue(ok(view));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("radio", { name: "Giá cố định" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Giá cố định (VND)" }), {
      target: { value: "340000" }
    });
    expect(await screen.findByText(/Giá cố định cao hơn tổng giá thường rẻ nhất/)).toBeTruthy();
    expect(screen.getByText(/^Rẻ nhất:/)).toBeTruthy();
    expect(screen.getByText(/^Đắt nhất:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(combos.updateComboAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(combos.updateComboAPI).mock.calls[0][1].pricing).toEqual({
      mode: "FIXED",
      value: 340000
    });
  });

  it("shows missing category and prevents publishing", async () => {
    vi.mocked(combos.getComboAPI).mockResolvedValue(ok(combo({ categoryIds: [] })));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    expect(screen.getByText("Thiếu danh mục")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu & Đăng bán" }).hasAttribute("disabled")).toBe(
      true
    );
  });

  it("shows a conflict reload action", async () => {
    vi.mocked(combos.updateComboAPI).mockRejectedValue(new ApiError("Revision conflict", 409));
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("button", { name: "Tải lại" })).toBeTruthy();
  });

  it("maps backend invalid piece errors into pieces section", async () => {
    vi.mocked(combos.updateComboAPI).mockRejectedValue(
      new ApiError("Invalid piece", 400, { code: "combo00006", index: 0 })
    );
    renderEditor();
    await screen.findByDisplayValue("Combo mùa hè");
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Invalid piece")).toBeTruthy();
  });
});
