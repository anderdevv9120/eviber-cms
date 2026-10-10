import type {
  ProductDimensions,
  ProductEditorVariant,
  ProductVariantInput,
  ProductVariantStatus,
  ProductWriteInput
} from "@/services/products";

export type SavedVariant = ProductEditorVariant;
export interface OptionSelection {
  attributeId: string;
  valueIds: string[];
}
export interface GridRow {
  key: string;
  attributeValues: string[];
  saved: SavedVariant | null;
  include: boolean;
  sku: string;
  price: number | null;
  originalPrice: number | null;
  inventoryCount: number | null;
  image: string | null;
  dimensions: ProductDimensions;
  status: ProductVariantStatus;
}

export const comboKey = (valueIds: string[]): string => [...valueIds].sort().join("|");

export const generateCombinations = (options: OptionSelection[]): string[][] =>
  options.reduce<string[][]>(
    (combos, option) => combos.flatMap(combo => option.valueIds.map(id => [...combo, id])),
    [[]]
  );

const draftRow = (attributeValues: string[]): GridRow => ({
  key: comboKey(attributeValues),
  attributeValues,
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

const savedRow = (variant: SavedVariant): GridRow => ({
  key: comboKey(variant.attributeValues),
  attributeValues: variant.attributeValues,
  saved: variant,
  include: true,
  sku: variant.sku,
  price: variant.price,
  originalPrice: variant.originalPrice,
  inventoryCount: variant.inventoryCount,
  image: variant.image,
  dimensions: variant.dimensions,
  status: variant.status
});

// Rows follow the generated order; saved variants outside it are appended so none is ever dropped
export const buildGrid = (
  options: OptionSelection[],
  saved: SavedVariant[],
  previous: GridRow[]
): GridRow[] => {
  const savedByKey = new Map(saved.map(variant => [comboKey(variant.attributeValues), variant]));
  const previousByKey = new Map(previous.map(row => [row.key, row]));
  const rowFor = (key: string, fresh: () => GridRow): GridRow => {
    const variant = savedByKey.get(key);
    const kept = previousByKey.get(key);
    if (kept && kept.saved?._id === variant?._id) return kept;
    return variant ? savedRow(variant) : fresh();
  };
  const generated = generateCombinations(options).map(values =>
    rowFor(comboKey(values), () => draftRow(values))
  );
  const generatedKeys = new Set(generated.map(row => row.key));
  const orphans = saved
    .filter(variant => !generatedKeys.has(comboKey(variant.attributeValues)))
    .map(variant => rowFor(comboKey(variant.attributeValues), () => savedRow(variant)));
  return [...generated, ...orphans];
};

export const lockedValueIds = (saved: SavedVariant[]): Set<string> =>
  new Set(saved.flatMap(variant => variant.attributeValues));

const skuPart = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

export const suggestSku = (slug: string, labels: string[]): string =>
  [slug, ...labels].map(skuPart).filter(Boolean).join("-").toUpperCase();

const requiredNumber = (row: GridRow, field: "price" | "originalPrice" | "inventoryCount") => {
  const value = row[field];
  if (value === null) throw new Error(`Variant ${row.sku || row.key} is missing ${field}`);
  return value;
};

export const toVariantPayload = (rows: GridRow[]): ProductWriteInput["variants"] =>
  rows
    .filter(row => row.saved || row.include)
    .map((row): ProductVariantInput => {
      const fields = {
        sku: row.sku,
        price: requiredNumber(row, "price"),
        originalPrice: requiredNumber(row, "originalPrice"),
        image: row.image,
        dimensions: row.dimensions,
        status: row.status,
        attributeValues: row.attributeValues
      };
      return row.saved
        ? { _id: row.saved._id, ...fields }
        : { ...fields, inventoryCount: requiredNumber(row, "inventoryCount") };
    });

export const clearImage = (rows: GridRow[], url: string): GridRow[] =>
  rows.map(row => (row.image === url ? { ...row, image: null } : row));
