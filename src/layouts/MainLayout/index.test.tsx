import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { useAppStore } from "@/store/useAppStore";
import MainLayout from ".";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";

beforeEach(() => {
  localStorage.clear();
  useAppStore.getState().clearProfile();
  axiosRequest.defaults.adapter = async config => response(config, ownerProfile);
});

describe("CMS breadcrumb hierarchy", () => {
  it("preserves the mounted page and focused draft through query-only navigation", async () => {
    const Page = () => {
      const [draft, setDraft] = useState("");
      return (
        <input
          aria-label='Draft search'
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
      );
    };
    const router = createMemoryRouter(
      [{ element: <MainLayout />, children: [{ path: "/products", element: <Page /> }] }],
      { initialEntries: ["/products"] }
    );
    render(<RouterProvider router={router} />);
    const input = await screen.findByRole("textbox", { name: "Draft search" });
    input.focus();
    fireEvent.change(input, { target: { value: "shirt" } });
    await act(() => router.navigate("/products?search=shirt"));
    const next = await screen.findByRole("textbox", { name: "Draft search" });
    expect(next).toBe(input);
    expect((next as HTMLInputElement).value).toBe("shirt");
    expect(document.activeElement).toBe(input);
  });
  it("refreshes the current menu on window focus", async () => {
    let current = ownerProfile;
    axiosRequest.defaults.adapter = async config => response(config, current);
    const router = createMemoryRouter([{ path: "*", element: <MainLayout /> }], {
      initialEntries: ["/inventory"]
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("menuitem", { name: /Sản phẩm/ });
    current = staffProfile(["INVENTORY_READ"]);
    fireEvent.focus(window);
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: /Sản phẩm/ })).toBeNull());
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
  it.each([
    ["/dashboard", ["Tổng quan"]],
    ["/reports", ["Báo cáo bán hàng"]],
    ["/orders", ["Bán hàng", "Quản lý Đơn hàng"]],
    ["/customers", ["Bán hàng", "Khách hàng"]],
    ["/reviews", ["Bán hàng", "Đánh giá"]],
    ["/vouchers", ["Bán hàng", "Voucher"]],
    ["/products", ["Catalog", "Sản phẩm"]],
    ["/catalog/combos", ["Catalog", "Combo"]],
    ["/inventory", ["Catalog", "Tồn kho"]],
    ["/catalog/categories", ["Catalog", "Danh mục sản phẩm"]],
    ["/catalog/attributes", ["Catalog", "Thuộc tính"]],
    ["/content/home", ["Nội dung", "Trang chủ"]],
    ["/content/store-info", ["Nội dung", "Thông tin cửa hàng"]],
    ["/policies", ["Nội dung", "Trang chính sách"]],
    ["/settings/checkout", ["Cài đặt", "Đặt hàng"]]
  ])("shows the group and current page at %s", async (path, titles) => {
    const router = createMemoryRouter([{ path: "*", element: <MainLayout /> }], {
      initialEntries: [path]
    });
    render(<RouterProvider router={router} />);
    const breadcrumb = await screen.findByRole("navigation");
    expect(
      Array.from(breadcrumb.querySelectorAll(".ant-breadcrumb-link"), item => item.textContent)
    ).toEqual(titles);
    expect(within(breadcrumb).queryAllByRole("link")).toHaveLength(0);
  });

  it.each([
    ["/products/new", ["Catalog", "Sản phẩm", "Thêm sản phẩm"], "/products"],
    ["/products/product-id", ["Catalog", "Sản phẩm", "Chi tiết sản phẩm"], "/products"],
    ["/catalog/combos/new", ["Catalog", "Combo", "Thêm combo"], "/catalog/combos"],
    ["/catalog/combos/combo-id", ["Catalog", "Combo", "Chi tiết combo"], "/catalog/combos"],
    [
      "/catalog/attributes/size-id",
      ["Catalog", "Thuộc tính", "Chi tiết thuộc tính"],
      "/catalog/attributes"
    ],
    [
      "/orders/order-id?returnTo=%2Forders%3Fpage%3D3",
      ["Bán hàng", "Quản lý Đơn hàng", "Chi tiết đơn hàng"],
      "/orders?page=3"
    ],
    [
      "/orders/order-id?returnTo=%2Fcustomers%2Fregistered%2Fcustomer-id",
      ["Bán hàng", "Khách hàng", "Chi tiết đơn hàng"],
      "/customers/registered/customer-id"
    ],
    [
      "/customers/registered/customer-id?returnTo=%2Fcustomers%3Fpage%3D2",
      ["Bán hàng", "Khách hàng", "Khách hàng đã đăng ký"],
      "/customers?page=2"
    ],
    [
      "/customers/guests/detail?email=guest%40example.test",
      ["Bán hàng", "Khách hàng", "Khách vãng lai"],
      "/customers?tab=guests"
    ],
    [
      "/customers/guests/detail?returnTo=%2Fcustomers%3Ftab%3Dguests",
      ["Bán hàng", "Khách hàng", "Khách vãng lai"],
      "/customers?tab=guests"
    ]
  ])("shows the full hierarchy and a working parent link at %s", async (path, titles, parent) => {
    const router = createMemoryRouter([{ path: "*", element: <MainLayout /> }], {
      initialEntries: [path]
    });
    render(<RouterProvider router={router} />);
    const breadcrumb = await screen.findByRole("navigation");
    expect(
      Array.from(breadcrumb.querySelectorAll(".ant-breadcrumb-link"), item => item.textContent)
    ).toEqual(titles);
    const link = within(breadcrumb).getByRole("link", { name: titles[1] });
    expect(link.getAttribute("href")).toBe(parent);
    await act(() => link.click());
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(parent);
  });
});
