import "@/test/attribute-fixtures";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import * as api from "@/services/products";
import * as attributesApi from "@/services/attributes";
import * as bannersApi from "@/services/banners";
import { errorNotification } from "@/utils/notification";
import ProductEditor from "./ProductEditor";
import { DESCRIPTION_IMAGE_INVALID } from "./product-publish";
import { PRODUCT_ERROR } from "./product-errors";

vi.mock("@/services/products", () => ({
  getProductAPI: vi.fn(),
  createProductAPI: vi.fn(),
  updateProductAPI: vi.fn(),
  changeProductStatusAPI: vi.fn(),
  listProductCategoriesAPI: vi.fn()
}));
vi.mock("@/services/attributes", () => ({
  listAttributesAPI: vi.fn(),
  getAttributeValuesAPI: vi.fn()
}));
vi.mock("@/services/banners", () => ({ uploadImageAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
// Mirrors the real editor's timing: HTML arrives 300 ms after a change, and once after mount
// when initialHtml is non-empty
vi.mock("@/components/RichEditor", async () => {
  const { useEffect, useRef } = await vi.importActual<typeof import("react")>("react");
  return {
    RichEditor: ({
      initialHtml,
      onChange
    }: {
      initialHtml?: string;
      onChange?: (html: string) => void;
    }) => {
      const mount = useRef({ initialHtml, onChange });
      useEffect(() => {
        const { initialHtml: html, onChange: emit } = mount.current;
        if (!html) return;
        const timer = setTimeout(() => emit?.(html), 300);
        return () => clearTimeout(timer);
      }, []);
      return (
        <textarea
          aria-label='Mô tả'
          defaultValue={initialHtml}
          onChange={event => {
            const html = event.target.value;
            setTimeout(() => onChange?.(html), 300);
          }}
        />
      );
    }
  };
});

const ok = <T,>(data: T) => ({ data, message: "success" });
const attribute = (_id: string, name: string) => ({
  _id,
  code: _id,
  name,
  revision: 1,
  valueCount: 2,
  productUsageCount: 0,
  variantUsageCount: 0,
  created_at: "2026-10-03T00:00:00.000Z",
  updated_at: "2026-10-03T00:00:00.000Z"
});
const attributeValue = (attributeId: string, _id: string, value: string, sortOrder: number) => ({
  _id,
  attributeId,
  value,
  meta: null,
  sortOrder,
  productUsageCount: 0,
  variantUsageCount: 0,
  created_at: "2026-10-03T00:00:00.000Z",
  updated_at: "2026-10-03T00:00:00.000Z"
});
const dictionary = {
  color: [attributeValue("color", "red", "Đỏ", 0), attributeValue("color", "blue", "Xanh", 1)],
  size: [attributeValue("size", "s", "S", 0), attributeValue("size", "m", "M", 1)]
};
const attributes = [attribute("color", "Màu"), attribute("size", "Kích thước")];
const savedVariant: api.ProductEditorVariant = {
  _id: "v1",
  sku: "AO-1",
  price: 100000,
  originalPrice: 120000,
  inventoryCount: 7,
  image: null,
  dimensions: {},
  status: "ACTIVE",
  attributeValues: ["red", "s"]
};
const product = (overrides: Partial<api.ProductEditorView> = {}): api.ProductEditorView => ({
  _id: "p1",
  name: "Áo thun",
  slug: "ao-thun",
  status: "DRAFT",
  description: "<p>Mô tả</p>",
  images: [],
  categoryIds: [],
  seo: { metaTitle: "", metaDescription: "", metaKeywords: [] },
  options: [
    { attributeId: "color", attributeName: "Màu", values: [{ _id: "red", value: "Đỏ" }] },
    {
      attributeId: "size",
      attributeName: "Kích thước",
      values: [
        { _id: "s", value: "S" },
        { _id: "m", value: "M" }
      ]
    }
  ],
  variants: [savedVariant],
  revision: 3,
  updated_at: "2026-10-09T03:00:00.000Z",
  ...overrides
});
const complete = {
  images: ["/images/a.jpg"],
  categoryIds: ["c1"],
  description: "<p>Mô tả</p>"
};

const renderEditor = (path = "/products/p1") => {
  const router = createMemoryRouter(
    [
      { path: "/products", element: <p>Danh sách</p> },
      { path: "/products/new", element: <ProductEditor /> },
      { path: "/products/:id", element: <ProductEditor /> }
    ],
    { initialEntries: [path] }
  );
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </StrictMode>
  );
  return router;
};
const loaded = async (name = "Áo thun") => screen.findByDisplayValue(name);
const select = async (label: string, text: string) => {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByText(text, { selector: ".ant-select-item-option-content" }));
};
const input = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const number = (name: string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const lastUpdate = () => vi.mocked(api.updateProductAPI).mock.lastCall!;

beforeEach(() => {
  useAppStore.getState().setProfile({
    _id: "admin-a",
    email: "admin@example.test",
    phone: "",
    firstName: "Admin",
    lastName: "",
    roles: ["ADMIN"],
    status: "ACTIVE"
  });
  vi.mocked(api.getProductAPI).mockReset().mockResolvedValue(ok(product()));
  vi.mocked(api.createProductAPI)
    .mockReset()
    .mockImplementation(async input =>
      ok(product({ _id: "new-id", name: input.name, slug: "ao-thun-do", revision: 0 }))
    );
  vi.mocked(api.updateProductAPI)
    .mockReset()
    .mockResolvedValue(ok(product({ ...complete, revision: 4 })));
  vi.mocked(api.changeProductStatusAPI)
    .mockReset()
    .mockImplementation(async (_id, { status }) => ok(product({ status, revision: 5 })));
  vi.mocked(errorNotification).mockReset();
  vi.mocked(api.listProductCategoriesAPI)
    .mockReset()
    .mockResolvedValue(ok([{ _id: "c1", name: "Áo" }]));
  vi.mocked(attributesApi.listAttributesAPI)
    .mockReset()
    .mockResolvedValue(ok({ data: attributes, total: 2, page: 1, pageSize: 100, totalPage: 1 }));
  vi.mocked(attributesApi.getAttributeValuesAPI)
    .mockReset()
    .mockImplementation(async id =>
      ok({
        attribute: attributes.find(row => row._id === id)!,
        values: dictionary[id as keyof typeof dictionary],
        revision: 1
      })
    );
});

describe("ProductEditor — new product", () => {
  it("follows the name with the slug, builds the grid and sends the expected payload", async () => {
    const router = renderEditor("/products/new");
    type(await screen.findByLabelText("Tên sản phẩm"), "Áo Thun Đỏ");
    expect(input("Đường dẫn").value).toBe("ao-thun-do");

    await select("Thêm thuộc tính", "Màu");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Đỏ" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Xanh" }));
    await select("Thêm thuộc tính", "Kích thước");
    fireEvent.click(await screen.findByRole("checkbox", { name: "S" }));
    expect(screen.getByRole("checkbox", { name: "Tạo Đỏ / S" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tạo Xanh / S" }));

    type(number("Giá hàng loạt"), "100000");
    type(number("Giá gốc hàng loạt"), "120000");
    type(number("Tồn kho hàng loạt"), "5");
    fireEvent.click(button("Áp dụng cho biến thể mới"));
    expect(number("Giá Đỏ / S").value).toBe("100000");
    fireEvent.click(button("Tạo SKU"));
    expect(input("SKU Đỏ / S").value).toBe("AO-THUN-DO-DO-S");

    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(api.createProductAPI).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createProductAPI).mock.calls[0][0];
    expect(payload).not.toHaveProperty("slug");
    expect(payload).toMatchObject({
      name: "Áo Thun Đỏ",
      images: [],
      categoryIds: [],
      options: [
        { attributeId: "color", optionValues: ["red", "blue"] },
        { attributeId: "size", optionValues: ["s"] }
      ]
    });
    expect(payload.variants).toEqual([
      {
        sku: "AO-THUN-DO-DO-S",
        price: 100000,
        originalPrice: 120000,
        inventoryCount: 5,
        image: null,
        dimensions: {},
        status: "ACTIVE",
        attributeValues: ["red", "s"]
      }
    ]);
    await waitFor(() => expect(router.state.location.pathname).toBe("/products/new-id"));
  }, 15_000); // many antd Select interactions; slow under the full parallel suite

  it("reports a failed publish after create once the page moves to the new product", async () => {
    vi.mocked(bannersApi.uploadImageAPI).mockResolvedValue(
      ok({ path: "/images/a.jpg" }) as Awaited<ReturnType<typeof bannersApi.uploadImageAPI>>
    );
    vi.mocked(api.changeProductStatusAPI).mockRejectedValueOnce(
      new ApiError("Chưa đủ điều kiện đăng bán", 400, {
        code: PRODUCT_ERROR.PUBLISH_REQUIREMENTS,
        missing: ["CATEGORY"]
      })
    );
    const router = renderEditor("/products/new");
    type(await screen.findByLabelText("Tên sản phẩm"), "Áo Mới");
    await select("Danh mục", "Áo");
    type(screen.getByRole("textbox", { name: "Mô tả" }), "<p>Mô tả</p>");
    fireEvent.change(screen.getByLabelText("Chọn ảnh sản phẩm"), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] }
    });
    await screen.findByAltText("Ảnh 1");
    type(number("Giá hàng loạt"), "100000");
    type(number("Giá gốc hàng loạt"), "120000");
    type(number("Tồn kho hàng loạt"), "5");
    fireEvent.click(button("Áp dụng cho biến thể mới"));
    fireEvent.click(button("Tạo SKU"));
    await waitFor(() => expect(button("Lưu & Đăng bán").disabled).toBe(false));

    fireEvent.click(button("Lưu & Đăng bán"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/products/new-id"));
    expect(errorNotification).toHaveBeenCalledWith(
      expect.stringContaining("Chưa đủ điều kiện đăng bán"),
      expect.anything()
    );
  }, 30_000); // upload + selects + bulk fill; slower than the payload test under the full suite

  it("shows one default row for a product without options", async () => {
    renderEditor("/products/new");
    await screen.findByLabelText("Tên sản phẩm");
    expect(screen.getByRole("checkbox", { name: "Tạo Mặc định" })).toBeTruthy();
  });
});

describe("ProductEditor — existing product", () => {
  it("keeps saved rows read-only, locks used values and sends a status toggle", async () => {
    renderEditor();
    await loaded();
    expect(await screen.findByText("7")).toBeTruthy();
    expect(screen.queryByRole("spinbutton", { name: "Tồn kho Đỏ / S" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Tạo Đỏ / S" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Đỏ" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "S" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "M" }) as HTMLInputElement).disabled).toBe(false);
    expect(button("Bỏ thuộc tính Màu").disabled).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: "Đang bán Đỏ / S" }));
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(api.updateProductAPI).toHaveBeenCalledTimes(1));
    const [id, payload] = lastUpdate();
    expect(id).toBe("p1");
    expect(payload).toMatchObject({ expectedRevision: 3, slug: "ao-thun" });
    expect(payload.variants).toEqual([
      {
        _id: "v1",
        sku: "AO-1",
        price: 100000,
        originalPrice: 120000,
        image: null,
        dimensions: {},
        status: "INACTIVE",
        attributeValues: ["red", "s"]
      }
    ]);
  });

  it("shows the server's SKU and stock on saved rows after a save", async () => {
    vi.mocked(api.updateProductAPI).mockResolvedValue(
      ok(
        product({ revision: 4, variants: [{ ...savedVariant, sku: "AO-1-X", inventoryCount: 9 }] })
      )
    );
    renderEditor();
    await loaded();
    type(input("SKU Đỏ / S"), " ao-1-x ");
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(input("SKU Đỏ / S").value).toBe("AO-1-X"));
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("keeps an image removed while an upload is still running", async () => {
    vi.mocked(api.getProductAPI).mockResolvedValue(
      ok(product({ images: ["/images/a.jpg", "/images/b.jpg"] }))
    );
    let finish: (path: string) => void = () => undefined;
    vi.mocked(bannersApi.uploadImageAPI).mockReturnValue(
      new Promise(resolve => {
        finish = path =>
          resolve(ok({ path }) as Awaited<ReturnType<typeof bannersApi.uploadImageAPI>>);
      })
    );
    renderEditor();
    await loaded();
    fireEvent.change(screen.getByLabelText("Chọn ảnh sản phẩm"), {
      target: { files: [new File(["x"], "c.png", { type: "image/png" })] }
    });
    fireEvent.click(button("Xóa ảnh 2"));
    finish("/images/c.jpg");
    await waitFor(() =>
      expect(screen.getByAltText("Ảnh 2").getAttribute("src")).toContain("c.jpg")
    );
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(api.updateProductAPI).toHaveBeenCalledTimes(1));
    expect(lastUpdate()[1].images).toEqual(["/images/a.jpg", "/images/c.jpg"]);
  });

  it("stops selling only after confirmation", async () => {
    vi.mocked(api.getProductAPI).mockResolvedValue(ok(product({ ...complete, status: "PUBLISH" })));
    renderEditor();
    await loaded();
    fireEvent.click(button("Ngừng bán"));
    expect(api.changeProductStatusAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Ngừng bán sản phẩm" }));
    await waitFor(() =>
      expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
        status: "UNPUBLISH",
        expectedRevision: 3
      })
    );
  });

  it("sends a description keystroke typed just before Save", async () => {
    renderEditor();
    await loaded();
    type(screen.getByRole("textbox", { name: "Mô tả" }), "<p>Mới</p>");
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(api.updateProductAPI).toHaveBeenCalledTimes(1));
    expect(lastUpdate()[1].description).toBe("<p>Mới</p>");
  });

  it("blocks Save when a description image would be stripped by the server", async () => {
    renderEditor();
    await loaded();
    type(
      screen.getByRole("textbox", { name: "Mô tả" }),
      '<p>Ảnh <img src="data:image/png;base64,AAAA" alt="tệp"></p>'
    );
    fireEvent.click(button("Lưu"));
    expect(await screen.findByText(DESCRIPTION_IMAGE_INVALID)).toBeTruthy();
    expect(api.updateProductAPI).not.toHaveBeenCalled();
  });

  it("disables Save & Publish while the checklist is incomplete", async () => {
    renderEditor();
    await loaded();
    expect(await screen.findByText("Thiếu ảnh sản phẩm")).toBeTruthy();
    expect(button("Lưu & Đăng bán").disabled).toBe(true);
  });

  it("Save & Publish sends PUT then PATCH with the returned revision", async () => {
    vi.mocked(api.getProductAPI).mockResolvedValue(ok(product(complete)));
    renderEditor();
    await loaded();
    await waitFor(() => expect(button("Lưu & Đăng bán").disabled).toBe(false));
    fireEvent.click(button("Lưu & Đăng bán"));
    await waitFor(() => expect(api.changeProductStatusAPI).toHaveBeenCalledTimes(1));
    expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
      status: "PUBLISH",
      expectedRevision: 4
    });
    expect(vi.mocked(api.updateProductAPI).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.changeProductStatusAPI).mock.invocationCallOrder[0]
    );
  });

  it("blocks Save after a 409 until Tải lại refetches", async () => {
    vi.mocked(api.updateProductAPI).mockRejectedValueOnce(
      new ApiError("Sản phẩm vừa được thay đổi, vui lòng tải lại", 409, { code: "product00001" })
    );
    renderEditor();
    await loaded();
    fireEvent.click(button("Lưu"));
    await screen.findByText(/Tải lại để bỏ bản nháp/);
    expect(button("Lưu").disabled).toBe(true);
    const loads = vi.mocked(api.getProductAPI).mock.calls.length;
    fireEvent.click(button("Tải lại"));
    await waitFor(() => expect(api.getProductAPI).toHaveBeenCalledTimes(loads + 1));
    await waitFor(() => expect(button("Lưu").disabled).toBe(false));
  });

  it("marks the SKU cell the server reports as taken", async () => {
    vi.mocked(api.updateProductAPI).mockRejectedValueOnce(
      new ApiError("Mã SKU đã được sử dụng", 400, { code: "product00012", sku: "ao-1" })
    );
    renderEditor();
    await loaded();
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(input("SKU Đỏ / S").getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("Mã SKU đã được sử dụng")).toBeTruthy();
  });

  it("asks before removing an image a variant uses and clears that variant's image", async () => {
    vi.mocked(api.getProductAPI).mockResolvedValue(
      ok(
        product({
          images: ["/images/a.jpg", "/images/b.jpg"],
          variants: [{ ...savedVariant, image: "/images/b.jpg" }]
        })
      )
    );
    renderEditor();
    await loaded();
    fireEvent.click(button("Xóa ảnh 2"));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa và bỏ ảnh khỏi biến thể" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Xóa ảnh 2" })).toBeNull());
    fireEvent.click(button("Lưu"));
    await waitFor(() => expect(api.updateProductAPI).toHaveBeenCalledTimes(1));
    const [, payload] = lastUpdate();
    expect(payload.images).toEqual(["/images/a.jpg"]);
    expect(payload.variants[0].image).toBeNull();
  });

  it("opens an archived product read-only with Khôi phục", async () => {
    vi.mocked(api.getProductAPI).mockResolvedValue(ok(product({ status: "DELETED" })));
    renderEditor();
    await loaded();
    expect((screen.getByLabelText("Tên sản phẩm") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    fireEvent.click(button("Khôi phục"));
    await waitFor(() =>
      expect(api.changeProductStatusAPI).toHaveBeenCalledWith("p1", {
        status: "DRAFT",
        expectedRevision: 3
      })
    );
    expect(await screen.findByRole("button", { name: "Lưu" })).toBeTruthy();
  });

  it("prompts when leaving with unsaved changes", async () => {
    const router = renderEditor();
    type(await loaded(), "Áo thun mới");
    fireEvent.click(screen.getByRole("link", { name: "Danh sách sản phẩm" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Sản phẩm chưa được lưu");
    fireEvent.click(button("Ở lại"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/products/p1"));
  });

  it("leaves without a prompt when nothing changed", async () => {
    const router = renderEditor();
    await loaded();
    await new Promise(resolve => setTimeout(resolve, 350));
    fireEvent.click(screen.getByRole("link", { name: "Danh sách sản phẩm" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/products"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
