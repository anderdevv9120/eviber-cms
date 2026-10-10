import { describe, expect, it } from "vitest";
import type { ProductEditorVariant } from "@/services/products";
import {
  buildGrid,
  clearImage,
  comboKey,
  generateCombinations,
  lockedValueIds,
  suggestSku,
  toVariantPayload,
  type GridRow,
  type OptionSelection
} from "./variant-grid";

const color: OptionSelection = { attributeId: "color", valueIds: ["red", "blue"] };
const size: OptionSelection = { attributeId: "size", valueIds: ["s", "m", "l"] };

const saved = (over: Partial<ProductEditorVariant> = {}): ProductEditorVariant => ({
  _id: "v1",
  sku: "AO-RED-S",
  price: 100,
  originalPrice: 120,
  inventoryCount: 7,
  image: null,
  dimensions: {},
  status: "ACTIVE",
  attributeValues: ["red", "s"],
  ...over
});

describe("comboKey", () => {
  it("ignores value order", () => {
    expect(comboKey(["s", "red"])).toBe(comboKey(["red", "s"]));
    expect(comboKey(["red", "m"])).not.toBe(comboKey(["red", "s"]));
  });
});

describe("generateCombinations", () => {
  it("builds the cartesian product in option order", () => {
    expect(generateCombinations([color, size])).toEqual([
      ["red", "s"],
      ["red", "m"],
      ["red", "l"],
      ["blue", "s"],
      ["blue", "m"],
      ["blue", "l"]
    ]);
  });

  it("yields one empty combination when the product has no options", () => {
    expect(generateCombinations([])).toEqual([[]]);
  });
});

describe("buildGrid", () => {
  it("creates one included draft row per combination", () => {
    const rows = buildGrid([color, size], [], []);
    expect(rows.map(r => r.attributeValues)).toEqual(generateCombinations([color, size]));
    expect(rows[0]).toEqual({
      key: comboKey(["red", "s"]),
      attributeValues: ["red", "s"],
      saved: null,
      include: true,
      sku: "",
      price: null,
      originalPrice: null,
      inventoryCount: null,
      image: null,
      dimensions: {},
      status: "ACTIVE"
    });
  });

  it("gives a product without options exactly one row with an empty combination", () => {
    const rows = buildGrid([], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].attributeValues).toEqual([]);
  });

  it("fills saved rows from the saved variant, matched regardless of value order", () => {
    const variant = saved({ attributeValues: ["s", "red"] });
    const rows = buildGrid([color, size], [variant], []);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      key: comboKey(["red", "s"]),
      attributeValues: ["s", "red"],
      saved: variant,
      include: true,
      sku: "AO-RED-S",
      price: 100,
      originalPrice: 120,
      inventoryCount: 7,
      status: "ACTIVE"
    });
  });

  it("keeps a saved variant whose combination is no longer generated", () => {
    const orphan = saved({ _id: "v9", attributeValues: ["green", "s"] });
    const rows = buildGrid([color, size], [orphan], []);
    expect(rows).toHaveLength(7);
    expect(rows[6].saved).toBe(orphan);
  });

  it("keeps draft input by combination and drops drafts of removed combinations", () => {
    const first = buildGrid([{ ...color, valueIds: ["red", "blue"] }], [], []);
    const edited = first.map(r =>
      r.attributeValues[0] === "blue" ? { ...r, sku: "B", price: 5, include: false } : r
    );
    const next = buildGrid([{ ...color, valueIds: ["blue", "green"] }], [], edited);
    expect(next.map(r => [r.attributeValues, r.sku, r.price, r.include])).toEqual([
      [["blue"], "B", 5, false],
      [["green"], "", null, true]
    ]);
  });

  it("keeps unsaved edits on saved rows", () => {
    const variant = saved();
    const first = buildGrid([color, size], [variant], []);
    const edited = first.map(r => (r.saved ? { ...r, price: 90, status: "INACTIVE" as const } : r));
    const next = buildGrid(
      [color, { ...size, valueIds: ["s", "m", "l", "xl"] }],
      [variant],
      edited
    );
    expect(next[0]).toMatchObject({ saved: variant, price: 90, status: "INACTIVE" });
  });
});

describe("lockedValueIds", () => {
  it("collects every value used by a saved variant", () => {
    const locked = lockedValueIds([saved(), saved({ _id: "v2", attributeValues: ["blue", "m"] })]);
    expect([...locked].sort()).toEqual(["blue", "m", "red", "s"]);
  });
});

describe("suggestSku", () => {
  it("uppercases the slug and slugified labels", () => {
    expect(suggestSku("ao-thun", ["Đỏ", "XL"])).toBe("AO-THUN-DO-XL");
  });

  it("collapses spaces and symbols and skips empty labels", () => {
    expect(suggestSku("ao", ["Xanh  lá cây", "!!!", "2 / 3"])).toBe("AO-XANH-LA-CAY-2-3");
  });

  it("is just the slug for a product without options", () => {
    expect(suggestSku("vi-da", [])).toBe("VI-DA");
  });
});

describe("toVariantPayload", () => {
  const draft = (over: Partial<GridRow>): GridRow => ({
    ...buildGrid([color], [], [])[0],
    sku: "AO-RED",
    price: 100,
    originalPrice: 150,
    inventoryCount: 3,
    ...over
  });

  it("sends saved rows by id without stock and new rows only when included", () => {
    const variant = saved();
    const savedRow = { ...buildGrid([color, size], [variant], [])[0], price: 95 };
    const included = draft({ key: "a", attributeValues: ["blue"], image: "/images/a.jpg" });
    const excluded = draft({ key: "b", attributeValues: ["green"], include: false });
    expect(toVariantPayload([savedRow, included, excluded])).toEqual([
      {
        _id: "v1",
        sku: "AO-RED-S",
        price: 95,
        originalPrice: 120,
        image: null,
        dimensions: {},
        status: "ACTIVE",
        attributeValues: ["red", "s"]
      },
      {
        sku: "AO-RED",
        price: 100,
        originalPrice: 150,
        image: "/images/a.jpg",
        dimensions: {},
        status: "ACTIVE",
        attributeValues: ["blue"],
        inventoryCount: 3
      }
    ]);
  });

  it("refuses to send an included row with a missing number instead of guessing", () => {
    expect(() => toVariantPayload([draft({ price: null })])).toThrow("AO-RED");
    expect(() => toVariantPayload([draft({ inventoryCount: null })])).toThrow("inventoryCount");
    expect(toVariantPayload([draft({ price: null, include: false })])).toEqual([]);
  });
});

describe("clearImage", () => {
  it("clears only rows pointing at the removed image and leaves the input untouched", () => {
    const rows = [
      { ...buildGrid([color], [], [])[0], image: "/images/a.jpg" },
      { ...buildGrid([color], [], [])[1], image: "/images/b.jpg" }
    ];
    const next = clearImage(rows, "/images/a.jpg");
    expect(next.map(r => r.image)).toEqual([null, "/images/b.jpg"]);
    expect(rows[0].image).toBe("/images/a.jpg");
    expect(next[1]).toBe(rows[1]);
  });
});
