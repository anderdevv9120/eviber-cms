import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import { routes } from "./router";
import axiosRequest from "@/utils/request";
import { attribute, value, list, response, deferred } from "@/test/attribute-fixtures";
import { clearSession } from "@/utils/session";
import { useAppStore } from "@/store/useAppStore";
import { order, orderList } from "@/test/order-fixtures";

vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
const profile = {
  _id: "admin",
  email: "admin@example.test",
  phone: "",
  firstName: "Admin",
  lastName: "User",
  status: "ACTIVE",
  roles: ["ADMIN"]
};
// Lazy route chunks transform on first import; allow for a loaded worker in the full suite.
configure({ asyncUtilTimeout: 5000 });
beforeEach(() => {
  useAppStore.getState().clearProfile();
  axiosRequest.defaults.adapter = async config =>
    response(
      config,
      config.url === "/auth/profile"
        ? profile
        : config.url?.startsWith("/orders/")
          ? order
          : config.url === "/orders"
            ? orderList([order], config.params.page, 65, config.params.pageSize)
            : config.url === "/attributes"
              ? list()
              : { attribute, values: [value], revision: 4 }
    );
});
const renderRoute = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe("CMS data router", () => {
  it("loads the registered Customers URL with selected navigation and accurate breadcrumbs", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : {
              data: [
                {
                  _id: "customer-id",
                  email: "an@example.test",
                  status: "UNVERIFIED",
                  firstName: "An"
                }
              ],
              total: 25,
              page: config.params.page,
              pageSize: config.params.pageSize,
              totalPage: 3
            }
      );
    const path = "/customers?page=2&search=An&status=UNVERIFIED";
    const router = renderRoute(path);
    await screen.findByText("an@example.test");
    expect(screen.getByRole("menuitem", { name: "Khách hàng" }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(within(screen.getByRole("navigation")).getByText("Khách hàng")).toBeTruthy();
    expect(within(screen.getByRole("navigation")).queryByText("Sản phẩm")).toBeNull();
    expect(router.state.location.search).toBe("?page=2&search=An&status=UNVERIFIED");
    expect(screen.queryByRole("menuitem", { name: "Thêm Khách hàng" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn menu" }));
    expect(screen.getByRole("menuitem", { name: "Khách hàng" }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(screen.getByRole("button", { name: "Mở menu" })).toBeTruthy();
  });

  it("guards direct Customers navigation and keeps creation off the router", async () => {
    clearSession();
    const router = renderRoute("/customers");
    await screen.findByText("Đăng nhập vào CMS");
    expect(router.state.location.pathname).toBe("/auth/login");
    expect(
      routes.flatMap(route => route.children ?? []).some(route => route.path === "/customers/add")
    ).toBe(false);
  });

  it.each([
    ["/orders", "Quản lý Đơn hàng"],
    ["/payments", "Quản lý Thanh toán"]
  ])(
    "preserves %s query through detail/back, browser Back and a direct reload",
    async (path, label) => {
      const query = "?page=3&pageSize=20&search=An&status=pending&paymentStatus=unpaid";
      const router = renderRoute(`${path}${query}`);
      const link = await screen.findByRole("link", { name: "Chi tiết" });
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: new RegExp(label) }).className).toContain(
        "ant-menu-item-selected"
      );
      expect(within(screen.getByRole("navigation")).getByText(label)).toBeTruthy();
      fireEvent.click(link);
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      const detailLocation = `${router.state.location.pathname}${router.state.location.search}`;
      expect(new URLSearchParams(router.state.location.search).get("returnTo")).toBe(
        `${path}${query}`
      );
      fireEvent.click(screen.getByRole("link", { name: "Về danh sách" }));
      await screen.findByRole("link", { name: "Chi tiết" });
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        `${path}${query}`
      );
      await act(() => router.navigate(-1));
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      await act(() => router.navigate(-1));
      await screen.findByRole("link", { name: "Chi tiết" });
      expect(router.state.location.search).toBe(query);
      const fresh = createMemoryRouter(routes, { initialEntries: [detailLocation] });
      await act(() => router.navigate(detailLocation, { replace: true }));
      // A new router at the saved URL models a document reload, without navigation state.
      render(<RouterProvider router={fresh} />);
      await waitFor(() =>
        expect(screen.getAllByRole("link", { name: "Về danh sách" })).toHaveLength(2)
      );
      for (const back of screen.getAllByRole("link", { name: "Về danh sách" }))
        expect(back.getAttribute("href")).toBe(`${path}${query}`);
    },
    20000
  );

  it("redirects unauthenticated direct order detail through the existing guard", async () => {
    clearSession();
    const router = renderRoute("/orders/order-id");
    await screen.findByText("Đăng nhập vào CMS");
    expect(router.state.location.pathname).toBe("/auth/login");
  });

  it.each([
    ["", "/orders", "Quản lý Đơn hàng"],
    ["?returnTo=https%3A%2F%2Fevil.test", "/orders", "Quản lý Đơn hàng"],
    [
      "?returnTo=%2Fpayments%3Fpage%3D3%26search%3DAn%26paymentStatus%3Dpaid",
      "/payments?page=3&search=An&paymentStatus=paid",
      "Quản lý Thanh toán"
    ]
  ])(
    "loads direct order detail with origin selection and breadcrumbs (%s)",
    async (query, destination, menuLabel) => {
      const router = renderRoute(`/orders/order-id${query}`);
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      expect(screen.getByRole("menuitem", { name: new RegExp(menuLabel) }).className).toContain(
        "ant-menu-item-selected"
      );
      const crumbs = within(screen.getByRole("navigation"));
      expect(crumbs.getByText("Chi tiết đơn hàng")).toBeTruthy();
      expect(crumbs.getByRole("link").getAttribute("href")).toBe(destination);
      expect(crumbs.queryByText("Sản phẩm")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      expect(router.state.location.search).toBe(query);
      expect(screen.getByRole("link", { name: "Về danh sách" }).getAttribute("href")).toBe(
        destination
      );
      if (destination === "/orders") {
        fireEvent.click(screen.getByRole("link", { name: "Về danh sách" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/orders"));
        await act(() => router.navigate(-1));
        await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      }
    }
  );

  it("redirects unauthenticated direct detail to login and authenticated login to dashboard", async () => {
    clearSession();
    const router = renderRoute("/catalog/attributes/size-id");
    await screen.findByText("Đăng nhập vào CMS");
    expect(router.state.location.pathname).toBe("/auth/login");
  });

  it.each(["/", "/auth/login", "/dashboard", "/product", "/orders"])(
    "preserves existing destination and profile at %s",
    async path => {
      const router = renderRoute(path);
      await waitFor(() => expect(useAppStore.getState().profile).toEqual(profile));
      expect(router.state.location.pathname).toBe(
        ["/", "/auth/login"].includes(path) ? "/dashboard" : path
      );
      expect(screen.queryByText("Unexpected Application Error!")).toBeNull();
    }
  );

  it("supports direct detail, selected/open catalog menu, scoped breadcrumbs, list and back navigation", async () => {
    const router = renderRoute("/catalog/attributes/size-id");
    await screen.findByRole("link", { name: "Về danh sách thuộc tính" });
    expect(await screen.findByText("S")).toBeTruthy();
    expect(screen.getByText("size")).toBeTruthy();
    const menu = screen.getByRole("menuitem", { name: "Thuộc tính" });
    expect(menu.className).toContain("ant-menu-item-selected");
    expect(screen.getByRole("menuitem", { name: /Danh mục/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    const crumbs = screen.getByRole("navigation");
    expect(within(crumbs).getByText("Chi tiết thuộc tính")).toBeTruthy();
    expect(within(crumbs).queryByText("Sản phẩm")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Về danh sách thuộc tính" }));
    await screen.findByRole("button", { name: "Thêm thuộc tính" });
    await act(() => router.navigate(-1));
    await screen.findByRole("link", { name: "Về danh sách thuộc tính" });
    expect(router.state.location.pathname).toBe("/catalog/attributes/size-id");
  });

  it("shows complete saved order, empty state and retryable unavailable detail", async () => {
    let empty = false;
    let unavailable = true;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, profile);
      if (unavailable)
        throw new AxiosError("missing", "404", config, null, {
          config,
          headers: {},
          status: 404,
          statusText: "Not found",
          data: { message: "Attribute not found" }
        });
      return response(config, {
        attribute: { ...attribute, _id: empty ? "empty-id" : attribute._id },
        revision: 4,
        values: empty
          ? []
          : Array.from({ length: 101 }, (_, i) => ({
              ...value,
              _id: `value-${i}`,
              value: `Label ${i}`,
              sortOrder: i
            }))
      });
    };
    const router = renderRoute("/catalog/attributes/size-id");
    await screen.findByText(/Thuộc tính không còn khả dụng/);
    expect(screen.queryByText("Chưa có giá trị")).toBeNull();
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Label 100");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(102);
    empty = true;
    await act(() => router.navigate("/catalog/attributes/empty-id"));
    await screen.findByText("Chưa có giá trị");
  });

  it("does not display delayed attribute A data after navigating to B", async () => {
    const delayed = deferred<{
      attribute: typeof attribute;
      values: (typeof value)[];
      revision: number;
    }>();
    let started = false;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, profile);
      if (config.url === "/attributes/a/values") {
        started = true;
        return response(config, await delayed.promise);
      }
      return response(config, {
        attribute: { ...attribute, _id: "b", name: "Attribute B" },
        values: [],
        revision: 4
      });
    };
    const router = renderRoute("/catalog/attributes/a");
    await waitFor(() => expect(started).toBe(true));
    await act(() => router.navigate("/catalog/attributes/b"));
    await screen.findByText("Attribute B");
    await act(async () =>
      delayed.resolve({
        attribute: { ...attribute, name: "Attribute A" },
        values: [value],
        revision: 4
      })
    );
    expect(screen.queryByText("Attribute A")).toBeNull();
    expect(screen.queryByText("S")).toBeNull();
  });

  it("rejects a missing coherent values result with a visible retry", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/auth/profile" ? profile : null);
    renderRoute("/catalog/attributes/size-id");
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(screen.queryByText("Chưa có giá trị")).toBeNull();
  });

  it("preserves profile failure retry and session-cleared login redirect", async () => {
    let failed = true;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile" && failed)
        throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
      return response(config, config.url === "/auth/profile" ? profile : list());
    };
    const router = renderRoute("/catalog/attributes");
    await screen.findByText("Không tải được thông tin tài khoản");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("button", { name: "Thêm thuộc tính" });
    await act(async () => clearSession());
    await screen.findByText("Đăng nhập vào CMS");
    expect(router.state.location.pathname).toBe("/auth/login");
  });
});
