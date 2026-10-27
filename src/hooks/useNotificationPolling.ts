import { useEffect } from "react";
import {
  getDesktopFeedAPI,
  getNotificationScope,
  getNotificationSummaryAPI
} from "@/services/notifications";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { refreshProfile } from "@/services/auth";
import {
  desktopAvailability,
  readDesktopDevice,
  claimDesktopDelivery,
  showDesktopNotification,
  subscribeDesktopDeviceChanges
} from "@/utils/desktop-notifications";
import { notificationHref } from "@/pages/Notifications/notification-query";
import { PATH_AUTH } from "@/constants/paths";

const navigateWindow = (href: string) => window.location.assign(href);

export const useNotificationPolling = (navigate = navigateWindow): void => {
  useEffect(() => {
    let disposed = false;
    let scopeKey: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    let failures = 0;
    let denied = false;
    let desktopEnabled = false;
    let activationId: string | null = null;
    let cursor: number | undefined;
    let through: number | undefined;
    const store = useNotificationStore;
    const permitted = () => desktopAvailability() === "granted";
    const available = () =>
      navigator.onLine &&
      (document.visibilityState !== "hidden" || (desktopEnabled && permitted()));
    const stop = () => {
      clearTimeout(timer);
      timer = undefined;
      active?.abort();
      active = null;
      store.setState({ isSyncing: false });
    };
    const syncScope = () => {
      const next = getNotificationScope()?.key ?? null;
      if (next !== scopeKey) {
        stop();
        scopeKey = next;
        failures = 0;
        denied = false;
        desktopEnabled = false;
        activationId = null;
        cursor = undefined;
        through = undefined;
        store.getState().reset(next);
      }
      return next;
    };

    const refresh = async () => {
      if (disposed) return;
      if (!syncScope() || denied || !navigator.onLine) {
        stop();
        return;
      }
      if (active) return;
      clearTimeout(timer);
      timer = undefined;
      const controller = new AbortController();
      const requestScope = scopeKey;
      const deviceKey = getNotificationScope()!.deviceKey;
      active = controller;
      store.setState({ isSyncing: true });
      const current = () =>
        !disposed && active === controller && getNotificationScope()?.key === requestScope;
      try {
        await refreshProfile();
        if (!current()) return;
        const visible = document.visibilityState !== "hidden";
        const syncSummary = async () => {
          const { data } = await getNotificationSummaryAPI(controller.signal);
          if (!current()) return;
          failures = 0;
          store.setState({
            summary: data,
            eligibleEvents: data.eligibleEvents,
            lastSyncedAt: Date.now(),
            error: null
          });
        };
        if (visible) await syncSummary();
        if (!current()) return;
        let device = { enabled: false, activationId: null as string | null };
        try {
          if (permitted()) device = await readDesktopDevice(deviceKey);
        } catch {
          // Desktop storage failure must leave the inbox usable.
        }
        if (!current()) return;
        if (!device.enabled || activationId !== device.activationId) {
          cursor = undefined;
          through = undefined;
        }
        desktopEnabled = device.enabled;
        activationId = device.activationId;
        if (!available()) return;
        if (!visible) await syncSummary();
        if (!current()) return;
        if (!desktopEnabled || !permitted()) return;
        const deviceCurrent = async () => {
          const next = await readDesktopDevice(deviceKey);
          return next.enabled && next.activationId === device.activationId;
        };
        try {
          for (let page = 0; page < 5; page++) {
            const requestedAt = performance.now();
            const { data: feed } = await getDesktopFeedAPI(
              {
                ...(cursor === undefined ? {} : { after: cursor }),
                ...(through === undefined ? {} : { through }),
                limit: 50
              },
              controller.signal
            );
            if (!current() || !permitted()) return;
            if (cursor === undefined) {
              cursor = feed.through;
              through = undefined;
              return;
            }
            for (const item of feed.items) {
              const age = Date.parse(feed.serverTime) - Date.parse(item.occurredAt);
              const fresh = () =>
                Number.isFinite(age) &&
                age >= 0 &&
                age + performance.now() - requestedAt <= 120_000;
              if (!fresh()) continue;
              if (!current() || !permitted() || !(await deviceCurrent())) return;
              if (!current() || !permitted()) return;
              if (!(await claimDesktopDelivery(deviceKey, item.id))) continue;
              if (!current() || !permitted() || !(await deviceCurrent())) return;
              if (!current() || !permitted() || !fresh()) continue;
              try {
                showDesktopNotification(item, () => {
                  window.focus();
                  navigate(
                    getNotificationScope()?.key === requestScope
                      ? notificationHref(item.target)
                      : PATH_AUTH.LOGIN
                  );
                });
              } catch {
                // The committed claim records an attempt even when the OS rejects display.
              }
            }
            if (!current()) return;
            cursor = feed.cursor;
            through = feed.hasMore ? feed.through : undefined;
            if (!feed.hasMore) break;
          }
        } catch {
          // Retry this desktop page later without rolling back the successful inbox refresh.
        }
      } catch (error) {
        if (!current() || controller.signal.aborted) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.errors?.code === "CMS_MEMBERSHIP_REQUIRED")
        ) {
          denied = true;
          store.getState().reset(scopeKey);
        } else {
          failures = Math.min(failures + 1, 2);
        }
        store.setState({ error: getErrorMessage(error) });
      } finally {
        if (!disposed && active === controller) {
          active = null;
          store.setState({ isSyncing: false });
          if (syncScope() && !denied && available()) {
            timer = setTimeout(trigger, 30_000 * 2 ** failures);
          }
        }
      }
    };
    const trigger = () => {
      refresh().catch(error => {
        if (!disposed) store.setState({ error: getErrorMessage(error) });
      });
    };
    const unsubscribeApp = useAppStore.subscribe((state, previous) => {
      if (
        state.profile?.access !== previous.profile?.access &&
        getNotificationScope()?.key === scopeKey
      ) {
        stop();
        store.getState().reset(scopeKey);
      }
      trigger();
    });
    const unsubscribeRefresh = store.subscribe((state, previous) => {
      if (state.refreshRevision !== previous.refreshRevision) trigger();
    });
    const deviceChanged = (deviceKey: string) => {
      if (deviceKey !== getNotificationScope()?.deviceKey) return;
      stop();
      cursor = undefined;
      through = undefined;
      trigger();
    };
    const unsubscribeDevice = subscribeDesktopDeviceChanges(deviceChanged);
    window.addEventListener("focus", trigger);
    window.addEventListener("online", trigger);
    window.addEventListener("offline", trigger);
    document.addEventListener("visibilitychange", trigger);
    store.getState().reset(null);
    trigger();
    return () => {
      disposed = true;
      unsubscribeApp();
      unsubscribeRefresh();
      unsubscribeDevice();
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      window.removeEventListener("offline", trigger);
      document.removeEventListener("visibilitychange", trigger);
      stop();
      store.getState().reset(null);
    };
  }, [navigate]);
};
