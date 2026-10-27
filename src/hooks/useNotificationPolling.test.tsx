import "@/test/attribute-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/attribute-fixtures";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { clearSession, saveTokens } from "@/utils/session";
import { setCookies } from "@/utils/cookies";
import { errorNotification } from "@/utils/notification";
import { useNotificationStore } from "@/store/useNotificationStore";
import type { NotificationSummary, NotificationView } from "@/services/notifications";
import { useNotificationPolling } from "./useNotificationPolling";
import { refreshProfile } from "@/services/auth";

const environment = vi.hoisted(() => ({ url: "https://cms.test/admin/store-a/v1/" }));
vi.mock("@/constants/env", () => ({
  get ADMIN_API_URL() {
    return environment.url;
  }
}));
vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));
vi.mock("@/services/auth", () => ({ refreshProfile: vi.fn() }));

const order: NotificationView = {
  id: "order-delivery",
  sequence: 1,
  type: "order.created",
  title: "Đơn mới",
  body: "Có đơn mới",
  occurredAt: "2026-10-26T00:00:00.000Z",
  deliveredAt: "2026-10-26T00:00:00.000Z",
  readAt: null,
  target: { kind: "order", orderId: "order" }
};
const inventory: NotificationView = {
  ...order,
  id: "stock-delivery",
  sequence: 2,
  type: "inventory.low_stock",
  target: { kind: "inventory", variantId: "variant", productId: "product", sku: "SKU" }
};
const summary: NotificationSummary = {
  items: [inventory, order],
  unreadCount: 21,
  head: 24,
  eligibleEvents: ["order.created", "inventory.low_stock"],
  serverTime: "2026-10-26T00:00:00.000Z"
};
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const event = (name: string) =>
  act(() => {
    window.dispatchEvent(new Event(name));
  });
const visibility = (state: "visible" | "hidden") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

beforeEach(() => {
  vi.mocked(refreshProfile).mockReset().mockResolvedValue(undefined);
  vi.mocked(errorNotification).mockClear();
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  environment.url = "https://cms.test/admin/store-a/v1/";
  useAppStore.getState().setProfile(ownerProfile);
  useNotificationStore.getState().reset(null);
  axiosRequest.defaults.adapter = async config => response(config, summary);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("shared notification polling", () => {
  it("polls after 30 seconds and coalesces focus, online and panel refreshes while busy", async () => {
    const pending = deferred<NotificationSummary>();
    const adapter = vi.fn(async config => response(config, await pending.promise));
    axiosRequest.defaults.adapter = adapter;
    renderHook(useNotificationPolling);
    await flush();
    event("focus");
    event("online");
    act(() => useNotificationStore.getState().refreshNotifications());
    await advance(90_000);
    expect(adapter).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(summary));
    expect(useNotificationStore.getState().summary).toEqual(summary);
    await advance(29_999);
    expect(adapter).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(useNotificationStore.getState().isSyncing).toBe(false);
  });

  it("refreshes immediately on focus, panel open and reconnection when idle", async () => {
    const adapter = vi.fn(async config => response(config, summary));
    axiosRequest.defaults.adapter = adapter;
    renderHook(useNotificationPolling);
    await flush();
    event("focus");
    await flush();
    act(() => useNotificationStore.getState().refreshNotifications());
    await flush();
    event("online");
    await flush();
    expect(adapter).toHaveBeenCalledTimes(4);
    await advance(30_000);
    expect(adapter).toHaveBeenCalledTimes(5);
  });

  it("backs off 60/120 seconds, caps retries, keeps stale data and resets after success without toasts", async () => {
    let failing = false;
    const adapter = vi.fn(async config => {
      if (failing) throw new AxiosError("Mất kết nối", "500", config);
      return response(config, summary);
    });
    axiosRequest.defaults.adapter = adapter;
    renderHook(useNotificationPolling);
    await flush();
    failing = true;
    await advance(30_000);
    expect(useNotificationStore.getState()).toMatchObject({
      summary,
      error: "Mất kết nối",
      isSyncing: false
    });
    await advance(59_999);
    expect(adapter).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(adapter).toHaveBeenCalledTimes(3);
    await advance(119_999);
    expect(adapter).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(adapter).toHaveBeenCalledTimes(4);
    failing = false;
    await advance(120_000);
    expect(adapter).toHaveBeenCalledTimes(5);
    expect(useNotificationStore.getState().error).toBeNull();
    await advance(30_000);
    expect(adapter).toHaveBeenCalledTimes(6);
    expect(errorNotification).not.toHaveBeenCalled();
  });

  it("pauses when hidden or offline and refreshes when visible or online again", async () => {
    const adapter = vi.fn(async config => response(config, summary));
    axiosRequest.defaults.adapter = adapter;
    renderHook(useNotificationPolling);
    await flush();
    visibility("hidden");
    await advance(120_000);
    event("focus");
    await flush();
    expect(adapter).toHaveBeenCalledTimes(1);
    visibility("visible");
    await flush();
    expect(adapter).toHaveBeenCalledTimes(2);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    event("offline");
    await advance(120_000);
    expect(adapter).toHaveBeenCalledTimes(2);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    event("online");
    await flush();
    expect(adapter).toHaveBeenCalledTimes(3);
  });

  it("does not begin requests hidden, offline or without CMS membership", async () => {
    const adapter = vi.fn(async config => response(config, summary));
    axiosRequest.defaults.adapter = adapter;
    visibility("hidden");
    const { unmount } = renderHook(useNotificationPolling);
    await flush();
    expect(adapter).not.toHaveBeenCalled();
    unmount();
    visibility("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const second = renderHook(useNotificationPolling);
    await flush();
    expect(adapter).not.toHaveBeenCalled();
    second.unmount();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() =>
      useAppStore
        .getState()
        .setProfile({ ...ownerProfile, access: { ...ownerProfile.access, role: null } })
    );
    renderHook(useNotificationPolling);
    await flush();
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each(["logout", "account", "session", "tenant", "revision", "membership"])(
    "ignores a late response after %s changes",
    async change => {
      const pending = deferred<NotificationSummary>();
      const adapter = vi.fn(async config => response(config, await pending.promise));
      axiosRequest.defaults.adapter = adapter;
      renderHook(useNotificationPolling);
      await flush();
      axiosRequest.defaults.adapter = async config => response(config, await new Promise(() => {}));
      act(() => {
        if (change === "logout" || change === "account") clearSession();
        if (change === "account") {
          saveTokens({
            accessToken: "B",
            refreshToken: "B-refresh",
            accessExpiresIn: 60000,
            refreshExpiresIn: 60000
          });
          useAppStore.getState().setProfile(staffProfile([]));
        }
        if (change === "session") setCookies("cmsSessionId", "another-tab-session");
        if (change === "tenant") environment.url = "https://cms.test/admin/store-b/v1";
        if (change === "revision")
          useAppStore.setState(state => ({ sessionRevision: state.sessionRevision + 1 }));
        if (change === "membership")
          useAppStore
            .getState()
            .setProfile({ ...ownerProfile, access: { ...ownerProfile.access, role: null } });
      });
      await act(async () => pending.resolve(summary));
      expect(useNotificationStore.getState().summary).toBeNull();
      expect(useNotificationStore.getState().eligibleEvents).toEqual([]);
    }
  );

  it("clears cached contents on a cross-tab session change before another request", async () => {
    renderHook(useNotificationPolling);
    await flush();
    expect(useNotificationStore.getState().summary).not.toBeNull();
    axiosRequest.defaults.adapter = async config => response(config, await new Promise(() => {}));
    setCookies("cmsSessionId", "other-tab");
    event("focus");
    await flush();
    expect(useNotificationStore.getState().summary).toBeNull();
  });

  it("continues polling the current scope after discarding a stale cross-tab response", async () => {
    const pending = deferred<NotificationSummary>();
    axiosRequest.defaults.adapter = async config => response(config, await pending.promise);
    renderHook(useNotificationPolling);
    await flush();
    setCookies("cmsSessionId", "replacement-session");
    const adapter = vi.fn(async config => response(config, { ...summary, unreadCount: 3 }));
    axiosRequest.defaults.adapter = adapter;
    await act(async () => pending.resolve(summary));
    expect(useNotificationStore.getState().summary).toBeNull();
    await advance(30_000);
    expect(useNotificationStore.getState().summary?.unreadCount).toBe(3);
  });

  it.each(["timer", "mount"])(
    "confirms the cookie owner before polling with a cached profile on %s",
    async trigger => {
      const adapter = vi.fn(async config => response(config, summary));
      axiosRequest.defaults.adapter = adapter;
      if (trigger === "timer") {
        renderHook(useNotificationPolling);
        await flush();
      }
      const profileCheck = deferred<void>();
      vi.mocked(refreshProfile).mockReturnValueOnce(profileCheck.promise);
      setCookies("cmsSessionId", "session-B");
      axiosRequest.defaults.adapter = adapter;
      if (trigger === "timer") await advance(30_000);
      else {
        renderHook(useNotificationPolling);
        await flush();
      }
      expect(useNotificationStore.getState().summary).toBeNull();
      expect(adapter).toHaveBeenCalledTimes(trigger === "timer" ? 1 : 0);
      await act(async () => {
        useAppStore.getState().setProfile(staffProfile([]));
        profileCheck.resolve();
      });
      expect(useNotificationStore.getState().summary).toEqual(summary);
      expect(JSON.parse(useNotificationStore.getState().scopeKey!)[1]).toBe("staff");
    }
  );

  it("binds the inbox to the cookie owner through the real session-aware profile refresh", async () => {
    const auth = await vi.importActual<typeof import("@/services/auth")>("@/services/auth");
    vi.mocked(refreshProfile).mockImplementation(auth.refreshProfile);
    setCookies("cmsSessionId", "session-B");
    const adapter = vi.fn(async config => {
      if (config.url === "/auth/profile") return response(config, staffProfile([]));
      expect(useAppStore.getState().profile?._id).toBe("staff");
      return response(config, { ...summary, unreadCount: 3 });
    });
    axiosRequest.defaults.adapter = adapter;
    renderHook(useNotificationPolling);
    await flush();
    expect(adapter.mock.calls[0][0].url).toBe("/auth/profile");
    expect(
      adapter.mock.calls.filter(([config]) => config.url === "/notifications/summary")
    ).toHaveLength(1);
    expect(useAppStore.getState().profile?._id).toBe("staff");
    expect(JSON.parse(useNotificationStore.getState().scopeKey!)[1]).toBe("staff");
    expect(useNotificationStore.getState().summary?.unreadCount).toBe(3);
  });

  it("replaces restricted cached events and uses the server count rather than preview length", async () => {
    renderHook(useNotificationPolling);
    await flush();
    const reduced: NotificationSummary = {
      ...summary,
      items: [order],
      unreadCount: 7,
      eligibleEvents: ["order.created"]
    };
    axiosRequest.defaults.adapter = async config => response(config, reduced);
    act(() => useNotificationStore.getState().refreshNotifications());
    await flush();
    expect(useNotificationStore.getState()).toMatchObject({
      summary: reduced,
      eligibleEvents: ["order.created"]
    });
  });

  it("clears cached authority while a changed profile is being checked", async () => {
    renderHook(useNotificationPolling);
    await flush();
    axiosRequest.defaults.adapter = async config => response(config, await new Promise(() => {}));
    act(() =>
      useAppStore.getState().setProfile({
        ...ownerProfile,
        access: { ...ownerProfile.access, isOwner: false, permissions: [] }
      })
    );
    expect(useNotificationStore.getState().summary).toBeNull();
  });

  it("stops and clears the inbox when the server denies CMS membership", async () => {
    renderHook(useNotificationPolling);
    await flush();
    const adapter = vi.fn(async config => {
      throw new AxiosError("Hết quyền CMS", "403", config, null, {
        ...response(config, {}),
        status: 403,
        data: { message: "Hết quyền CMS", errors: { code: "CMS_MEMBERSHIP_REQUIRED" } }
      });
    });
    axiosRequest.defaults.adapter = adapter;
    act(() => useNotificationStore.getState().refreshNotifications());
    await flush();
    expect(useNotificationStore.getState().summary).toBeNull();
    await advance(240_000);
    event("focus");
    await flush();
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("aborts requests, removes subscriptions/listeners and leaves no timers after cleanup", async () => {
    const pending = deferred<NotificationSummary>();
    const adapter = vi.fn(async config => response(config, await pending.promise));
    axiosRequest.defaults.adapter = adapter;
    const { unmount } = renderHook(useNotificationPolling);
    await flush();
    const signal = adapter.mock.calls[0][0].signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(summary));
    event("focus");
    event("online");
    act(() => useNotificationStore.getState().refreshNotifications());
    await advance(240_000);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(useNotificationStore.getState().summary).toBeNull();
  });

  it("keeps a single active loop through StrictMode remounting", async () => {
    const adapter = vi.fn(async config => response(config, summary));
    axiosRequest.defaults.adapter = adapter;
    const { unmount } = renderHook(useNotificationPolling, { wrapper: StrictMode });
    await flush();
    const initial = adapter.mock.calls.length;
    await advance(30_000);
    expect(adapter).toHaveBeenCalledTimes(initial + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
