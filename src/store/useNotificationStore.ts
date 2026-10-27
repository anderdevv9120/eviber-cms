import { create } from "zustand";
import type { NotificationEventType, NotificationSummary } from "@/services/notifications";

interface NotificationState {
  scopeKey: string | null;
  summary: NotificationSummary | null;
  eligibleEvents: NotificationEventType[];
  isSyncing: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  refreshRevision: number;
  refreshNotifications: () => void;
  reset: (scopeKey: string | null) => void;
}

export const useNotificationStore = create<NotificationState>()(set => ({
  scopeKey: null,
  summary: null,
  eligibleEvents: [],
  isSyncing: false,
  error: null,
  lastSyncedAt: null,
  refreshRevision: 0,
  refreshNotifications: () => set(state => ({ refreshRevision: state.refreshRevision + 1 })),
  reset: scopeKey =>
    set({
      scopeKey,
      summary: null,
      eligibleEvents: [],
      isSyncing: false,
      error: null,
      lastSyncedAt: null
    })
}));
