import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import { routes } from "./router";
import axiosRequest from "@/utils/request";
import {
  attribute,
  value,
  list,
  response as apiResponse,
  deferred
} from "@/test/attribute-fixtures";
import { clearSession } from "@/utils/session";
import { useAppStore } from "@/store/useAppStore";
import { order, orderList } from "@/test/order-fixtures";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { roleList } from "@/test/role-fixtures";

vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
const profile = ownerProfile;
const emptyNotifications = {
  items: [],
  unreadCount: 0,
  head: 0,
  eligibleEvents: [],
  serverTime: "2026-10-26T00:00:00.000Z"
};
const response: typeof apiResponse = (config, data) =>
  apiResponse(config, config.url === "/notifications/summary" ? emptyNotifications : data);
// Lazy route chunks transform on first import; allow for a loaded worker in the full suite.
configure({ asyncUtilTimeout: 5000 });
beforeEach(() => {
  // Sidebar lưu trạng thái thu gọn vào localStorage — không để rò giữa các test
  localStorage.clear();
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
  it("opens personal notifications for active staff without feature permissions or a menu entry", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? staffProfile([])
          : config.url === "/notifications/summary"
            ? emptyNotifications
            : {
                data: [],
                total: 0,
                totalPage: 0,
                page: 1,
                pageSize: 20,
                head: 0,
                eligibleEvents: []
              }
      );
    renderRoute("/notifications");
    await screen.findByRole("heading", { name: "Thông báo" });
    expect(document.querySelector(".ant-breadcrumb")?.textContent).toContain("Thông báo");
    expect(screen.getByRole("menuitem", { name: /Thông báo/ })).toBeTruthy();
  });
  it("opens independent refund settings for refund-policy-only staff without unrelated reads", async () => {
    const urls: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      urls.push(config.url!);
      return response(
        config,
        config.url === "/auth/profile"
          ? staffProfile(["REFUND_POLICY_READ"])
          : { enabled: true, windowDays: 7, revision: 1 }
      );
    };
    const router = renderRoute("/");
    await screen.findByText("Chính sách hoàn tiền", { selector: ".ant-card-head-title" });
    expect(router.state.location.pathname).toBe("/policies");
    await waitFor(() => expect(urls).toContain("/refund-policy"));
    expect(urls.some(url => url === "/policies" || url.startsWith("/store-settings/"))).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Lưu chính sách hoàn tiền" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });
  it("opens owner role settings from its menu with the access-area breadcrumb", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/auth/profile" ? ownerProfile : roleList());
    renderRoute("/settings/access/roles");
    await screen.findByRole("heading", { name: "Vai trò" });
    expect(screen.getByRole("menuitem", { name: /Vai trò/ }).className).toContain(
      "ant-menu-item-selected"
    );
    const breadcrumb = document.querySelector(".ant-breadcrumb")!;
    expect(breadcrumb.textContent).toContain("Cài đặt");
    expect(breadcrumb.textContent).toContain("Tài khoản & phân quyền");
    expect(breadcrumb.textContent).toContain("Vai trò");
  });

  it("blocks the direct role-settings URL for a delegated creator without loading its data", async () => {
    const roleEditorLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, staffProfile(["USER_CREATE"]));
      if (config.url === "/notifications/summary") return response(config, emptyNotifications);
      roleEditorLoad();
      return response(config, roleList());
    };
    renderRoute("/settings/access/roles");
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(roleEditorLoad).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: /Vai trò/ })).toBeNull();
  });

  it("opens the staff entry for a USER_CREATE-only account with menu and breadcrumb", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/auth/profile" ? staffProfile(["USER_CREATE"]) : []);
    const router = renderRoute("/");
    await screen.findByRole("heading", { name: "Nhân viên & phân quyền" });
    expect(router.state.location.pathname).toBe("/settings/access");
    expect((await screen.findByRole("menuitem", { name: /Nhân viên/ })).className).toContain(
      "ant-menu-item-selected"
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    const breadcrumb = document.querySelector(".ant-breadcrumb")!;
    expect(breadcrumb.textContent).toContain("Cài đặt");
    expect(breadcrumb.textContent).toContain("Tài khoản & phân quyền");
    expect(breadcrumb.textContent).toContain("Nhân viên");
  });

  it("serves staff registration under the access area with a linked parent crumb", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/auth/profile" ? ownerProfile : []);
    const router = renderRoute("/settings/access/new");
    await screen.findByRole("heading", { name: "Mời nhân viên" });
    expect(screen.getByRole("menuitem", { name: /Nhân viên/ }).className).toContain(
      "ant-menu-item-selected"
    );
    const crumbs = within(screen.getByRole("navigation"));
    expect(crumbs.getByRole("link", { name: "Nhân viên" }).getAttribute("href")).toBe(
      "/settings/access"
    );
    expect(crumbs.getByText("Mời nhân viên")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings/access/new");
  });

  it("blocks the staff entry for staff without USER_CREATE without fetching invitations", async () => {
    const staffLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, staffProfile(["INVENTORY_READ"]));
      if (config.url === "/notifications/summary") return response(config, emptyNotifications);
      staffLoad(config.url);
      return response(config, []);
    };
    renderRoute("/settings/access");
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(staffLoad).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: /Nhân viên/ })).toBeNull();
  });

  it("opens the first permitted route from home and filters menu groups", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? staffProfile(["INVENTORY_READ"])
          : {
              data: [],
              total: 0,
              totalPage: 0,
              page: 1,
              pageSize: 10,
              metadata: { lowStockThreshold: 5, stock: "all" }
            }
      );
    const router = renderRoute("/");
    await screen.findByRole("heading", { name: "Tồn kho" });
    expect(router.state.location.pathname).toBe("/inventory");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.queryByText("Bán hàng")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Tổng quan|Sản phẩm/ })).toBeNull();
  });

  it("sends no feature request for a forbidden direct URL", async () => {
    const forbiddenPageLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, staffProfile(["INVENTORY_READ"]));
      if (config.url === "/notifications/summary") return response(config, emptyNotifications);
      forbiddenPageLoad(config.url);
      return response(config, []);
    };
    renderRoute("/products");
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(forbiddenPageLoad).not.toHaveBeenCalled();
  });

  it("opens personal settings from home for staff without business permissions", async () => {
    const urls: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      urls.push(config.url!);
      return response(
        config,
        config.url === "/auth/profile"
          ? staffProfile([])
          : {
              revision: 0,
              storeRevision: 0,
              allowPersonalPreferences: true,
              events: []
            }
      );
    };
    const router = renderRoute("/");
    await screen.findByRole("heading", { name: "Cài đặt thông báo" });
    expect(router.state.location.pathname).toBe("/settings/notifications");
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: /Thông báo/ }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(document.querySelector(".ant-breadcrumb")?.textContent).toContain("Cài đặt");
    expect(document.querySelector(".ant-breadcrumb")?.textContent).toContain("Thông báo");
    expect(screen.queryByRole("tab", { name: "Cửa hàng" })).toBeNull();
    expect(urls).not.toContain("/notification-settings");
    expect(urls).toContain("/notifications/preferences");
  });

  it("refreshes expired permissions before mounting the destination after navigation", async () => {
    let current = ownerProfile;
    const featureLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, current);
      if (config.url === "/notifications/summary") return response(config, emptyNotifications);
      featureLoad(config.url);
      return response(config, []);
    };
    const router = renderRoute("/policies");
    await screen.findByRole("heading", { name: "Trang chính sách" });
    current = staffProfile(["INVENTORY_READ"]);
    featureLoad.mockClear();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3_600_000);
    await act(() => router.navigate("/products"));
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(featureLoad).not.toHaveBeenCalled();
  });

  it("logs in through home to the first allowed page", async () => {
    clearSession();
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/login"
          ? {
              accessToken: "staff-token",
              refreshToken: "staff-refresh",
              accessExpiresIn: 60000,
              refreshExpiresIn: 60000
            }
          : config.url === "/auth/profile"
            ? staffProfile(["POLICY_READ"])
            : []
      );
    const router = renderRoute("/auth/login");
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "staff@example.test" }
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await screen.findByRole("heading", { name: "Trang chính sách" });
    expect(router.state.location.pathname).toBe("/policies");
  });
  it("opens the combo list from Catalog and keeps its menu selected", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : { data: [], total: 0, totalPage: 0, page: 1, pageSize: 20 }
      );
    expect(
      routes.flatMap(route => route.children ?? []).some(route => route.path === "/catalog/combos")
    ).toBe(true);
    const router = renderRoute("/catalog/combos");
    expect((await screen.findByRole("menuitem", { name: /Combo/ })).className).toContain(
      "ant-menu-item-selected"
    );
    await screen.findByRole("heading", { name: "Combo" });
    const breadcrumb = within(screen.getByRole("navigation"));
    expect(breadcrumb.getByText("Combo")).toBeTruthy();
    expect(breadcrumb.queryByText("Sản phẩm")).toBeNull();
    await act(() => router.navigate("/dashboard"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Combo/ }));
    await screen.findByRole("heading", { name: "Combo" });
    expect(router.state.location.pathname).toBe("/catalog/combos");
  });

  it("opens vouchers from the sidebar and selects its breadcrumb", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : {
              data: [],
              total: 0,
              totalPage: 0,
              page: config.params?.page ?? 1,
              pageSize: config.params?.pageSize ?? 10
            }
      );
    const router = renderRoute("/vouchers?search=SAVE");
    await screen.findByRole("heading", { name: "Voucher" });
    expect((await screen.findByRole("menuitem", { name: /Voucher/ })).className).toContain(
      "ant-menu-item-selected"
    );
    expect(within(screen.getByRole("navigation")).getByText("Voucher")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Tìm voucher" }).getAttribute("value")).toBe(
      "SAVE"
    );
    await act(() => router.navigate("/dashboard"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Voucher/ }));
    await screen.findByRole("heading", { name: "Voucher" });
    expect(router.state.location.pathname).toBe("/vouchers");
  });
  it("opens store info from the Nội dung group with breadcrumbs", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : {
              contact: { address: "A", email: "a@b.vn", phone: "1" },
              socials: { facebook: "", instagram: "", twitter: "" },
              productPromises: ["a", "b", "c"],
              revision: 0
            }
      );
    const router = renderRoute("/content/store-info");
    await screen.findByRole("heading", { name: "Thông tin cửa hàng" });
    expect(
      (await screen.findByRole("menuitem", { name: /Thông tin cửa hàng/ })).className
    ).toContain("ant-menu-item-selected");
    const breadcrumb = within(screen.getByRole("navigation"));
    expect(breadcrumb.getByText("Nội dung")).toBeTruthy();
    expect(breadcrumb.getByText("Thông tin cửa hàng")).toBeTruthy();
    await act(() => router.navigate("/dashboard"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Trang chính sách/ }));
    expect(router.state.location.pathname).toBe("/policies");
  });

  it("opens Cài đặt › Đặt hàng with the guest checkout switch", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/auth/profile" ? profile : { allowGuestCheckout: true });
    const router = renderRoute("/dashboard");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Đặt hàng/ }));
    await screen.findByRole("heading", { name: "Đặt hàng" });
    expect(router.state.location.pathname).toBe("/settings/checkout");
    expect(
      screen.getByRole("switch", { name: "Cho phép mua hàng không cần đăng nhập" })
    ).toBeTruthy();
    const breadcrumb = within(screen.getByRole("navigation"));
    expect(breadcrumb.getByText("Cài đặt")).toBeTruthy();
  });

  it("opens Cài đặt › Thanh toán with the payOS settings form", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : {
              status: "not_configured",
              clientId: null,
              apiKeyLast4: null,
              checksumKeyLast4: null,
              linkTtlMinutes: 15,
              revision: 0,
              updatedAt: null,
              updatedBy: null,
              webhookUrl: null
            }
      );
    const router = renderRoute("/dashboard");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Thanh toán/ }));
    await screen.findByRole("heading", { name: "Thanh toán" });
    expect(router.state.location.pathname).toBe("/settings/payment");
    expect(await screen.findByText("Chưa cấu hình")).toBeTruthy();
    const breadcrumb = within(screen.getByRole("navigation"));
    expect(breadcrumb.getByText("Cài đặt")).toBeTruthy();
  });

  it("drops the removed Payments, Banner and old content routes", () => {
    const paths = routes.flatMap(route => route.children ?? []).map(route => route.path);
    for (const removed of ["/payments", "/banners", "/store-content", "/categories"])
      expect(paths).not.toContain(removed);
    expect(paths).toEqual(expect.arrayContaining(["/content/home", "/catalog/categories"]));
  });

  it.each([
    ["/customers/registered/customer-id", "Khách hàng đã đăng ký", "/customers?page=2&search=An"],
    [
      "/customers/guests/detail?email=guest%2Btag%40example.test",
      "Khách vãng lai",
      "/customers?tab=guests&page=2&search=An"
    ]
  ])(
    "keeps Customers selected and restores its canonical list from %s",
    async (path, label, returnTo) => {
      const customer = {
        _id: "customer-id",
        email: "an@example.test",
        status: "UNVERIFIED",
        addresses: []
      };
      const guest = { email: "guest+tag@example.test", name: "Latest contact", orderCount: 1 };
      axiosRequest.defaults.adapter = async config => {
        if (config.url === "/auth/profile") return response(config, profile);
        if (config.url?.endsWith("/addresses")) return response(config, []);
        if (config.url?.endsWith("/orders")) return response(config, orderList([order]));
        if (config.url === "/customers/registered/customer-id") return response(config, customer);
        if (config.url === "/customers/guests/detail") return response(config, guest);
        return response(config, {
          data: config.url === "/customers/guests" ? [guest] : [customer],
          total: 25,
          page: config.params.page,
          pageSize: config.params.pageSize,
          totalPage: 3
        });
      };
      const url = new URL(path, "https://cms.example.test");
      url.searchParams.set("returnTo", returnTo);
      const router = renderRoute(`${url.pathname}${url.search}`);
      await screen.findByRole("heading", { name: label });
      expect(screen.getByRole("menuitem", { name: /Khách hàng/ }).className).toContain(
        "ant-menu-item-selected"
      );
      const crumbs = within(screen.getByRole("navigation"));
      expect(crumbs.getByText(label)).toBeTruthy();
      expect(crumbs.getByRole("link", { name: "Khách hàng" }).getAttribute("href")).toBe(returnTo);
      const detailUrl = `${router.state.location.pathname}${router.state.location.search}`;
      expect((await screen.findByRole("link", { name: "ORD-SNAPSHOT" })).getAttribute("href")).toBe(
        `/orders/order-id?${new URLSearchParams({ returnTo: detailUrl })}`
      );
      expect(screen.queryByRole("link", { name: "Về danh sách khách hàng" })).toBeNull();
      fireEvent.click(crumbs.getByRole("link", { name: "Khách hàng" }));
      await screen.findByRole("link", { name: path.includes("/guests/") ? guest.email : "—" });
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(returnTo);
      await act(() => router.navigate(-1));
      await screen.findByRole("heading", { name: label });
    }
  );

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
    expect(screen.getByRole("menuitem", { name: /Khách hàng/ }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(within(screen.getByRole("navigation")).getByText("Khách hàng")).toBeTruthy();
    expect(within(screen.getByRole("navigation")).queryByText("Sản phẩm")).toBeNull();
    expect(router.state.location.search).toBe("?page=2&search=An&status=UNVERIFIED");
    expect(screen.queryByRole("menuitem", { name: "Thêm Khách hàng" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn menu" }));
    expect(screen.getByRole("menuitem", { name: /Khách hàng/ }).className).toContain(
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
    ["/orders", "Quản lý Đơn hàng", "Đơn hàng"],
    ["/orders", "Quản lý Đơn hàng", "Đơn hàng", "not_required"]
  ])(
    "preserves %s query through detail/back, browser Back and a direct reload",
    async (path, label, menuLabel, paymentStatus = "unpaid") => {
      const query = `?page=3&pageSize=20&search=An&status=pending&paymentStatus=${paymentStatus}`;
      const router = renderRoute(`${path}${query}`);
      const link = await screen.findByRole("link", { name: order.orderNumber });
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: new RegExp(menuLabel) }).className).toContain(
        "ant-menu-item-selected"
      );
      expect(within(screen.getByRole("navigation")).getByText(label)).toBeTruthy();
      fireEvent.click(link);
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      const detailLocation = `${router.state.location.pathname}${router.state.location.search}`;
      expect(new URLSearchParams(router.state.location.search).get("returnTo")).toBe(
        `${path}${query}`
      );
      expect(screen.queryByRole("link", { name: "Về danh sách" })).toBeNull();
      fireEvent.click(within(screen.getByRole("navigation")).getByRole("link", { name: label }));
      await screen.findByRole("link", { name: order.orderNumber });
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        `${path}${query}`
      );
      await act(() => router.navigate(-1));
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      await act(() => router.navigate(-1));
      await screen.findByRole("link", { name: order.orderNumber });
      expect(router.state.location.search).toBe(query);
      const fresh = createMemoryRouter(routes, { initialEntries: [detailLocation] });
      await act(() => router.navigate(detailLocation, { replace: true }));
      // A new router at the saved URL models a document reload, without navigation state.
      render(<RouterProvider router={fresh} />);
      await waitFor(() => expect(screen.getAllByRole("link", { name: label })).toHaveLength(2));
      for (const back of screen.getAllByRole("link", { name: label }))
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
    ["", "/orders", "Đơn hàng"],
    [
      "?returnTo=%2Fnotifications%3Fstatus%3Dunread%26event%3Drefund.submitted%26page%3D3",
      "/notifications?status=unread&event=refund.submitted&page=3",
      "Đơn hàng"
    ],
    ["?returnTo=https%3A%2F%2Fevil.test", "/orders", "Đơn hàng"],
    [
      "?returnTo=%2Forders%3Fpage%3D3%26search%3DAn%26paymentStatus%3Dpaid",
      "/orders?page=3&search=An&paymentStatus=paid",
      "Đơn hàng"
    ],
    [
      "?returnTo=%2Fcustomers%2Fregistered%2Fcustomer-id%3FreturnTo%3D%252Fcustomers",
      "/customers/registered/customer-id?returnTo=%2Fcustomers",
      "Khách hàng"
    ],
    ["?returnTo=%2Fpayments%3Fpage%3D3", "/orders", "Đơn hàng"]
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
      if (destination.startsWith("/notifications")) {
        expect(crumbs.getByRole("link", { name: "Thông báo" })).toBeTruthy();
        expect(crumbs.queryByText("Bán hàng")).toBeNull();
      }
      expect(crumbs.queryByText("Sản phẩm")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
      await screen.findByRole("heading", { name: "Đơn hàng ORD-SNAPSHOT" });
      expect(router.state.location.search).toBe(query);
      const backLabel = destination.startsWith("/customers/") ? "Về khách hàng" : "Về danh sách";
      expect(screen.queryByRole("link", { name: backLabel })).toBeNull();
      if (destination === "/orders") {
        fireEvent.click(crumbs.getByRole("link"));
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

  it.each(["/", "/auth/login", "/dashboard", "/products", "/orders", "/reports"])(
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

  it("navigates between Dashboard and Reports with route-aware menu and breadcrumbs", async () => {
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile") return response(config, profile);
      // Sections show inline read failures; this test covers navigation only.
      throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
    };
    const router = renderRoute("/dashboard");
    await screen.findByRole("heading", { name: "Tổng quan vận hành" });
    const crumbs = () => within(screen.getByRole("navigation"));
    expect(screen.getByRole("menuitem", { name: "home Tổng quan" }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(crumbs().getByText("Tổng quan")).toBeTruthy();
    expect(crumbs().queryByText("Sản phẩm")).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: /Báo cáo Doanh thu|Báo cáo Sản phẩm/ })
    ).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /Báo cáo bán hàng/ }));
    await screen.findByRole("heading", { name: "Báo cáo bán hàng" });
    expect(router.state.location.pathname).toBe("/reports");
    expect(screen.getByRole("menuitem", { name: /Báo cáo bán hàng/ }).className).toContain(
      "ant-menu-item-selected"
    );
    expect(screen.getByRole("menuitem", { name: "home Tổng quan" }).className).not.toContain(
      "ant-menu-item-selected"
    );
    expect(crumbs().getByText("Báo cáo bán hàng")).toBeTruthy();
    expect(crumbs().queryByText("Tổng quan")).toBeNull();
    await act(() => router.navigate(-1));
    await screen.findByRole("heading", { name: "Tổng quan vận hành" });
  }, 20000);

  it("renders the products list on /products", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : config.url === "/products"
            ? { data: [], total: 0, page: 1, pageSize: 20, totalPage: 1 }
            : []
      );
    const router = renderRoute("/products");
    await screen.findByRole("heading", { name: "Sản phẩm" });
    expect(await screen.findByText("Không có sản phẩm")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Sản phẩm/ }).className).toContain(
      "ant-menu-item-selected"
    );
    await act(() => router.navigate("/dashboard"));
    await screen.findByRole("heading", { name: "Tổng quan vận hành" });
    expect(screen.queryByRole("heading", { name: "Sản phẩm" })).toBeNull();
  }, 20000);

  it("highlights Sản phẩm on a product detail route and navigates to the list", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : config.url === "/products"
            ? { data: [], total: 0, page: 1, pageSize: 20, totalPage: 1 }
            : []
      );
    const router = renderRoute("/products/abc");
    const menu = await screen.findByRole("menuitem", { name: /Sản phẩm/ });
    await waitFor(() => expect(menu.className).toContain("ant-menu-item-selected"));
    fireEvent.click(menu);
    await waitFor(() => expect(router.state.location.pathname).toBe("/products"));
  }, 20000);

  it("supports direct detail, selected catalog menu, scoped breadcrumbs, list and back navigation", async () => {
    const router = renderRoute("/catalog/attributes/size-id");
    expect(await screen.findByText("S")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Về danh sách thuộc tính" })).toBeNull();
    expect(screen.getByText("size")).toBeTruthy();
    const menu = screen.getByRole("menuitem", { name: /Thuộc tính/ });
    expect(menu.className).toContain("ant-menu-item-selected");
    const crumbs = screen.getByRole("navigation");
    expect(within(crumbs).getByText("Chi tiết thuộc tính")).toBeTruthy();
    expect(within(crumbs).queryByText("Sản phẩm")).toBeNull();
    fireEvent.click(within(crumbs).getByRole("link", { name: "Thuộc tính" }));
    await screen.findByRole("button", { name: "Thêm thuộc tính" });
    await act(() => router.navigate(-1));
    await screen.findByText("S");
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

  it("profile bị từ chối (403) → dọn phiên và về login thay vì màn lỗi", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("forbidden", "403", config, null, {
        config,
        headers: {},
        status: 403,
        statusText: "Forbidden",
        data: { message: "Forbidden", errors: { code: "CMS_MEMBERSHIP_REQUIRED" } }
      });
    };
    const router = renderRoute("/catalog/attributes");
    await screen.findByText("Đăng nhập vào CMS");
    expect(router.state.location.pathname).toBe("/auth/login");
    expect(screen.queryByText("Không tải được thông tin tài khoản")).toBeNull();
  });

  it("opens Tồn kho from the sidebar with its menu item selected and breadcrumb", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/auth/profile"
          ? profile
          : {
              data: [],
              total: 0,
              totalPage: 0,
              page: 1,
              pageSize: 10,
              metadata: { lowStockThreshold: 5, stock: "all" }
            }
      );
    const router = renderRoute("/inventory");
    await screen.findByRole("heading", { name: "Tồn kho" });
    expect((await screen.findByRole("menuitem", { name: /Tồn kho/ })).className).toContain(
      "ant-menu-item-selected"
    );
    expect(screen.getByRole("menuitem", { name: /Sản phẩm/ }).className).not.toContain(
      "ant-menu-item-selected"
    );
    const crumbs = within(screen.getByRole("navigation"));
    expect(crumbs.getByText("Tồn kho")).toBeTruthy();
    expect(crumbs.queryByText("Sản phẩm")).toBeNull();
    await act(() => router.navigate("/dashboard"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Tồn kho/ }));
    await screen.findByRole("heading", { name: "Tồn kho" });
    expect(router.state.location.pathname).toBe("/inventory");
  });
});
