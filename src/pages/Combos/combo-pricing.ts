import type { ComboItemMode, ComboPricing, ComboProductOption } from "@/services/combos";

export interface PreviewItem {
  productId: string;
  quantity: number;
  mode: ComboItemMode;
  variantId?: string | null;
}

export interface Totals {
  normal: number;
  combo: number;
}

/** The backend discounts each unit before multiplying quantity. All amounts are integer VND. */
export function comboTotals(
  pricing: ComboPricing,
  pieces: Array<{ price: number; quantity: number }>
): Totals {
  const normal = pieces.reduce((sum, { price, quantity }) => sum + price * quantity, 0);
  const combo =
    pricing.mode === "FIXED"
      ? Math.min(pricing.value, normal)
      : pieces.reduce(
          (sum, { price, quantity }) =>
            sum + Math.floor((price * (100 - pricing.value)) / 100) * quantity,
          0
        );
  return { normal, combo };
}

/** Preview deliberately ignores inventory: a zero-stock active variant can still be priced. */
export function comboPreview(
  pricing: ComboPricing,
  items: PreviewItem[],
  options: ComboProductOption[]
): { cheapest: Totals | null; priciest: Totals | null; fixedAboveCheapest: boolean } {
  if (!items.length) return { cheapest: null, priciest: null, fixedAboveCheapest: false };
  const products = new Map(options.map(option => [option._id, option]));
  const low: Array<{ price: number; quantity: number }> = [];
  const high: Array<{ price: number; quantity: number }> = [];
  for (const item of items) {
    const variants = (products.get(item.productId)?.variants ?? []).filter(
      variant => variant.status === "ACTIVE"
    );
    const candidates =
      item.mode === "LOCKED"
        ? variants.filter(variant => variant._id === item.variantId)
        : variants;
    if (!candidates.length) return { cheapest: null, priciest: null, fixedAboveCheapest: false };
    low.push({
      price: Math.min(...candidates.map(variant => variant.price)),
      quantity: item.quantity
    });
    high.push({
      price: Math.max(...candidates.map(variant => variant.price)),
      quantity: item.quantity
    });
  }
  const cheapest = comboTotals(pricing, low);
  return {
    cheapest,
    priciest: comboTotals(pricing, high),
    fixedAboveCheapest: pricing.mode === "FIXED" && pricing.value > cheapest.normal
  };
}
