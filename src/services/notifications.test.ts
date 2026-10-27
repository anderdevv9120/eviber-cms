import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { clearSession, getSessionId, saveTokens } from "@/utils/session";
import { ADMIN_API_URL } from "@/constants/env";
import * as api from "./notifications";

beforeEach(() => useAppStore.getState().setProfile(ownerProfile));

describe("notification API transport", () => {
  it("sends exact routes, queries, bodies and abort signals without global error toasts", async () => {
    const signal = new AbortController().signal;
    const preference: api.NotificationPreferenceUpdate = {
      expectedRevision: 2,
      expectedStoreRevision: 4,
      changes: [{ type: "order.created", channel: "desktop", enabled: null }]
    };
    const settings: api.NotificationSettingsUpdate = {
      expectedRevision: 4,
      allowPersonalPreferences: true,
      lowStockThreshold: 5,
      events: [
        {
          type: "order.created",
          inApp: { policy: "required", defaultEnabled: true },
          desktop: { policy: "optional", defaultEnabled: false }
        }
      ]
    };
    const listQuery = { status: "unread", event: "order.created", page: 2, pageSize: 20 } as const;
    const feedQuery = { after: 12, through: 24, limit: 50 };
    const calls: Array<
      [() => Promise<unknown>, string, string, unknown, unknown, AbortSignal | undefined]
    > = [
      [
        () => api.getNotificationSummaryAPI(signal),
        "get",
        "/notifications/summary",
        undefined,
        undefined,
        signal
      ],
      [
        () => api.listNotificationsAPI(listQuery, signal),
        "get",
        "/notifications",
        listQuery,
        undefined,
        signal
      ],
      [
        () => api.getDesktopFeedAPI(feedQuery, signal),
        "get",
        "/notifications/desktop-feed",
        feedQuery,
        undefined,
        signal
      ],
      [
        () => api.markNotificationsReadAPI(["delivery"]),
        "post",
        "/notifications/read",
        undefined,
        { ids: ["delivery"] },
        undefined
      ],
      [
        () => api.markAllNotificationsReadAPI(24),
        "post",
        "/notifications/read-all",
        undefined,
        { through: 24 },
        undefined
      ],
      [
        () => api.getNotificationPreferencesAPI(signal),
        "get",
        "/notifications/preferences",
        undefined,
        undefined,
        signal
      ],
      [
        () => api.updateNotificationPreferencesAPI(preference),
        "patch",
        "/notifications/preferences",
        undefined,
        preference,
        undefined
      ],
      [
        () => api.getNotificationSettingsAPI(signal),
        "get",
        "/notification-settings",
        undefined,
        undefined,
        signal
      ],
      [
        () => api.updateNotificationSettingsAPI(settings),
        "put",
        "/notification-settings",
        undefined,
        settings,
        undefined
      ]
    ];
    for (const [call, method, url, params, body, expectedSignal] of calls) {
      const adapter = vi.fn(async config => response(config, { changed: 1 }));
      axiosRequest.defaults.adapter = adapter;
      await expect(call()).resolves.toEqual({ data: { changed: 1 }, message: "success" });
      const config = adapter.mock.calls[0][0];
      expect(config).toMatchObject({ method, url, baseURL: ADMIN_API_URL, toastError: false });
      expect(config.params).toEqual(params);
      expect(config.data === undefined ? undefined : JSON.parse(config.data)).toEqual(body);
      expect(config.signal).toBe(expectedSignal);
    }
  });

  it("allows omitted read signals and a desktop baseline without a cursor", async () => {
    const adapter = vi.fn(async config => response(config, {}));
    axiosRequest.defaults.adapter = adapter;
    await api.getNotificationSummaryAPI();
    await api.listNotificationsAPI({});
    await api.getDesktopFeedAPI({});
    await api.getNotificationPreferencesAPI();
    await api.getNotificationSettingsAPI();
    expect(
      adapter.mock.calls.every(([config]) => !config.signal && config.toastError === false)
    ).toBe(true);
    expect(adapter.mock.calls[2][0].params).toEqual({});
  });
});

describe("notification scope", () => {
  it("includes the API tenant, user, shared session ID and local session revision", () => {
    const scope = api.getNotificationScope();
    expect(scope).toMatchObject({
      userId: "owner",
      sessionId: getSessionId(),
      sessionRevision: useAppStore.getState().sessionRevision
    });
    expect(JSON.parse(scope!.key)).toEqual([
      ADMIN_API_URL.replace(/\/+$/, ""),
      "owner",
      getSessionId(),
      useAppStore.getState().sessionRevision
    ]);
    expect(JSON.parse(scope!.deviceKey)).toEqual([ADMIN_API_URL.replace(/\/+$/, ""), "owner"]);
    useAppStore.setState(state => ({ sessionRevision: state.sessionRevision + 1 }));
    expect(api.getNotificationScope()?.deviceKey).toBe(scope!.deviceKey);
    useAppStore.getState().setProfile(staffProfile([]));
    expect(api.getNotificationScope()?.key).not.toBe(scope?.key);
    expect(api.getNotificationScope()?.deviceKey).not.toBe(scope!.deviceKey);
  });

  it("returns no scope without an authenticated CMS member", () => {
    clearSession();
    expect(api.getNotificationScope()).toBeNull();
    saveTokens({
      accessToken: "test",
      refreshToken: "refresh",
      accessExpiresIn: 60000,
      refreshExpiresIn: 60000
    });
    expect(api.getNotificationScope()).toBeNull();
    useAppStore
      .getState()
      .setProfile({ ...ownerProfile, access: { ...ownerProfile.access, role: null } });
    expect(api.getNotificationScope()).toBeNull();
  });
});
