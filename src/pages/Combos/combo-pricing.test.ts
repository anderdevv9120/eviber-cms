import { describe, expect, it } from "vitest";
import type { ComboProductOption } from "@/services/combos";
import { comboPreview, comboTotals } from "./combo-pricing";

const product = (id: string, prices: number[]): ComboProductOption => ({
  _id: id,
  name: id,
  slug: id,
  status: "PUBLISH",
  image: null,
  variants: prices.map((price, index) => ({
    _id: `${id}-${index}`,
    sku: `${id}-${index}`,
    price,
    originalPrice: price,
    status: index === 2 ? "INACTIVE" : "ACTIVE",
    inventoryCount: 0,
    attributeLabels: []
  }))
});

describe("comboTotals", () => {
  it("floors decimal unit prices before computing totals and discounts", () => {
    const pieces = [{ price: 100.9, quantity: 2 }];
    expect(comboTotals({ mode: "FIXED", value: 201 }, pieces)).toEqual({ normal: 200, combo: 200 });
    expect(comboTotals({ mode: "PERCENT", value: 10 }, pieces)).toEqual({
      normal: 200,
      combo: 180
    });
  });

  it("floors each discounted unit before multiplying quantity", () => {
    expect(
      comboTotals({ mode: "PERCENT", value: 15 }, [
        { price: 159000, quantity: 1 },
        { price: 399000, quantity: 1 }
      ])
    ).toEqual({ normal: 558000, combo: 474300 });
    expect(comboTotals({ mode: "PERCENT", value: 33 }, [{ price: 101, quantity: 3 }])).toEqual({
      normal: 303,
      combo: 201
    });
  });

  it("caps a fixed price by normal total, including zero", () => {
    const pieces = [159000, 399000, 259000].map(price => ({ price, quantity: 1 }));
    expect(comboTotals({ mode: "FIXED", value: 499000 }, pieces)).toEqual({
      normal: 817000,
      combo: 499000
    });
    expect(comboTotals({ mode: "FIXED", value: 999999 }, pieces.slice(0, 2))).toEqual({
      normal: 558000,
      combo: 558000
    });
    expect(comboTotals({ mode: "FIXED", value: 500 }, [{ price: 0, quantity: 2 }])).toEqual({
      normal: 0,
      combo: 0
    });
  });
});

describe("comboPreview", () => {
  it("uses active cheapest/priciest choices regardless of stock, and locked variant", () => {
    const options = [product("p1", [100, 300, 1]), product("p2", [50, 150])];
    expect(
      comboPreview(
        { mode: "FIXED", value: 275 },
        [
          { productId: "p1", quantity: 2, mode: "CHOOSE" },
          { productId: "p2", quantity: 1, mode: "LOCKED", variantId: "p2-1" }
        ],
        options
      )
    ).toEqual({
      cheapest: { normal: 350, combo: 275 },
      priciest: { normal: 750, combo: 275 },
      fixedAboveCheapest: false
    });
  });

  it("warns on fixed price above cheapest and returns null for unresolved pieces", () => {
    expect(
      comboPreview(
        { mode: "FIXED", value: 999 },
        [{ productId: "p1", quantity: 1, mode: "CHOOSE" }],
        [product("p1", [100, 300])]
      ).fixedAboveCheapest
    ).toBe(true);
    expect(
      comboPreview(
        { mode: "PERCENT", value: 10 },
        [{ productId: "p1", quantity: 1, mode: "LOCKED", variantId: "missing" }],
        [product("p1", [100])]
      ).cheapest
    ).toBeNull();
  });
});
