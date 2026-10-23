import type { ComboProductOption, ComboPublishRequirement } from "@/services/combos";
import type { PreviewItem } from "./combo-pricing";
import type { ComboPieceRow, PieceErrors } from "./ComboPiecesSection";

export function validateComboPieces(items: ComboPieceRow[]): PieceErrors {
  const errors: PieceErrors = {};
  if (items.length < 2 || items.length > 20)
    errors._form = "Combo cần ít nhất 2 món và tối đa 20 món.";
  const ids = new Set<string>();
  for (const row of items) {
    if (!row.productId || ids.has(row.productId))
      errors[row._id] = "Mỗi sản phẩm chỉ được chọn một lần.";
    ids.add(row.productId);
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10)
      errors[row._id] = "Số lượng mỗi món phải từ 1 đến 10.";
    if (
      row.mode === "LOCKED" &&
      (!row.variantId || !row.product?.variants.some(variant => variant._id === row.variantId))
    )
      errors[row._id] = "Chọn biến thể cố định thuộc sản phẩm.";
  }
  return errors;
}

export interface ComboPublishForm {
  categoryIds: string[];
  items: PreviewItem[];
  products: ComboProductOption[];
}

export const COMBO_PUBLISH_REQUIREMENTS: ComboPublishRequirement[] = [
  "CATEGORY",
  "PIECE_PUBLISHED",
  "LOCKED_VARIANT_ACTIVE"
];

/** Mirrors the backend's publish checks. Unresolved products count as unpublished. */
export function comboPublishMissing({
  categoryIds,
  items,
  products
}: ComboPublishForm): ComboPublishRequirement[] {
  const byId = new Map(products.map(product => [product._id, product]));
  const missing: ComboPublishRequirement[] = [];
  if (!categoryIds.length) missing.push("CATEGORY");
  if (items.some(item => byId.get(item.productId)?.status !== "PUBLISH"))
    missing.push("PIECE_PUBLISHED");
  if (
    items.some(
      item =>
        item.mode === "LOCKED" &&
        !byId
          .get(item.productId)
          ?.variants.some(variant => variant._id === item.variantId && variant.status === "ACTIVE")
    )
  )
    missing.push("LOCKED_VARIANT_ACTIVE");
  return missing;
}
