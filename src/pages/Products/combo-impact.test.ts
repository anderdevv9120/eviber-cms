import { describe, expect, it } from "vitest";
import { buildGrid, type SavedVariant } from "./variant-grid";
import { impactOf } from "./combo-impact";

const saved: SavedVariant = {
  _id: "v1",
  sku: "SKU",
  price: 100000,
  originalPrice: 120000,
  inventoryCount: 7,
  image: null,
  dimensions: {},
  status: "ACTIVE",
  attributeValues: []
};
const grid = () => buildGrid([], [saved], []);

describe("impactOf", () => {
  it("detects a changed selling price", () => {
    expect(
      impactOf(
        [saved],
        grid().map(row => ({ ...row, price: 90000 }))
      )
    ).toEqual({
      priceChanged: true,
      deactivated: false
    });
  });

  it("detects ACTIVE to INACTIVE", () => {
    expect(
      impactOf(
        [saved],
        grid().map(row => ({ ...row, status: "INACTIVE" as const }))
      )
    ).toEqual({
      priceChanged: false,
      deactivated: true
    });
  });

  it("ignores new variants", () => {
    const rows = [
      ...grid(),
      { ...grid()[0], saved: null, key: "new", price: 90000, status: "INACTIVE" as const }
    ];
    expect(impactOf([saved], rows)).toEqual({ priceChanged: false, deactivated: false });
  });

  it("does not warn on stock-only edits", () => {
    expect(
      impactOf(
        [saved],
        grid().map(row => ({ ...row, inventoryCount: 2 }))
      )
    ).toEqual({
      priceChanged: false,
      deactivated: false
    });
  });
});
