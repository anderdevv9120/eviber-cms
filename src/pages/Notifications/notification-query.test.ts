import { describe, expect, it } from "vitest";
import {
  notificationHref,
  parseNotificationQuery,
  serializeNotificationQuery
} from "./notification-query";

describe("notification URLs", () => {
  it("keeps valid history filters and bounds page sizes", () => {
    expect(
      parseNotificationQuery(
        new URLSearchParams("status=unread&event=refund.submitted&page=3&pageSize=50")
      )
    ).toEqual({ status: "unread", event: "refund.submitted", page: 3, pageSize: 50 });
    expect(
      serializeNotificationQuery({
        status: "unread",
        event: "order.created",
        page: 3,
        pageSize: 20
      }).toString()
    ).toBe("status=unread&event=order.created&page=3");
  });
  it.each([
    "page=-1",
    "page=1e2",
    "page=9007199254740992",
    "page=2&page=3",
    "page=01",
    "pageSize=101",
    "pageSize=2&pageSize=3",
    "status=evil",
    "status=all&status=unread",
    "event=unknown",
    "event=order.created&event=review.created"
  ])("normalizes malformed or repeated values: %s", value => {
    expect(parseNotificationQuery(new URLSearchParams(value))).toEqual({
      status: "all",
      page: 1,
      pageSize: 20
    });
  });
  it("builds only typed local targets and sanitizes the history return path", () => {
    const orderId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const requestId = "cccccccccccccccccccccccc";
    expect(
      notificationHref({ kind: "order", orderId, requestId }, "/notifications?status=unread&page=3")
    ).toBe(
      `/orders/${orderId}?requestId=${requestId}&returnTo=%2Fnotifications%3Fstatus%3Dunread%26page%3D3#refunds`
    );
    expect(notificationHref({ kind: "order", orderId }, "https://evil.test")).toBe(
      `/orders/${orderId}?returnTo=%2Fnotifications`
    );
    expect(
      notificationHref({ kind: "inventory", variantId: orderId, productId: requestId, sku: "evil" })
    ).toBe(`/inventory?variantId=${orderId}`);
    expect(notificationHref({ kind: "review", reviewId: orderId, productId: requestId })).toBe(
      `/reviews?reviewId=${orderId}`
    );
    expect(notificationHref({ kind: "order", orderId: "//evil.test" })).toBe("/notifications");
  });
});
