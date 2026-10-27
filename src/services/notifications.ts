import axiosRequest from "@/utils/request";
import { ADMIN_API_URL } from "@/constants/env";
import { useAppStore } from "@/store/useAppStore";
import { getSessionId } from "@/utils/session";
import type { ApiResponse } from "./auth";

export type NotificationEventType =
  | "order.created"
  | "refund.submitted"
  | "refund.ready_for_payout"
  | "inventory.low_stock"
  | "inventory.out_of_stock"
  | "review.created";
export type NotificationChannel = "inApp" | "desktop";
export type NotificationPolicy = "disabled" | "optional" | "required";
export type ChannelPolicy = { policy: NotificationPolicy; defaultEnabled: boolean };
export type NotificationTarget =
  | { kind: "order"; orderId: string; requestId?: string }
  | { kind: "inventory"; variantId: string; productId: string; sku: string }
  | { kind: "review"; reviewId: string; productId: string };
export interface NotificationView {
  id: string;
  sequence: number;
  type: NotificationEventType;
  title: string;
  body: string;
  occurredAt: string;
  deliveredAt: string;
  readAt: string | null;
  target: NotificationTarget;
}
export interface NotificationSummary {
  items: NotificationView[];
  unreadCount: number;
  head: number;
  eligibleEvents: NotificationEventType[];
  serverTime: string;
}
export interface NotificationList {
  data: NotificationView[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  head: number;
  eligibleEvents: NotificationEventType[];
}
export interface DesktopFeedPage {
  items: NotificationView[];
  cursor: number;
  through: number;
  hasMore: boolean;
  serverTime: string;
  eligibleEvents: NotificationEventType[];
}
export interface NotificationListQuery {
  status?: "all" | "unread";
  event?: NotificationEventType;
  page?: number;
  pageSize?: number;
}
export interface DesktopFeedQuery {
  after?: number;
  through?: number;
  limit?: number;
}
export type ChannelPreferenceView = ChannelPolicy & {
  override: boolean | null;
  enabled: boolean;
  editable: boolean;
};
export interface NotificationPreferencesView {
  revision: number;
  storeRevision: number;
  allowPersonalPreferences: boolean;
  events: Array<{
    type: NotificationEventType;
    inApp: ChannelPreferenceView;
    desktop: ChannelPreferenceView;
  }>;
}
export interface StoreNotificationSettings {
  revision: number;
  allowPersonalPreferences: boolean;
  lowStockThreshold: number;
  events: Record<NotificationEventType, Record<NotificationChannel, ChannelPolicy>>;
}
export interface NotificationPreferenceUpdate {
  expectedRevision: number;
  expectedStoreRevision: number;
  changes: Array<{
    type: NotificationEventType;
    channel: NotificationChannel;
    enabled: boolean | null;
  }>;
}
export interface NotificationSettingsUpdate {
  expectedRevision: number;
  allowPersonalPreferences: boolean;
  lowStockThreshold: number;
  events: Array<{ type: NotificationEventType; inApp: ChannelPolicy; desktop: ChannelPolicy }>;
}
export type ReadResult = { changed: number };

export const getNotificationScope = (): {
  key: string;
  sessionId: string;
  sessionRevision: number;
  userId: string;
} | null => {
  const { profile, sessionRevision } = useAppStore.getState();
  const sessionId = getSessionId();
  if (!profile?.access.role || !sessionId) return null;
  const userId = profile._id;
  const api = ADMIN_API_URL.replace(/\/+$/, "");
  return {
    key: JSON.stringify([api, userId, sessionId, sessionRevision]),
    sessionId,
    sessionRevision,
    userId
  };
};

export const getNotificationSummaryAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<NotificationSummary>> =>
  axiosRequest.get("/notifications/summary", { signal, toastError: false });

export const listNotificationsAPI = (
  query: NotificationListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<NotificationList>> =>
  axiosRequest.get("/notifications", { params: query, signal, toastError: false });

export const getDesktopFeedAPI = (
  query: DesktopFeedQuery,
  signal?: AbortSignal
): Promise<ApiResponse<DesktopFeedPage>> =>
  axiosRequest.get("/notifications/desktop-feed", { params: query, signal, toastError: false });

export const markNotificationsReadAPI = (ids: string[]): Promise<ApiResponse<ReadResult>> =>
  axiosRequest.post("/notifications/read", { ids }, { toastError: false });

export const markAllNotificationsReadAPI = (through: number): Promise<ApiResponse<ReadResult>> =>
  axiosRequest.post("/notifications/read-all", { through }, { toastError: false });

export const getNotificationPreferencesAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<NotificationPreferencesView>> =>
  axiosRequest.get("/notifications/preferences", { signal, toastError: false });

export const updateNotificationPreferencesAPI = (
  body: NotificationPreferenceUpdate
): Promise<ApiResponse<NotificationPreferencesView>> =>
  axiosRequest.patch("/notifications/preferences", body, { toastError: false });

export const getNotificationSettingsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<StoreNotificationSettings>> =>
  axiosRequest.get("/notification-settings", { signal, toastError: false });

export const updateNotificationSettingsAPI = (
  body: NotificationSettingsUpdate
): Promise<ApiResponse<StoreNotificationSettings>> =>
  axiosRequest.put("/notification-settings", body, { toastError: false });
