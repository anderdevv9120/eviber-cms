import { describe, expect, it } from "vitest";
import {
  parseCustomerListQuery,
  serializeCustomerListQuery,
  safeCustomerReturnTo
} from "./customer-list-query";

describe("customer list URLs", () => {
  it("defaults invalid/repeated fields and omits unknown keys", () => {
    expect(
      parseCustomerListQuery(
        new URLSearchParams("tab=unknown&page=-1&pageSize=100&status=ACTIVE&extra=x")
      )
    ).toEqual({ tab: "registered", page: 1, pageSize: 10 });
    expect(
      parseCustomerListQuery(
        new URLSearchParams(
          "tab=guests&tab=registered&page=2&page=3&search=a&search=b&status=VERIFIED&status=DELETED"
        )
      )
    ).toEqual({ tab: "registered", page: 1, pageSize: 10 });
    for (const page of ["0", "-2", "1.5", "Infinity", "9007199254740992"])
      expect(parseCustomerListQuery(new URLSearchParams({ page })).page).toBe(1);
    for (const pageSize of ["10", "20", "50"])
      expect(parseCustomerListQuery(new URLSearchParams({ pageSize })).pageSize).toBe(
        Number(pageSize)
      );
    expect(
      parseCustomerListQuery(new URLSearchParams({ search: "x".repeat(256) })).search
    ).toBeUndefined();
    expect(parseCustomerListQuery(new URLSearchParams("search=%FF")).search).toBeUndefined();
  });
  it("keeps valid bounded filters and clears status for guests", () => {
    for (const status of ["VERIFIED", "UNVERIFIED", "DELETED"])
      expect(parseCustomerListQuery(new URLSearchParams({ status })).status).toBe(status);
    const query = parseCustomerListQuery(
      new URLSearchParams("page=3&pageSize=20&search=+An+&status=VERIFIED")
    );
    expect(serializeCustomerListQuery(query).toString()).toBe(
      "page=3&pageSize=20&search=An&status=VERIFIED"
    );
    expect(serializeCustomerListQuery({ ...query, tab: "guests" }).toString()).toBe(
      "tab=guests&page=3&pageSize=20&search=An"
    );
    expect(
      serializeCustomerListQuery({ tab: "registered", page: 1, pageSize: 10 }).toString()
    ).toBe("");
  });
  it("allows only normalized customer list return URLs", () => {
    for (const value of [
      null,
      "https://evil.test",
      "//evil.test",
      "/orders",
      "/customers/add",
      "/customers#x"
    ])
      expect(safeCustomerReturnTo(value)).toBe("/customers");
    expect(safeCustomerReturnTo("/customers?tab=guests&status=VERIFIED&page=2&extra=x")).toBe(
      "/customers?tab=guests&page=2"
    );
  });
});
