import { describe, expect, it } from "vitest";
import { parseReviewListQuery, serializeReviewListQuery } from "./review-list-query";

const parse = (search: string) => parseReviewListQuery(new URLSearchParams(search));

describe("review list query", () => {
  it("defaults to pending, page 1, 20 per page", () => {
    expect(parse("")).toEqual({ status: "pending", page: 1, pageSize: 20 });
  });

  it("reads valid filters", () => {
    expect(parse("status=approved&page=3&rating=4&search=%20%C3%A1o%20")).toEqual({
      status: "approved",
      page: 3,
      pageSize: 20,
      rating: 4,
      search: "áo"
    });
  });

  it("drops invalid or repeated values", () => {
    expect(parse("status=hidden&page=0&rating=6&search=" + "x".repeat(256))).toEqual({
      status: "pending",
      page: 1,
      pageSize: 20
    });
    expect(parse("status=approved&status=rejected&rating=1.5")).toEqual({
      status: "pending",
      page: 1,
      pageSize: 20
    });
  });

  it("serializes without defaults", () => {
    expect(serializeReviewListQuery({ status: "pending", page: 1, pageSize: 20 }).toString()).toBe(
      ""
    );
    expect(
      serializeReviewListQuery({
        status: "rejected",
        page: 2,
        pageSize: 20,
        rating: 1,
        search: "a b"
      }).toString()
    ).toBe("status=rejected&page=2&rating=1&search=a+b");
  });
});
