import type {
  NotificationList,
  NotificationSummary,
  NotificationView
} from "@/services/notifications";

export const notification: NotificationView = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  sequence: 42,
  type: "order.created",
  title: "Đơn hàng mới",
  body: "Đơn hàng #42",
  occurredAt: "2026-10-27T00:00:00.000Z",
  deliveredAt: "2026-10-27T00:00:00.000Z",
  readAt: null,
  target: { kind: "order", orderId: "bbbbbbbbbbbbbbbbbbbbbbbb" }
};
export const notificationSummary: NotificationSummary = {
  items: [notification],
  unreadCount: 105,
  head: 42,
  eligibleEvents: ["order.created", "review.created"],
  serverTime: "2026-10-27T00:00:00.000Z"
};
export const notificationList: NotificationList = {
  data: [notification],
  total: 65,
  page: 3,
  pageSize: 20,
  totalPage: 4,
  head: 42,
  eligibleEvents: notificationSummary.eligibleEvents
};
