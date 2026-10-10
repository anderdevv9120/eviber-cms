import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/request";
import { mapProductError, PRODUCT_ERROR } from "./product-errors";

const sent = [
  { key: "a", sku: "AO-1" },
  { key: "b", sku: "AO-2" }
];
const bad = (code: string, details: Record<string, unknown> = {}) =>
  new ApiError("Lỗi máy chủ", 400, { code, ...details });

describe("mapProductError", () => {
  it("marks any 409 as stale", () => {
    expect(
      mapProductError(new ApiError("Stale", 409, { code: PRODUCT_ERROR.STALE_REVISION }))
    ).toMatchObject({ stale: true, message: "Stale" });
    expect(
      mapProductError(new ApiError("Archived", 409, { code: PRODUCT_ERROR.ARCHIVED })).stale
    ).toBe(true);
  });

  it("maps slug, category and description codes to their fields", () => {
    expect(mapProductError(bad(PRODUCT_ERROR.SLUG_TAKEN, { field: "slug" })).field).toEqual([
      "slug"
    ]);
    expect(mapProductError(bad(PRODUCT_ERROR.SLUG_INVALID)).field).toEqual(["slug"]);
    expect(mapProductError(bad(PRODUCT_ERROR.CATEGORY_NOT_FOUND)).field).toEqual(["categoryIds"]);
    expect(mapProductError(bad(PRODUCT_ERROR.DESCRIPTION_TOO_LONG)).field).toEqual(["description"]);
  });

  it("finds the SKU cell by normalized SKU", () => {
    expect(mapProductError(bad(PRODUCT_ERROR.SKU_TAKEN, { sku: " ao-2 " }), sent)).toEqual({
      variantKey: "b",
      variantField: "sku",
      message: "Lỗi máy chủ"
    });
    expect(
      mapProductError(bad(PRODUCT_ERROR.SKU_TAKEN, { sku: "OTHER" }), sent).variantKey
    ).toBeUndefined();
  });

  it("marks the repeated row of a duplicate SKU by variantIndex", () => {
    const duplicate = [
      { key: "a", sku: "AO-1" },
      { key: "b", sku: "ao-1" }
    ];
    expect(
      mapProductError(bad(PRODUCT_ERROR.SKU_TAKEN, { sku: "AO-1", variantIndex: 1 }), duplicate)
    ).toMatchObject({ variantKey: "b", variantField: "sku" });
  });

  it("maps variantIndex codes to the sent row and cell", () => {
    expect(
      mapProductError(bad(PRODUCT_ERROR.VARIANT_PRICE_INVALID, { variantIndex: 1 }), sent)
    ).toMatchObject({ variantKey: "b", variantField: "originalPrice" });
    expect(
      mapProductError(bad(PRODUCT_ERROR.VARIANT_IMAGE_INVALID, { variantIndex: 0 }), sent)
    ).toMatchObject({ variantKey: "a", variantField: "image" });
    for (const code of [
      PRODUCT_ERROR.VARIANT_COMBINATION_INVALID,
      PRODUCT_ERROR.VARIANT_DUPLICATE_COMBINATION,
      PRODUCT_ERROR.VARIANT_COMBINATION_LOCKED
    ]) {
      const mapped = mapProductError(bad(code, { variantIndex: 0 }), sent);
      expect(mapped.variantKey).toBe("a");
      expect(mapped.variantField).toBeUndefined();
    }
    expect(
      mapProductError(bad(PRODUCT_ERROR.VARIANT_PRICE_INVALID, { variantIndex: 9 }), sent)
    ).toEqual({ message: "Lỗi máy chủ" });
  });

  it("returns known publish requirements for the checklist", () => {
    expect(
      mapProductError(
        bad(PRODUCT_ERROR.PUBLISH_REQUIREMENTS, { missing: ["IMAGE", "X", "CATEGORY"] })
      )
    ).toEqual({ message: "Lỗi máy chủ", missing: ["IMAGE", "CATEGORY"] });
  });

  it("keeps option and other errors as a plain message", () => {
    for (const code of [
      PRODUCT_ERROR.OPTION_VALUE_INVALID,
      PRODUCT_ERROR.OPTION_VALUE_IN_USE,
      PRODUCT_ERROR.VARIANT_MISSING,
      "sys00001"
    ])
      expect(mapProductError(bad(code))).toEqual({ message: "Lỗi máy chủ" });
    expect(mapProductError(new ApiError("Mất mạng"))).toEqual({ message: "Mất mạng" });
  });
});
