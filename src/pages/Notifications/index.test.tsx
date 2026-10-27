import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/attribute-fixtures";
import { ownerProfile } from "@/test/access-fixtures";
import { notification, notificationList, notificationSummary } from "@/test/notification-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { getNotificationScope } from "@/services/notifications";
import { setCookies } from "@/utils/cookies";
import Notifications from "./index";

const reads: Array<{ url?: string; body: unknown }> = [];
beforeEach(() => {
  reads.length = 0;
  useAppStore.getState().setProfile(ownerProfile);
  useNotificationStore.getState().reset(getNotificationScope()!.key);
  useNotificationStore.setState({
    summary: notificationSummary,
    eligibleEvents: notificationSummary.eligibleEvents
  });
  axiosRequest.defaults.adapter = async config => {
    if (config.method === "post") reads.push({ url: config.url, body: JSON.parse(config.data) });
    return response(config, config.method === "post" ? { changed: 1 } : notificationList);
  };
});
const mount = (path = "/notifications?status=unread&page=3") => {
  const router = createMemoryRouter([{ path: "*", element: <Notifications /> }], {
    initialEntries: [path]
  });
  render(<RouterProvider router={router} />);
  return router;
};
describe("personal notification history", () => {
  it.each(["item", "all"])(
    "rejects a stale %s action after another tab replaces the session",
    async action => {
      const router = mount();
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
      expect(reads).toEqual([]);
      expect(router.state.location.pathname).toBe("/notifications");
    }
  );
  it("keeps page/filter URL, total unread and selection actions independent", async () => {
    const router = mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    expect(screen.getByText("105 chưa đọc")).toBeTruthy();
    expect(router.state.location.search).toBe("?status=unread&page=3");
    expect(reads).toEqual([]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn Đơn hàng mới" }));
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));
    await waitFor(() =>
      expect(reads).toEqual([{ url: "/notifications/read", body: { ids: [notification.id] } }])
    );
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));
    await waitFor(() =>
      expect(reads[1]).toEqual({ url: "/notifications/read-all", body: { through: 42 } })
    );
  });
  it("ignores desktop-only heads; offers an explicit refresh for new in-app items without page jumps", async () => {
    const router = mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    act(() => useNotificationStore.setState({ summary: { ...notificationSummary, head: 80 } }));
    expect(screen.queryByRole("button", { name: "Có thông báo mới — tải lại" })).toBeNull();
    act(() =>
      useNotificationStore.setState({
        summary: { ...notificationSummary, head: 81, items: [{ ...notification, sequence: 81 }] }
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Có thông báo mới — tải lại" }));
    expect(router.state.location.search).toBe("?status=unread&page=3");
  });
  it("shows failed loading with retry and empty results", async () => {
    let failed = true;
    axiosRequest.defaults.adapter = async config => {
      if (failed) throw new AxiosError("Không tải được", undefined, config);
      return response(config, { ...notificationList, data: [], total: 0 });
    };
    mount();
    await screen.findByRole("alert");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có thông báo")).toBeTruthy();
  });
  it("changes filters and pagination through the URL and sends only validated queries", async () => {
    const queries: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      queries.push(config.params);
      return response(config, notificationList);
    };
    const router = mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    expect(queries[0]).toEqual({ status: "unread", page: 3, pageSize: 20 });
    fireEvent.click(document.querySelector(".ant-pagination-item-4")!);
    await waitFor(() => expect(router.state.location.search).toBe("?status=unread&page=4"));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Trạng thái thông báo" }));
    fireEvent.click(
      await screen.findByText("Tất cả", { selector: ".ant-select-item-option-content" })
    );
    await waitFor(() => expect(router.state.location.search).toBe(""));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Loại thông báo" }));
    fireEvent.click(
      await screen.findByText("Đánh giá mới", { selector: ".ant-select-item-option-content" })
    );
    await waitFor(() => expect(router.state.location.search).toBe("?event=review.created"));
    expect(queries[queries.length - 1]).toEqual({
      status: "all",
      event: "review.created",
      page: 1,
      pageSize: 20
    });
  });
  it("keeps stale rows after a failed refresh and safely formats malformed timestamps", async () => {
    let failed = false;
    axiosRequest.defaults.adapter = async config => {
      if (failed) throw new AxiosError("Mất kết nối", undefined, config);
      return response(config, {
        ...notificationList,
        data: [{ ...notification, occurredAt: "invalid" }]
      });
    };
    mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    expect(screen.getByText("—")).toBeTruthy();
    failed = true;
    act(() =>
      useNotificationStore.setState({
        summary: { ...notificationSummary, items: [{ ...notification, sequence: 43 }] }
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Có thông báo mới — tải lại" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /Đơn hàng mới/ })).toBeTruthy();
  });
  it("waits for an in-flight read action before allowing an explicit list refresh", async () => {
    const pending = deferred();
    let listRequests = 0;
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "post") {
        await pending.promise;
        return response(config, { changed: 1 });
      }
      listRequests++;
      return response(config, notificationList);
    };
    mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    act(() =>
      useNotificationStore.setState({
        summary: { ...notificationSummary, items: [{ ...notification, sequence: 43 }] }
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));
    fireEvent.click(screen.getByRole("button", { name: "Có thông báo mới — tải lại" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listRequests).toBe(1);
    await act(async () => pending.resolve(undefined));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
  });
  it("clicks only its own delivery and carries the filtered history return URL", async () => {
    const router = mount();
    fireEvent.click(await screen.findByRole("button", { name: /Đơn hàng mới/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/orders/bbbbbbbbbbbbbbbbbbbbbbbb")
    );
    expect(router.state.location.search).toBe(
      "?returnTo=%2Fnotifications%3Fstatus%3Dunread%26page%3D3"
    );
    expect(reads).toEqual([{ url: "/notifications/read", body: { ids: [notification.id] } }]);
  });
  it("preserves the list and selection when a read mutation fails", async () => {
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "post") throw new AxiosError("Không lưu được", undefined, config);
      return response(config, notificationList);
    };
    const router = mount();
    await screen.findByRole("button", { name: /Đơn hàng mới/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn Đơn hàng mới" }));
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã đọc" }));
    await screen.findByRole("alert");
    expect(
      (screen.getByRole("checkbox", { name: "Chọn Đơn hàng mới" }) as HTMLInputElement).checked
    ).toBe(true);
    expect(router.state.location.pathname).toBe("/notifications");
  });
  it("ignores a late list response after logout", async () => {
    const pending = deferred();
    axiosRequest.defaults.adapter = async config => {
      await pending.promise;
      return response(config, notificationList);
    };
    mount();
    act(() => useAppStore.getState().clearProfile());
    await act(async () => pending.resolve(undefined));
    expect(screen.queryByRole("button", { name: /Đơn hàng mới/ })).toBeNull();
  });
});
