import { describe, expect, it } from "vitest";
import { groupOrderLines } from "./order-lines";

const piece = {
  productId: "shirt",
  variantId: "shirt-s",
  productNameAtOrder: "Áo lúc mua",
  variantSkuAtOrder: "SHIRT-S",
  attributeValuesAtOrder: [{ name: "Size", value: "S" }],
  quantity: 1,
  priceAtOrder: 123018,
  originalPriceAtOrder: 159000,
  comboGroupId: "group-a"
};
const combo = {
  comboGroupId: "group-a",
  comboId: "combo-id",
  nameAtOrder: "Combo lúc mua",
  quantity: 1,
  pricingModeAtOrder: "FIXED" as const,
  pricingValueAtOrder: 400000,
  totalAtOrder: 400000
};
const bag = {
  ...piece,
  productId: "bag",
  variantId: "bag-black",
  productNameAtOrder: "Túi lúc mua",
  priceAtOrder: 153965,
  originalPriceAtOrder: 199000
};

describe("groupOrderLines", () => {
  it("merges split pieces by variant with exact sums and no misleading unit price", () => {
    const lines = [piece, bag, { ...piece, priceAtOrder: 123017 }];
    const before = structuredClone(lines);
    const rows = groupOrderLines(lines, [combo]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "group-a",
      name: "Combo lúc mua",
      quantity: 1,
      lineTotal: 400000
    });
    expect(rows[0].children).toMatchObject([
      { variantId: "shirt-s", quantity: 2, lineTotal: 246035, unitPrice: null },
      { variantId: "bag-black", quantity: 1, lineTotal: 153965, unitPrice: 153965 }
    ]);
    expect(lines).toEqual(before);
  });

  it("keeps a shared unit price when equal-price lines merge", () => {
    const rows = groupOrderLines([piece, { ...piece, quantity: 2 }], [combo]);
    expect(rows[0].children?.[0]).toMatchObject({
      quantity: 3,
      unitPrice: 123018,
      lineTotal: 369054
    });
  });

  it("keeps the unit price null after further split lines", () => {
    const rows = groupOrderLines([piece, { ...piece, priceAtOrder: 123017 }, piece], [combo]);
    expect(rows[0].children?.[0]).toMatchObject({
      quantity: 3,
      unitPrice: null,
      lineTotal: 369053
    });
  });

  it("places combos at their first piece and keeps plain lines and separate groups in order", () => {
    const plain = { ...piece, comboGroupId: undefined, productNameAtOrder: "Mua lẻ" };
    const rows = groupOrderLines(
      [plain, piece, plain, { ...bag, comboGroupId: "group-b" }, bag, piece],
      [{ ...combo, comboGroupId: "group-b", nameAtOrder: "Combo B" }, combo]
    );
    expect(rows.map(row => row.name)).toEqual(["Mua lẻ", "Combo lúc mua", "Mua lẻ", "Combo B"]);
    expect(rows[1].children?.map(row => row.variantId)).toEqual(["shirt-s", "bag-black"]);
    expect(rows[1].children?.[0].quantity).toBe(2);
    expect(rows[3].children?.[0].quantity).toBe(1);
    const keys = rows.flatMap(row => [row.key, ...(row.children?.map(child => child.key) ?? [])]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([undefined, []])("keeps legacy or missing-header lines flat with combos %s", combos => {
    const rows = groupOrderLines([piece, { ...piece, priceAtOrder: 123017 }], combos);
    expect(rows.map(row => [row.name, row.quantity, row.unitPrice, row.lineTotal])).toEqual([
      ["Áo lúc mua", 1, 123018, 123018],
      ["Áo lúc mua", 1, 123017, 123017]
    ]);
    expect(rows.every(row => row.children === undefined)).toBe(true);
  });

  it("keeps an unmatched group as a plain row and omits headers without pieces", () => {
    const rows = groupOrderLines([{ ...piece, comboGroupId: "missing" }], [combo]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Áo lúc mua", lineTotal: 123018 });
    expect(rows[0].children).toBeUndefined();
  });
});
