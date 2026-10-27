import { afterEach, describe, expect, it, vi } from "vitest";
import {
  desktopAvailability,
  requestDesktopPermission,
  readDesktopEnabled,
  setDesktopEnabled,
  readDesktopDevice,
  claimDesktopDelivery,
  showDesktopNotification,
  showDesktopTestNotification
} from "./desktop-notifications";
import { notification } from "@/test/notification-fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("native desktop boundary", () => {
  it("detects unsupported/insecure contexts and never prompts there", async () => {
    vi.stubGlobal("Notification", undefined);
    expect(desktopAvailability()).toBe("unsupported");
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("isSecureContext", false);
    expect(desktopAvailability()).toBe("insecure");
    await expect(requestDesktopPermission()).rejects.toThrow();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each(["default", "denied", "granted"] as const)(
    "exposes %s without prompting on read",
    permission => {
      const requestPermission = vi.fn().mockResolvedValue("granted");
      vi.stubGlobal("isSecureContext", true);
      vi.stubGlobal("Notification", { permission, requestPermission });
      expect(desktopAvailability()).toBe(permission);
      expect(requestPermission).not.toHaveBeenCalled();
      const promise = requestDesktopPermission();
      expect(requestPermission).toHaveBeenCalledTimes(permission === "default" ? 1 : 0);
      return expect(promise).resolves.toBe(permission === "default" ? "granted" : permission);
    }
  );

  it("fails closed when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(readDesktopEnabled("device")).rejects.toThrow();
    await expect(claimDesktopDelivery("device", "delivery")).rejects.toThrow();
  });
  it("bounds a storage open that never completes", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("indexedDB", { open: () => ({}) });
      const read = readDesktopEnabled("device");
      const result = expect(read).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
  it("persists a distinct activation for every enable and reads it with the device flag", async () => {
    const publish = vi.fn();
    const closeChannel = vi.fn();
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        postMessage = publish;
        close = closeChannel;
      }
    );
    let saved: unknown;
    const put = vi.fn((value: unknown) => {
      saved = value;
    });
    const request = {} as IDBRequest;
    const get = vi.fn(() => {
      Object.defineProperty(request, "result", { value: saved, configurable: true });
      return request;
    });
    const transaction = { objectStore: () => ({ put, get }) } as unknown as IDBTransaction;
    const open = {
      result: { transaction: () => transaction, close: vi.fn() }
    } as unknown as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: () => open });
    const write = async (enabled: boolean) => {
      const pending = setDesktopEnabled("api/user", enabled);
      open.onsuccess!(new Event("success"));
      transaction.oncomplete!(new Event("complete"));
      await pending;
    };
    await write(true);
    const first = saved;
    await write(false);
    expect(saved).toEqual({ enabled: false, activationId: null });
    await write(true);
    expect(saved).toEqual({ enabled: true, activationId: expect.any(String) });
    expect(saved).not.toEqual(first);
    const read = readDesktopDevice("api/user");
    open.onsuccess!(new Event("success"));
    request.onsuccess!(new Event("success"));
    transaction.oncomplete!(new Event("complete"));
    await expect(read).resolves.toEqual(saved);
    expect(publish.mock.calls).toEqual([["api/user"], ["api/user"], ["api/user"]]);
    expect(closeChannel).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledWith("api/user");
  });

  it("waits for a claim transaction to commit and treats only duplicate keys as taken", async () => {
    const add = vi.fn(() => request);
    const request = {} as IDBRequest;
    const transaction = { objectStore: () => ({ add }), error: null } as unknown as IDBTransaction;
    const close = vi.fn();
    const open = {
      result: { transaction: () => transaction, close }
    } as unknown as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: () => open });
    const first = claimDesktopDelivery("device", "delivery");
    open.onsuccess!(new Event("success"));
    let settled = false;
    first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    transaction.oncomplete!(new Event("complete"));
    await expect(first).resolves.toBe(true);
    expect(add.mock.calls[0]).toEqual([
      { attemptedAt: expect.any(Number) },
      '["device","delivery"]'
    ]);
    const second = claimDesktopDelivery("device", "delivery");
    open.onsuccess!(new Event("success"));
    Object.defineProperty(request, "error", {
      value: new DOMException("duplicate", "ConstraintError")
    });
    request.onerror!(new Event("error", { cancelable: true }));
    transaction.oncomplete!(new Event("complete"));
    await expect(second).resolves.toBe(false);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("opens only on native click; dismissal does not run the callback", () => {
    const opened = vi.fn();
    const close = vi.fn();
    let native: { onclick?: () => void; onclose?: () => void; close: () => void };
    const Native = vi.fn(function () {
      native = { close };
      return native;
    });
    Object.assign(Native, { permission: "granted" });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("Notification", Native);
    showDesktopNotification(notification, opened);
    expect(Native).toHaveBeenCalledWith("Đơn hàng mới", { body: "Đơn hàng #42" });
    native!.onclose?.();
    expect(opened).not.toHaveBeenCalled();
    native!.onclick!();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });

  it("rejects an aborted claim transaction instead of authorizing display", async () => {
    const transaction = {
      objectStore: () => ({ add: () => ({}) }),
      error: new DOMException("quota", "QuotaExceededError")
    } as unknown as IDBTransaction;
    const close = vi.fn();
    const open = {
      result: { transaction: () => transaction, close }
    } as unknown as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: () => open });
    const claim = claimDesktopDelivery("device", "delivery");
    open.onsuccess!(new Event("success"));
    transaction.onabort!(new Event("abort"));
    await expect(claim).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("test notification has no historical delivery or click/read action", () => {
    const native = {};
    const Native = vi.fn(function () {
      return native;
    });
    Object.assign(Native, { permission: "granted" });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("Notification", Native);
    showDesktopTestNotification();
    expect(Native).toHaveBeenCalledTimes(1);
    expect(native).toEqual({});
    expect(Native.mock.calls[0]).toEqual([
      "Thông báo thử",
      { body: "Thông báo máy tính đã sẵn sàng trên thiết bị này." }
    ]);
  });
});
