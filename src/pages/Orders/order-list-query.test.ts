import { describe, expect, it } from "vitest";
import {
  parseOrderListQuery,
  serializeOrderListQuery,
  safeOrderReturnTo
} from "./order-list-query";
import {
  orderStatusLabels,
  paymentStatusLabels,
  paymentActionLabels,
  paymentMethodLabels,
  formatOrderAmount,
  formatOrderDate,
  displayOrderText,
  missingOrderData
} from "./order-display";

describe("order list URLs", () => {
  it("serializes submitted search and combined filters, with page reset", () => {
    const params = serializeOrderListQuery({
      page: 1,
      pageSize: 20,
      search: "  An & Bình  ",
      status: "cancelled",
      paymentStatus: "paid"
    });
    expect(params.toString()).toBe(
      "pageSize=20&search=An+%26+B%C3%ACnh&status=cancelled&paymentStatus=paid"
    );
    expect(parseOrderListQuery(params)).toEqual({
      page: 1,
      pageSize: 20,
      search: "An & Bình",
      status: "cancelled",
      paymentStatus: "paid"
    });
    expect(serializeOrderListQuery({ page: 1, pageSize: 10, search: " " }).toString()).toBe("");
  });
  it.each([10, 20, 50])("accepts page size %s", pageSize => {
    expect(parseOrderListQuery(new URLSearchParams(`page=3&pageSize=${pageSize}`))).toEqual({
      page: 3,
      pageSize
    });
  });
  it.each(["-1", "0", "1.5", "NaN", "Infinity", "9007199254740992", "2abc", "1e2", "%FF"])(
    "defaults invalid page %s",
    page => {
      expect(parseOrderListQuery(new URLSearchParams(`page=${page}`))).toEqual({
        page: 1,
        pageSize: 10
      });
    }
  );
  it("drops unknown enums, unsupported sizes, unknown keys and malformed search encoding", () => {
    expect(
      parseOrderListQuery(
        new URLSearchParams(
          "pageSize=30&status=unknown&paymentStatus=unknown&search=%E0%A4&sortBy=email&evil=1"
        )
      )
    ).toEqual({ page: 1, pageSize: 10 });
  });
  it("invalidates only repeated keys", () => {
    expect(
      parseOrderListQuery(
        new URLSearchParams(
          "page=2&page=3&pageSize=20&pageSize=50&search=a&search=b&status=paid&status=pending&paymentStatus=paid"
        )
      )
    ).toEqual({ page: 1, pageSize: 10, paymentStatus: "paid" });
  });
  it("normalizes unsupported programmatic values before serialization", () => {
    expect(
      serializeOrderListQuery({
        page: -2,
        pageSize: 30,
        status: "unknown",
        paymentStatus: "unknown"
      } as never).toString()
    ).toBe("");
  });
  it("retains a legitimate literal percent search", () => {
    expect(parseOrderListQuery(new URLSearchParams("search=100%25"))).toEqual({
      page: 1,
      pageSize: 10,
      search: "100%"
    });
  });
  it("keeps a valid attention queue alongside other filters and drops unknown or repeated ones", () => {
    const params = serializeOrderListQuery({
      page: 2,
      pageSize: 10,
      status: "pending",
      attention: "awaiting-transfer"
    });
    expect(params.toString()).toBe("page=2&status=pending&attention=awaiting-transfer");
    expect(parseOrderListQuery(params)).toEqual({
      page: 2,
      pageSize: 10,
      status: "pending",
      attention: "awaiting-transfer"
    });
    expect(parseOrderListQuery(new URLSearchParams("attention=refund-needed"))).toEqual({
      page: 1,
      pageSize: 10,
      attention: "refund-needed"
    });
    for (const search of [
      "attention=unknown",
      "attention=Refund-Needed",
      "attention=refund-needed&attention=refund-needed"
    ])
      expect(parseOrderListQuery(new URLSearchParams(search))).toEqual({ page: 1, pageSize: 10 });
  });
  it.each([
    null,
    "https://evil.test/payments",
    "//evil.test/orders",
    "/orders/id",
    "/products",
    "\\\\evil.test",
    "/payments#evil",
    "/payments/../orders",
    " /payments",
    "/%70ayments"
  ])("rejects unsafe or unrelated return destination %s", value => {
    expect(safeOrderReturnTo(value)).toBe("/orders");
  });
  it("preserves Payments context and cleans invalid queries", () => {
    expect(
      safeOrderReturnTo(
        "/payments?page=3&pageSize=50&search=An+%26+B%C3%ACnh&status=cancelled&paymentStatus=paid"
      )
    ).toBe(
      "/payments?page=3&pageSize=50&search=An+%26+B%C3%ACnh&status=cancelled&paymentStatus=paid"
    );
    expect(
      safeOrderReturnTo("/payments?page=-1&pageSize=30&status=bad&redirect=https://evil.test")
    ).toBe("/payments");
    expect(safeOrderReturnTo("/orders?page=2&page=3&search=%FF")).toBe("/orders");
    expect(safeOrderReturnTo("/payments?page=2&attention=refund-needed&evil=1")).toBe(
      "/payments?page=2&attention=refund-needed"
    );
    expect(safeOrderReturnTo("/orders?attention=refund-needed&attention=awaiting-transfer")).toBe(
      "/orders"
    );
  });
});

describe("snapshot display", () => {
  it("covers every backend state, action and payment method", () => {
    expect(Object.keys(orderStatusLabels)).toEqual([
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "returned"
    ]);
    expect(Object.keys(paymentStatusLabels)).toEqual(["unpaid", "paid", "refunded", "failed"]);
    expect(Object.keys(paymentActionLabels)).toEqual(["receipt", "refund", "correction"]);
    expect(Object.keys(paymentMethodLabels)).toEqual(["CASH", "CARD", "BANK_TRANSFER", "E_WALLET"]);
  });
  it("uses stored currency, preserves zero and exposes missing legacy data", () => {
    expect(formatOrderAmount(1234.5, "USD")).toBe(
      new Intl.NumberFormat("vi-VN", { style: "currency", currency: "USD" }).format(1234.5)
    );
    expect(formatOrderAmount(0, "VND")).toBe("0 ₫");
    expect(formatOrderAmount(10, undefined)).toBe(missingOrderData);
    expect(formatOrderAmount(undefined, "VND")).toBe(missingOrderData);
    expect(formatOrderAmount(10, "invalid")).toBe(missingOrderData);
    expect(displayOrderText(" ")).toBe(missingOrderData);
    expect(displayOrderText(undefined)).toBe(missingOrderData);
    expect(displayOrderText("Snapshot SKU")).toBe("Snapshot SKU");
    expect(formatOrderDate(undefined)).toBe(missingOrderData);
    expect(formatOrderDate("bad timestamp")).toBe(missingOrderData);
    expect(formatOrderDate("2026-10-04T00:00:00.000Z")).not.toBe(missingOrderData);
  });
});
