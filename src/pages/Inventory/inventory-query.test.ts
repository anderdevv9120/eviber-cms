import { describe, expect, it } from "vitest";
import { parseInventoryQuery, toInventoryApiQuery, toInventorySearch } from "./inventory-query";

const parse = (search: string) => parseInventoryQuery(new URLSearchParams(search));
const productId = "000000000000000000000001";

describe("inventory URL query", () => {
  it("retains exact variant targets in bookmarks and API queries", () => {
    const { query, errors } = parse(`variantId=${productId}`);
    expect(errors).toEqual([]);
    expect(toInventorySearch(query).toString()).toBe(`variantId=${productId}`);
    expect(toInventoryApiQuery(query)).toEqual({ variantId: productId, page: 1, pageSize: 10 });
  });

  it.each(["variantId=bad", `variantId=${productId}&variantId=${productId}`])(
    "blocks invalid exact target %s",
    search => expect(parse(search).errors).toHaveLength(1)
  );
  it("uses defaults for an empty URL and serializes them to an empty search", () => {
    const { query, errors } = parse("");
    expect(errors).toEqual([]);
    expect(query).toEqual({
      search: "",
      stock: "all",
      lowStockThreshold: 5,
      page: 1,
      pageSize: 10
    });
    expect(toInventorySearch(query).toString()).toBe("");
    expect(toInventoryApiQuery(query)).toEqual({ page: 1, pageSize: 10 });
  });

  it("round-trips every filter", () => {
    const search = `search=%C3%A1o&productId=${productId}&productStatus=DRAFT&variantStatus=INACTIVE&stock=low&lowStockThreshold=20&page=3&pageSize=50`;
    const { query, errors } = parse(search);
    expect(errors).toEqual([]);
    expect(query).toEqual({
      search: "áo",
      productId,
      productStatus: "DRAFT",
      variantStatus: "INACTIVE",
      stock: "low",
      lowStockThreshold: 20,
      page: 3,
      pageSize: 50
    });
    expect(toInventorySearch(query).toString()).toBe(search);
    expect(toInventoryApiQuery(query)).toEqual({
      search: "áo",
      productId,
      productStatus: "DRAFT",
      variantStatus: "INACTIVE",
      stock: "low",
      lowStockThreshold: 20,
      page: 3,
      pageSize: 50
    });
  });

  it.each([
    ["page=0"],
    ["page=1.5"],
    ["page=9007199254740993"],
    ["pageSize=5"],
    ["pageSize=100"],
    ["lowStockThreshold=0"],
    ["lowStockThreshold=1001"],
    ["lowStockThreshold=05"],
    ["stock=critical"],
    ["productStatus=DELETED"],
    ["variantStatus=active"],
    ["productId=abc"],
    ["page=1&page=2"],
    [`search=${"a".repeat(101)}`]
  ])("reports %s and keeps defaults", search => {
    const { query, errors } = parse(search);
    expect(errors).toHaveLength(1);
    expect(toInventorySearch(query).toString()).toBe("");
  });

  it("drops the threshold unless stock is low", () => {
    const { query } = parse("stock=out&lowStockThreshold=20");
    expect(toInventorySearch(query).toString()).toBe("stock=out");
    expect(toInventoryApiQuery(query)).toEqual({ stock: "out", page: 1, pageSize: 10 });
    expect(toInventorySearch({ ...query, stock: "low" }).toString()).toBe(
      "stock=low&lowStockThreshold=20"
    );
  });
});
