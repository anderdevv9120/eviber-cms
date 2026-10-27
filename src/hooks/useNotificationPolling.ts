import { useEffect } from "react";
import { getNotificationScope, getNotificationSummaryAPI } from "@/services/notifications";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { refreshProfile } from "@/services/auth";

export const useNotificationPolling = (): void => {
  useEffect(() => {
    let disposed = false;
    let scopeKey: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    let failures = 0;
    let denied = false;
    const store = useNotificationStore;
    const available = () => navigator.onLine && document.visibilityState !== "hidden";
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
        store.getState().reset(next);
      }
      return next;
    };

    const refresh = async () => {
      if (disposed) return;
      if (!syncScope() || denied || !available()) {
        stop();
        return;
      }
      if (active) return;
      clearTimeout(timer);
      timer = undefined;
      const controller = new AbortController();
      const requestScope = scopeKey;
      active = controller;
      store.setState({ isSyncing: true });
      const current = () =>
        !disposed && active === controller && getNotificationScope()?.key === requestScope;
      try {
        await refreshProfile();
        if (!current()) return;
        const { data } = await getNotificationSummaryAPI(controller.signal);
        if (!current()) return;
        failures = 0;
        store.setState({
          summary: data,
          eligibleEvents: data.eligibleEvents,
          lastSyncedAt: Date.now(),
          error: null
        });
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
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      window.removeEventListener("offline", trigger);
      document.removeEventListener("visibilitychange", trigger);
      stop();
      store.getState().reset(null);
    };
  }, []);
};
