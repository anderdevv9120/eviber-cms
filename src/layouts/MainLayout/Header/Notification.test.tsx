import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/attribute-fixtures";
import { ownerProfile } from "@/test/access-fixtures";
import { notification, notificationSummary } from "@/test/notification-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { getNotificationScope } from "@/services/notifications";
import { setCookies } from "@/utils/cookies";
import Notification from "./Notification";

const requests: Array<{ url?: string; body: unknown }> = [];
beforeEach(() => {
  requests.length = 0;
  useAppStore.getState().setProfile(ownerProfile);
  useNotificationStore.getState().reset(getNotificationScope()!.key);
  useNotificationStore.setState({ summary: notificationSummary });
  axiosRequest.defaults.adapter = async config => {
    requests.push({ url: config.url, body: JSON.parse(config.data ?? "null") });
    return response(config, { changed: 1 });
  };
});
const mount = () => {
  const router = createMemoryRouter([{ path: "*", element: <Notification /> }]);
  render(<RouterProvider router={router} />);
  return router;
};
const open = () => fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));

describe("notification header", () => {
  it("focuses panel actions on opening and returns focus to the bell on Escape", async () => {
    mount();
    const bell = screen.getByRole("button", { name: "Thông báo" });
    bell.focus();
    open();
    const item = await screen.findByRole("button", { name: /Đơn hàng mới/ });
    // Ant Design's motion deadline is 1000ms when jsdom emits no animation-end event.
    await waitFor(() => expect(document.activeElement).toBe(item), { timeout: 3000 });
    fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() => expect(bell.getAttribute("aria-expanded")).toBe("false"));
    expect(document.activeElement).toBe(bell);
  });
  it.each(["item", "all"])(
    "rejects a stale %s action after another tab replaces the session",
    async action => {
      const router = mount();
      open();
      await screen.findByRole("button", { name: /Đơn hàng mới/ });
      setCookies("cmsSessionId", "replacement-session");
      fireEvent.click(
        screen.getByRole("button", {
          name: action === "item" ? /Đơn hàng mới/ : "Đánh dấu tất cả đã đọc"
        })
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(requests).toEqual([]);
      expect(router.state.location.pathname).toBe("/");
    }
  );
  it("caps the badge and preview, opening reads nothing, clicking reads only that row", async () => {
    useNotificationStore.setState({
      summary: {
        ...notificationSummary,
        items: Array.from({ length: 12 }, (_, i) => ({
          ...notification,
          id: String(i),
          title: `Đơn mới ${i}`
        }))
      }
    });
    const router = mount();
    expect(screen.getByText("99+")).toBeTruthy();
    open();
    await screen.findByRole("button", { name: /Đơn mới 0/ });
    expect(screen.queryByRole("button", { name: /Đơn mới 10/ })).toBeNull();
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Đơn mới 0/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/orders/bbbbbbbbbbbbbbbbbbbbbbbb")
    );
    expect(requests).toEqual([{ url: "/notifications/read", body: { ids: ["0"] } }]);
  });
  it("uses the displayed cutoff even when newer data arrives during the mutation", async () => {
    const pending = deferred();
    axiosRequest.defaults.adapter = async config => {
      requests.push({ url: config.url, body: JSON.parse(config.data) });
      await pending.promise;
      return response(config, { changed: 1 });
    };
    mount();
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Đánh dấu tất cả đã đọc" }));
    act(() => useNotificationStore.setState({ summary: { ...notificationSummary, head: 99 } }));
    await act(async () => pending.resolve(undefined));
    expect(requests).toEqual([{ url: "/notifications/read-all", body: { through: 42 } }]);
  });
  it("shows stale errors with retry and keeps history/settings links keyboard reachable", async () => {
    useNotificationStore.setState({ error: "Mất kết nối" });
    mount();
    open();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Mất kết nối")
    );
    const before = useNotificationStore.getState().refreshRevision;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(useNotificationStore.getState().refreshRevision).toBeGreaterThan(before);
    expect(screen.getByRole("link", { name: "Xem tất cả thông báo" }).getAttribute("href")).toBe(
      "/notifications"
    );
    expect(screen.getByRole("link", { name: "Cài đặt thông báo" }).getAttribute("href")).toBe(
      "/settings/notifications"
    );
  });
  it("shows loading and the shared empty state without sample items", async () => {
    useNotificationStore.setState({ summary: null, isSyncing: true });
    mount();
    open();
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      expect.stringContaining("Đang tải")
    );
    act(() =>
      useNotificationStore.setState({
        summary: { ...notificationSummary, items: [], unreadCount: 0 },
        isSyncing: false
      })
    );
    expect(await screen.findByText("Không có thông báo")).toBeTruthy();
  });
  it("discards click navigation after the session changes", async () => {
    const pending = deferred();
    axiosRequest.defaults.adapter = async config => {
      await pending.promise;
      return response(config, { changed: 1 });
    };
    const router = mount();
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Đơn hàng mới/ }));
    act(() => useAppStore.getState().clearProfile());
    await act(async () => pending.resolve(undefined));
    expect(router.state.location.pathname).toBe("/");
  });
});
