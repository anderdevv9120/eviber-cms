import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import type { PermissionCode } from "@/constants/permissions";
import Products from "./Products";
import ProductEditor from "./Products/ProductEditor";
import Combos from "./Combos";
import ComboEditor from "./Combos/ComboEditor";

vi.mock("@/components/RichEditor", () => ({
  RichEditor: ({ initialHtml }: { initialHtml: string }) => <div>{initialHtml}</div>
}));

const product = {
  _id: "p1",
  name: "Áo thun",
  slug: "ao-thun",
  status: "DRAFT",
  revision: 3,
  refundEnabled: true,
  description: "Mô tả",
  images: [],
  categoryIds: ["c1"],
  seo: {},
  options: [],
  variants: [],
  publishMissing: [],
  variantCount: 0,
  activeVariantCount: 0,
  minPrice: null,
  maxPrice: null,
  totalStock: 0
};
const combo = {
  _id: "c1",
  name: "Combo hè",
  slug: "combo-he",
  status: "DRAFT",
  revision: 2,
  description: "Mô tả combo",
  images: [],
  categoryIds: ["c1"],
  seo: {},
  items: [],
  pricing: { mode: "PERCENT", value: 10 },
  issues: [],
  publishMissing: [],
  availability: "HIDDEN",
  priceRange: null
};
let calls: InternalAxiosRequestConfig[];
beforeEach(() => {
  calls = [];
  axiosRequest.defaults.adapter = async config => {
    calls.push(config);
    const data =
      config.url === "/products/p1"
        ? product
        : config.url === "/combos/c1"
          ? combo
          : config.url === "/categories/options" || config.url === "/categories"
            ? [{ _id: "c1", name: "Áo" }]
            : config.url === "/attributes/options"
              ? [
                  {
                    _id: "size",
                    code: "size",
                    name: "Kích thước",
                    values: [{ _id: "m", value: "M" }]
                  }
                ]
              : config.url === "/attributes"
                ? { data: [], total: 0 }
                : {
                    data:
                      config.url === "/products"
                        ? [product]
                        : config.url === "/combos"
                          ? [combo]
                          : [],
                    total: 1,
                    page: 1,
                    pageSize: 20,
                    totalPage: 1
                  };
    return response(config, data);
  };
});

function show(kind: "product" | "combo", editor: boolean, permissions: PermissionCode[]) {
  useAppStore.getState().setProfile(staffProfile(permissions));
  const path = kind === "product" ? "/products" : "/catalog/combos";
  const router = createMemoryRouter(
    [
      { path, element: kind === "product" ? <Products /> : <Combos /> },
      { path: `${path}/:id`, element: kind === "product" ? <ProductEditor /> : <ComboEditor /> }
    ],
    { initialEntries: [editor ? `${path}/${kind === "product" ? "p1" : "c1"}` : path] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}

describe("existing feature actions follow current permissions", () => {
  it.each([
    ["product", "PRODUCT_READ", "Áo thun", "Thêm sản phẩm"],
    ["combo", "COMBO_READ", "Combo hè", "Thêm combo"]
  ] as const)("%s readers cannot create or change status", async (kind, read, name, create) => {
    show(kind, false, [read]);
    await screen.findByRole("link", { name });
    expect(screen.queryByRole("button", { name: create })).toBeNull();
    expect(screen.queryByRole("button", { name: /Đăng bán|Lưu trữ|Khôi phục/ })).toBeNull();
  });

  it.each([
    ["product", "PRODUCT_READ", "Áo thun"],
    ["combo", "COMBO_READ", "Combo hè"]
  ] as const)(
    "%s read-only detail never requests write-only selectors",
    async (kind, read, name) => {
      show(kind, true, [read]);
      await screen.findByRole("heading", { name });
      expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
      expect(
        (
          screen.getByRole("textbox", {
            name: kind === "product" ? "Tên sản phẩm" : "Tên combo"
          }) as HTMLInputElement
        ).disabled
      ).toBe(true);
      expect(
        (
          screen.getByRole("button", {
            name: kind === "product" ? "Tải ảnh lên" : "Chọn ảnh"
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
      await screen.findByText("Áo");
      expect(calls.map(call => call.url).sort()).toEqual(
        [kind === "product" ? "/products/p1" : "/combos/c1", "/categories/options"].sort()
      );
      expect(screen.queryByRole("link", { name: "Xem tồn kho" })).toBeNull();
    }
  );

  it("a product-only editor uses narrow selectors and retains its draft after permissions refresh", async () => {
    show("product", true, ["PRODUCT_READ", "PRODUCT_UPDATE"]);
    const name = await screen.findByRole("textbox", { name: "Tên sản phẩm" });
    await waitFor(() => expect(calls.some(call => call.url === "/attributes/options")).toBe(true));
    expect(calls.some(call => call.url === "/categories/options")).toBe(true);
    expect(
      calls.some(
        call =>
          call.url === "/categories" ||
          call.url === "/attributes" ||
          /\/attributes\/.*\/values/.test(call.url!)
      )
    ).toBe(false);
    fireEvent.change(name, { target: { value: "Bản nháp chưa lưu" } });
    act(() => useAppStore.getState().setProfile(staffProfile(["PRODUCT_READ"])));
    expect((name as HTMLInputElement).value).toBe("Bản nháp chưa lưu");
    expect((name as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(calls.filter(call => call.method !== "get")).toHaveLength(0);
  });

  it("a combo-only editor loads narrow category and product options", async () => {
    show("combo", true, ["COMBO_READ", "COMBO_UPDATE"]);
    await screen.findByRole("heading", { name: "Combo hè" });
    await waitFor(() =>
      expect(calls.some(call => call.url === "/combos/product-options")).toBe(true)
    );
    expect(calls.some(call => call.url === "/categories/options")).toBe(true);
    expect(calls.some(call => call.url === "/categories" || call.url === "/products")).toBe(false);
  });
});
