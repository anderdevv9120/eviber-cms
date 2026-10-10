import { describe, expect, it } from "vitest";
import {
  parseProductListQuery,
  serializeProductListQuery,
  toProductListApiQuery
} from "./product-list-query";

const categoryId = "000000000000000000000002";

describe("product list URLs", () => {
  it("defaults invalid or repeated params", () => {
    expect(
      parseProductListQuery(
        new URLSearchParams("status=ACTIVE&categoryId=nope&page=-1&q=a&q=b&extra=x")
      )
    ).toEqual({ q: "", status: "ACTIVE_SET", page: 1 });
    for (const page of ["0", "1.5", "Infinity", "9007199254740992"])
      expect(parseProductListQuery(new URLSearchParams({ page })).page).toBe(1);
    expect(parseProductListQuery(new URLSearchParams({ q: "x".repeat(101) })).q).toBe("");
    expect(parseProductListQuery(new URLSearchParams("q=%FF")).q).toBe("");
    expect(parseProductListQuery(new URLSearchParams("status=ACTIVE_SET")).status).toBe(
      "ACTIVE_SET"
    );
  });

  it("round-trips valid filters and keeps the default status out of the URL", () => {
    for (const status of ["PUBLISH", "UNPUBLISH", "DRAFT", "DELETED"])
      expect(parseProductListQuery(new URLSearchParams({ status })).status).toBe(status);
    const params = new URLSearchParams(`q=+ao+&status=DELETED&categoryId=${categoryId}&page=3`);
    const query = parseProductListQuery(params);
    expect(query).toEqual({ q: "ao", status: "DELETED", categoryId, page: 3 });
    expect(serializeProductListQuery(query).toString()).toBe(
      `q=ao&status=DELETED&categoryId=${categoryId}&page=3`
    );
    expect(serializeProductListQuery({ q: "", status: "ACTIVE_SET", page: 1 }).toString()).toBe("");
  });

  it("maps the default status to an omitted API filter", () => {
    expect(toProductListApiQuery({ q: "", status: "ACTIVE_SET", page: 2 })).toEqual({
      page: 2,
      pageSize: 20
    });
    expect(toProductListApiQuery({ q: "ao", status: "DRAFT", categoryId, page: 1 })).toEqual({
      q: "ao",
      status: "DRAFT",
      categoryId,
      page: 1,
      pageSize: 20
    });
  });
});
