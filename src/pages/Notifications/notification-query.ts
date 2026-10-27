import { PATH } from "@/constants/paths";
import type {
  NotificationEventType,
  NotificationListQuery,
  NotificationTarget
} from "@/services/notifications";

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  "order.created": "Đơn hàng mới",
  "refund.submitted": "Yêu cầu hoàn tiền mới",
  "refund.ready_for_payout": "Hoàn tiền chờ chi trả",
  "inventory.low_stock": "Sắp hết hàng",
  "inventory.out_of_stock": "Hết hàng",
  "review.created": "Đánh giá mới"
};

export function parseNotificationQuery(params: URLSearchParams): NotificationListQuery {
  const one = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const integer = (key: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = one(key);
    return value &&
      /^[1-9]\d*$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) <= max
      ? Number(value)
      : fallback;
  };
  const event = one("event");
  return {
    status: one("status") === "unread" ? "unread" : "all",
    ...(event && Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENT_LABELS, event)
      ? { event: event as NotificationEventType }
      : {}),
    page: integer("page", 1),
    pageSize: integer("pageSize", 20, 100)
  };
}

export function serializeNotificationQuery(query: NotificationListQuery): URLSearchParams {
  const raw = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) raw.set(key, String(value));
  const normalized = parseNotificationQuery(raw);
  const params = new URLSearchParams();
  if (normalized.status === "unread") params.set("status", "unread");
  if (normalized.event) params.set("event", normalized.event);
  if (normalized.page !== 1) params.set("page", String(normalized.page));
  if (normalized.pageSize !== 20) params.set("pageSize", String(normalized.pageSize));
  return params;
}

export function safeNotificationReturnTo(value: string | null): string | null {
  if (!value || value.includes("#")) return null;
  const [path, search = "", extra] = value.split("?");
  if (path !== PATH.NOTIFICATIONS || extra !== undefined) return null;
  const params = new URLSearchParams(search);
  const query = parseNotificationQuery(params);
  for (const [key, raw] of params) {
    if (
      params.getAll(key).length !== 1 ||
      !["status", "event", "page", "pageSize"].includes(key) ||
      String(query[key as keyof NotificationListQuery]) !== raw
    )
      return null;
  }
  const normalized = serializeNotificationQuery(query).toString();
  return path + (normalized ? `?${normalized}` : "");
}

export function notificationHref(target: NotificationTarget, returnTo?: string): string {
  const id = (value: string) => /^[a-f\d]{24}$/i.test(value);
  if (
    target.kind === "order" &&
    id(target.orderId) &&
    (target.requestId === undefined || id(target.requestId))
  ) {
    const history = safeNotificationReturnTo(returnTo ?? null) ?? PATH.NOTIFICATIONS;
    const params = new URLSearchParams();
    if (target.requestId) params.set("requestId", target.requestId);
    params.set("returnTo", history);
    return `${PATH.ORDER}/${target.orderId}?${params}${target.requestId ? "#refunds" : ""}`;
  }
  if (target.kind === "inventory" && id(target.variantId))
    return `${PATH.INVENTORY}?${new URLSearchParams({ variantId: target.variantId })}`;
  if (target.kind === "review" && id(target.reviewId))
    return `${PATH.REVIEWS}?${new URLSearchParams({ reviewId: target.reviewId })}`;
  return PATH.NOTIFICATIONS;
}
