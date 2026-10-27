import type { NotificationView } from "@/services/notifications";

export const DESKTOP_DEVICE_CHANGED = "cms-desktop-device-changed";
export interface DesktopDeviceState {
  enabled: boolean;
  activationId: string | null;
}

export function subscribeDesktopDeviceChanges(onChange: (scopeKey: string) => void): () => void {
  const local = (event: Event) => onChange((event as CustomEvent<string>).detail);
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(DESKTOP_DEVICE_CHANGED);
      channel.onmessage = event => {
        if (typeof event.data === "string") onChange(event.data);
      };
    }
  } catch {
    // Persisted activation IDs also detect missed transitions on the next refresh.
  }
  window.addEventListener(DESKTOP_DEVICE_CHANGED, local);
  return () => {
    window.removeEventListener(DESKTOP_DEVICE_CHANGED, local);
    channel?.close();
  };
}

export function desktopAvailability(): NotificationPermission | "unsupported" | "insecure" {
  if (typeof Notification === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

export function requestDesktopPermission(): Promise<NotificationPermission> {
  const state = desktopAvailability();
  if (state === "unsupported" || state === "insecure")
    return Promise.reject(new Error("Thông báo máy tính không khả dụng"));
  return state === "default" ? Notification.requestPermission() : Promise.resolve(state);
}

function storage<T>(
  name: "devices" | "claims",
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Không thể truy cập bộ nhớ thông báo"));
      return;
    }
    const open = indexedDB.open("eviber-cms-notifications-v1", 1);
    let db: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let expired = false;
    const fail = (error: unknown) => {
      clearTimeout(timeout);
      db?.close();
      reject(error);
    };
    const timeout = setTimeout(() => {
      expired = true;
      try {
        transaction?.abort();
      } catch {
        // The transaction may already have committed before its completion event.
      }
      fail(new Error("Bộ nhớ thông báo không phản hồi"));
    }, 5_000);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("devices");
      open.result.createObjectStore("claims");
    };
    open.onerror = () => fail(open.error);
    open.onblocked = () => {
      expired = true;
      fail(new Error("Bộ nhớ thông báo đang bị chặn"));
    };
    open.onsuccess = () => {
      db = open.result;
      if (expired) {
        db.close();
        return;
      }
      db.onversionchange = () => db?.close();
      try {
        transaction = db.transaction(name, mode);
        let value: T;
        transaction.oncomplete = () => {
          clearTimeout(timeout);
          db?.close();
          resolve(value);
        };
        transaction.onabort = () => {
          fail(transaction?.error ?? new Error("Không thể lưu thông báo"));
        };
        run(transaction.objectStore(name), next => {
          value = next;
        });
      } catch (error) {
        fail(error);
      }
    };
  });
}

export const readDesktopDevice = (scopeKey: string): Promise<DesktopDeviceState> =>
  storage("devices", "readonly", (store, result) => {
    const request = store.get(scopeKey);
    request.onsuccess = () => {
      const value = request.result;
      result({
        enabled: value?.enabled === true && typeof value?.activationId === "string",
        activationId: typeof value?.activationId === "string" ? value.activationId : null
      });
    };
  });

export const readDesktopEnabled = async (scopeKey: string): Promise<boolean> =>
  (await readDesktopDevice(scopeKey)).enabled;

export const setDesktopEnabled = async (scopeKey: string, enabled: boolean): Promise<void> => {
  await storage<void>("devices", "readwrite", (store, result) => {
    store.put({ enabled, activationId: enabled ? crypto.randomUUID() : null }, scopeKey);
    result(undefined);
  });
  window.dispatchEvent(new CustomEvent(DESKTOP_DEVICE_CHANGED, { detail: scopeKey }));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(DESKTOP_DEVICE_CHANGED);
      channel.postMessage(scopeKey);
      channel.close();
    }
  } catch {
    // Other tabs can still recover the persisted activation ID when they resume.
  }
};

export const claimDesktopDelivery = (scopeKey: string, deliveryId: string): Promise<boolean> =>
  storage("claims", "readwrite", (store, result) => {
    result(true);
    const request = store.add({ attemptedAt: Date.now() }, JSON.stringify([scopeKey, deliveryId]));
    request.onerror = event => {
      if (request.error?.name !== "ConstraintError") return;
      event.preventDefault();
      event.stopPropagation();
      result(false);
    };
  });

export function showDesktopNotification(item: NotificationView, onOpen: () => void): void {
  if (desktopAvailability() !== "granted") return;
  const native = new Notification(item.title, { body: item.body });
  native.onclick = () => {
    native.close();
    onOpen();
  };
}

export function showDesktopTestNotification(): void {
  if (desktopAvailability() === "granted")
    new Notification("Thông báo thử", {
      body: "Thông báo máy tính đã sẵn sàng trên thiết bị này."
    });
}
