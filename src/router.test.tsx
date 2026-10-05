import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import { routes } from "./router";
import axiosRequest from "@/utils/request";
import { attribute, value, list, response, deferred } from "@/test/attribute-fixtures";
import { clearSession } from "@/utils/session";
import { useAppStore } from "@/store/useAppStore";
import { order } from "@/test/order-fixtures";

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
beforeEach(() => {
  useAppStore.getState().clearProfile();
  axiosRequest.defaults.adapter = async config =>
    response(
      config,
      config.url === "/auth/profile"
        ? profile
        : config.url?.startsWith("/orders/")
          ? order
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
