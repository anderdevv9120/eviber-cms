import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/attribute-fixtures";
import { staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { setCookies } from "@/utils/cookies";
import { successNotification } from "@/utils/notification";
import type {
  NotificationPreferencesView,
  StoreNotificationSettings
} from "@/services/notifications";
import NotificationSettings from "./index";
import * as desktop from "@/utils/desktop-notifications";

vi.mock("@/utils/desktop-notifications", () => ({
  desktopAvailability: vi.fn(() => "unsupported"),
  requestDesktopPermission: vi.fn(),
  readDesktopEnabled: vi.fn(),
  setDesktopEnabled: vi.fn(),
  showDesktopTestNotification: vi.fn(),
  DESKTOP_DEVICE_CHANGED: "cms-desktop-device-changed",
  subscribeDesktopDeviceChanges: vi.fn(() => () => {})
}));

vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
const channel = {
  policy: "optional" as const,
  defaultEnabled: true,
  override: null,
  enabled: true,
  editable: true
};
let preferences: NotificationPreferencesView;
let settings: StoreNotificationSettings;
const calls: Array<{ url?: string; method?: string; body: unknown }> = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(desktop.desktopAvailability).mockReturnValue("unsupported");
  vi.mocked(desktop.readDesktopEnabled).mockReset().mockResolvedValue(false);
  vi.mocked(desktop.setDesktopEnabled).mockReset().mockResolvedValue(undefined);
  vi.mocked(desktop.requestDesktopPermission).mockReset().mockResolvedValue("granted");
  calls.length = 0;
  useAppStore.getState().setProfile(staffProfile([]));
  preferences = {
    revision: 2,
    storeRevision: 4,
    allowPersonalPreferences: true,
    events: [
      {
        type: "order.created",
        inApp: { ...channel, override: false, enabled: false },
        desktop: { ...channel }
      }
    ]
  };
  settings = {
    revision: 4,
    allowPersonalPreferences: true,
    lowStockThreshold: 5,
    events: {
      "order.created": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: false }
      },
      "refund.submitted": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: true }
      },
      "refund.ready_for_payout": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: true }
      },
      "inventory.low_stock": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: true }
      },
      "inventory.out_of_stock": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: true }
      },
      "review.created": {
        inApp: { policy: "optional", defaultEnabled: true },
        desktop: { policy: "optional", defaultEnabled: true }
      }
    }
  };
  axiosRequest.defaults.adapter = async config => {
    calls.push({
      url: config.url,
      method: config.method,
      body: config.data ? JSON.parse(config.data) : undefined
    });
    return response(config, config.url === "/notification-settings" ? settings : preferences);
  };
});
const mount = (path = "/settings/notifications") => {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <App>
            <NotificationSettings />
          </App>
        )
      }
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
};
const choose = async (name: string, option: string) => {
  fireEvent.mouseDown(screen.getByRole("combobox", { name }));
  fireEvent.click(await screen.findByText(option, { selector: ".ant-select-item-option-content" }));
};
const personalControl = "Đơn hàng mới — Trong ứng dụng";
const storeControl = "Đơn hàng mới — Trong ứng dụng — Chính sách";
const writes = () => calls.filter(call => call.method !== "get");

describe("desktop device actions", () => {
  it.each(["unsupported", "insecure", "denied"] as const)(
    "explains %s without prompting",
    async status => {
      vi.mocked(desktop.desktopAvailability).mockReturnValue(status);
      mount();
      await screen.findByRole("combobox", { name: personalControl });
      expect(
        (screen.getByRole("button", { name: "Bật thông báo trên máy tính" }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
      expect(desktop.requestDesktopPermission).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          status === "unsupported"
            ? /Trình duyệt không hỗ trợ/
            : status === "insecure"
              ? /Cần HTTPS/
              : /Trình duyệt đã chặn/
        )
      ).toBeTruthy();
    }
  );
  it("requests permission during the enable click, then persists this API/user device flag", async () => {
    vi.mocked(desktop.desktopAvailability).mockReturnValue("default");
    const permission = deferred<NotificationPermission>();
    vi.mocked(desktop.requestDesktopPermission).mockReturnValue(permission.promise);
    mount();
    const enable = await screen.findByRole("button", { name: "Bật thông báo trên máy tính" });
    await waitFor(() => expect((enable as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(enable);
    expect(desktop.requestDesktopPermission).toHaveBeenCalledTimes(1);
    expect(desktop.setDesktopEnabled).not.toHaveBeenCalled();
    vi.mocked(desktop.desktopAvailability).mockReturnValue("granted");
    vi.mocked(desktop.readDesktopEnabled).mockResolvedValue(true);
    await act(async () => permission.resolve("granted"));
    const disable = await screen.findByRole("button", { name: "Tắt thông báo trên máy tính" });
    expect(desktop.setDesktopEnabled).toHaveBeenCalledWith(expect.any(String), true);
    const deviceKey = vi.mocked(desktop.setDesktopEnabled).mock.calls[0][0];
    expect(JSON.parse(deviceKey)).toHaveLength(2);
    expect(JSON.parse(deviceKey)[1]).toBe("staff");
    fireEvent.click(screen.getByRole("button", { name: "Gửi thông báo thử" }));
    await waitFor(() => expect(desktop.showDesktopTestNotification).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([]);
    fireEvent.click(disable);
    await waitFor(() =>
      expect(desktop.setDesktopEnabled).toHaveBeenLastCalledWith(deviceKey, false)
    );
  });
  it("permission alone leaves another account disabled and sends no test automatically", async () => {
    vi.mocked(desktop.desktopAvailability).mockReturnValue("granted");
    mount();
    const enable = await screen.findByRole("button", { name: "Bật thông báo trên máy tính" });
    await waitFor(() => expect((enable as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("button", { name: "Gửi thông báo thử" })).toBeNull();
    expect(desktop.showDesktopTestNotification).not.toHaveBeenCalled();
  });
  it("does not enable after a permission response for an ended session", async () => {
    vi.mocked(desktop.desktopAvailability).mockReturnValue("default");
    const permission = deferred<NotificationPermission>();
    vi.mocked(desktop.requestDesktopPermission).mockReturnValue(permission.promise);
    mount();
    const enable = await screen.findByRole("button", { name: "Bật thông báo trên máy tính" });
    await waitFor(() => expect((enable as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(enable);
    setCookies("cmsSessionId", "other-account");
    await act(async () => permission.resolve("granted"));
    expect(desktop.setDesktopEnabled).not.toHaveBeenCalled();
  });
  it("shows storage failure while personal settings remain usable", async () => {
    vi.mocked(desktop.desktopAvailability).mockReturnValue("granted");
    vi.mocked(desktop.readDesktopEnabled).mockRejectedValue(new Error("blocked"));
    mount();
    await screen.findByText(/Không thể truy cập bộ nhớ thông báo/);
    expect(await screen.findByRole("combobox", { name: personalControl })).toBeTruthy();
    expect(desktop.showDesktopTestNotification).not.toHaveBeenCalled();
  });
});
describe("notification settings", () => {
  it("loads only eligible personal preferences for ordinary staff and keeps email inert", async () => {
    mount();
    await screen.findByRole("combobox", { name: personalControl });
    expect(screen.queryByRole("tab", { name: "Cửa hàng" })).toBeNull();
    expect(calls.some(call => call.url === "/notification-settings")).toBe(false);
    expect(screen.queryByText("Yêu cầu hoàn tiền mới")).toBeNull();
    expect(screen.getByText("Sắp ra mắt")).toBeTruthy();
    expect(
      within(screen.getByRole("tabpanel", { name: "Cá nhân" })).getByRole("combobox", {
        name: personalControl
      })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /bật.*thiết bị/i })).toBeNull();
  });
  it("restores inheritance with null, preserving independent desktop choices and revisions", async () => {
    mount();
    await screen.findByRole("combobox", { name: personalControl });
    await choose(personalControl, "Theo cửa hàng (Bật)");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn cá nhân" }));
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          url: "/notifications/preferences",
          method: "patch",
          body: {
            expectedRevision: 2,
            expectedStoreRevision: 4,
            changes: [{ type: "order.created", channel: "inApp", enabled: null }]
          }
        }
      ])
    );
    await waitFor(() => expect(successNotification).toHaveBeenCalledTimes(1));
  });
  it.each(["required", "disabled", "personal-lock"])(
    "explains %s locks without erasing remembered overrides",
    async lock => {
      preferences.events[0].inApp = {
        ...channel,
        override: false,
        editable: false,
        policy: lock === "required" ? "required" : lock === "disabled" ? "disabled" : "optional"
      };
      if (lock === "personal-lock") preferences.allowPersonalPreferences = false;
      mount();
      const control = await screen.findByRole("combobox", { name: personalControl });
      expect((control as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByText(/Lựa chọn đã lưu: Tắt/)).toBeTruthy();
      expect(
        screen.getAllByText(
          lock === "required"
            ? /Cửa hàng bắt buộc bật/
            : lock === "disabled"
              ? /Cửa hàng đã tắt/
              : /Cửa hàng không cho phép tùy chỉnh/
        ).length
      ).toBeGreaterThan(0);
      expect(writes()).toEqual([]);
    }
  );
  it("gates store reads and writes separately", async () => {
    useAppStore.getState().setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ"]));
    mount("/settings/notifications?tab=store");
    const control = await screen.findByRole("combobox", { name: storeControl });
    expect((control as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Lưu chính sách cửa hàng" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText("Đánh giá mới")).toBeTruthy();
    expect(writes()).toEqual([]);
  });
  it.each([0, 1001, 1.5])(
    "rejects threshold %s without sending a store mutation",
    async threshold => {
      useAppStore
        .getState()
        .setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ", "NOTIFICATION_SETTINGS_UPDATE"]));
      mount("/settings/notifications?tab=store");
      fireEvent.change(await screen.findByRole("spinbutton", { name: "Ngưỡng sắp hết hàng" }), {
        target: { value: String(threshold) }
      });
      fireEvent.click(screen.getByRole("button", { name: "Lưu chính sách cửa hàng" }));
      await screen.findByText("Nhập số nguyên từ 1 đến 1000");
      expect(writes()).toEqual([]);
    }
  );
  it("saves all six store events, independent channels, threshold and revision", async () => {
    useAppStore
      .getState()
      .setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ", "NOTIFICATION_SETTINGS_UPDATE"]));
    mount("/settings/notifications?tab=store");
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Ngưỡng sắp hết hàng" }), {
      target: { value: "1000" }
    });
    await choose(storeControl, "Bắt buộc");
    fireEvent.click(screen.getByRole("button", { name: "Lưu chính sách cửa hàng" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      url: "/notification-settings",
      method: "put",
      body: {
        expectedRevision: 4,
        allowPersonalPreferences: true,
        lowStockThreshold: 1000,
        events: [
          {
            type: "order.created",
            inApp: { policy: "required", defaultEnabled: true },
            desktop: { policy: "optional", defaultEnabled: false }
          },
          ...Object.entries(settings.events)
            .slice(1)
            .map(([type, event]) => ({ type, ...event }))
        ]
      }
    });
  });
  it.each([409, 500, undefined])(
    "blocks retries and reloads authoritative values after save status %s",
    async status => {
      axiosRequest.defaults.adapter = async config => {
        if (config.method !== "get")
          throw new AxiosError(
            "Échec",
            undefined,
            config,
            undefined,
            status
              ? {
                  config,
                  status,
                  statusText: "failed",
                  headers: {},
                  data: { message: "Không lưu được" }
                }
              : undefined
          );
        return response(config, preferences);
      };
      mount();
      await screen.findByRole("combobox", { name: personalControl });
      await choose(personalControl, "Bật");
      fireEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn cá nhân" }));
      await screen.findByRole("alert");
      expect(successNotification).not.toHaveBeenCalled();
      expect(
        (screen.getByRole("button", { name: /Lưu tùy chọn cá nhân/ }) as HTMLButtonElement).disabled
      ).toBe(true);
      preferences = {
        ...preferences,
        revision: 3,
        events: [{ ...preferences.events[0], inApp: { ...channel, override: true } }]
      };
      fireEvent.click(screen.getByRole("button", { name: "Tải lại từ máy chủ" }));
      fireEvent.click(await screen.findByRole("button", { name: "Bỏ thay đổi và tải lại" }));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(screen.getByText("Lựa chọn đã lưu: Bật")).toBeTruthy();
      expect(successNotification).not.toHaveBeenCalled();
    }
  );
  it("drops store drafts immediately when READ is revoked", async () => {
    useAppStore
      .getState()
      .setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ", "NOTIFICATION_SETTINGS_UPDATE"]));
    mount("/settings/notifications?tab=store");
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Ngưỡng sắp hết hàng" }), {
      target: { value: "8" }
    });
    act(() => useAppStore.getState().setProfile(staffProfile([])));
    await screen.findByRole("combobox", { name: personalControl });
    expect(screen.queryByRole("tab", { name: "Cửa hàng" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu chính sách cửa hàng" })).toBeNull();
    expect(writes()).toEqual([]);
  });
  it("rejects a pre-click session change and ignores a late save response", async () => {
    const pending = deferred<void>();
    axiosRequest.defaults.adapter = async config => {
      if (config.method !== "get") await pending.promise;
      calls.push({
        url: config.url,
        method: config.method,
        body: config.data ? JSON.parse(config.data) : undefined
      });
      return response(config, preferences);
    };
    mount();
    await screen.findByRole("combobox", { name: personalControl });
    await choose(personalControl, "Bật");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn cá nhân" }));
    setCookies("cmsSessionId", "replacement");
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(successNotification).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });
  it("rejects a session replaced before clicking save", async () => {
    mount();
    await screen.findByRole("combobox", { name: personalControl });
    await choose(personalControl, "Bật");
    setCookies("cmsSessionId", "replacement");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn cá nhân" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(writes()).toEqual([]);
    expect(successNotification).not.toHaveBeenCalled();
  });
  it("disables store saving when UPDATE is revoked while retaining READ", async () => {
    useAppStore
      .getState()
      .setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ", "NOTIFICATION_SETTINGS_UPDATE"]));
    mount("/settings/notifications?tab=store");
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Ngưỡng sắp hết hàng" }), {
      target: { value: "8" }
    });
    act(() => useAppStore.getState().setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ"])));
    await screen.findByRole("combobox", { name: storeControl });
    fireEvent.click(screen.getByRole("button", { name: "Lưu chính sách cửa hàng" }));
    expect(writes()).toEqual([]);
  });
  it("shows load failure and retries without any save or success", async () => {
    let failed = true;
    axiosRequest.defaults.adapter = async config => {
      if (failed) throw new AxiosError("Offline", undefined, config);
      return response(config, preferences);
    };
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByRole("combobox")).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại từ máy chủ" }));
    await screen.findByRole("combobox", { name: personalControl });
    expect(successNotification).not.toHaveBeenCalled();
  });
  it("ignores preferences arriving after logout", async () => {
    const pending = deferred<void>();
    axiosRequest.defaults.adapter = async config => {
      await pending.promise;
      return response(config, preferences);
    };
    mount();
    act(() => useAppStore.getState().clearProfile());
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(successNotification).not.toHaveBeenCalled();
  });
  it("protects dirty drafts when switching tabs and leaving the page", async () => {
    useAppStore.getState().setProfile(staffProfile(["NOTIFICATION_SETTINGS_READ"]));
    const router = mount();
    await screen.findByRole("combobox", { name: personalControl });
    await choose(personalControl, "Bật");
    fireEvent.click(screen.getByRole("tab", { name: "Cửa hàng" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ở lại" }));
    expect(router.state.location.search).toBe("");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
