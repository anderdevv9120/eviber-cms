import { describe, expect, it } from "vitest";
import {
  parseVoucherQuery,
  serializeVoucherQuery,
  voucherInstant,
  voucherLocalDate
} from "./voucher-query";

describe("voucher URL and shop instants", () => {
  it("normalizes committed filters and ignores unknown or repeated fields", () => {
    expect(
      parseVoucherQuery(
        new URLSearchParams("page=2&pageSize=20&search=+SAVE+&availability=active&mongo=x")
      )
    ).toEqual({ page: 2, pageSize: 20, search: "SAVE", availability: "active" });
    expect(
      serializeVoucherQuery({
        page: 2,
        pageSize: 20,
        search: "a+b",
        availability: "expired"
      }).toString()
    ).toBe("page=2&pageSize=20&search=a%2Bb&availability=expired");
    expect(
      parseVoucherQuery(
        new URLSearchParams("page=2&page=3&pageSize=101&availability=unknown&search=%FF")
      )
    ).toEqual({ page: 1, pageSize: 10 });
    expect(parseVoucherQuery(new URLSearchParams("page=9007199254740991&pageSize=100"))).toEqual({
      page: 1,
      pageSize: 100
    });
    expect(serializeVoucherQuery({ page: 1, pageSize: 10 }).toString()).toBe("");
  });
  it("edits voucher dates in the shop timezone, not the browser timezone", () => {
    expect(voucherInstant("2026-10-09T00:00")).toBe("2026-10-08T17:00:00.000Z");
    expect(voucherLocalDate("2026-10-08T17:00:00.000Z")).toBe("2026-10-09T00:00");
    expect(voucherInstant("2026-10-09T00:00:01.123")).toBe("2026-10-08T17:00:01.123Z");
    expect(voucherLocalDate("2026-10-08T17:00:01.123Z")).toBe("2026-10-09T00:00:01.123");
  });
  it.each([
    "",
    "2026-02-30T00:00",
    "2026-10-09T24:00",
    "2026-13-01T00:00",
    "2026-10-09",
    "2026-10-09T00:00Z"
  ])("rejects impossible/nonlocal date %s", value => {
    expect(() => voucherInstant(value)).toThrow();
  });
});
