import type { NamePath } from "antd/es/form/interface";
import type { PublishRequirement } from "@/services/products";
import type { ApiError } from "@/utils/request";
import { publishRequirementLabels } from "./product-list-query";

// Backend `error-code.const.ts` product codes
export const PRODUCT_ERROR = {
  STALE_REVISION: "product00001",
  ARCHIVED: "product00002",
  SLUG_TAKEN: "product00003",
  SLUG_INVALID: "product00004",
  CATEGORY_NOT_FOUND: "product00005",
  OPTION_VALUE_INVALID: "product00006",
  OPTION_VALUE_IN_USE: "product00007",
  VARIANT_COMBINATION_INVALID: "product00008",
  VARIANT_DUPLICATE_COMBINATION: "product00009",
  VARIANT_COMBINATION_LOCKED: "product00010",
  VARIANT_MISSING: "product00011",
  SKU_TAKEN: "product00012",
  VARIANT_PRICE_INVALID: "product00013",
  VARIANT_IMAGE_INVALID: "product00014",
  DESCRIPTION_TOO_LONG: "product00015",
  PUBLISH_REQUIREMENTS: "product00016"
} as const;

export type VariantField = "sku" | "originalPrice" | "image";
export interface ProductErrorView {
  field?: NamePath;
  variantKey?: string;
  variantField?: VariantField;
  message: string;
  missing?: PublishRequirement[];
  stale?: boolean;
}
/** Grid rows in the order they were sent, so `variantIndex` and `sku` find their row. */
export interface SentVariant {
  key: string;
  sku: string;
}

const fieldByCode: Record<string, NamePath> = {
  [PRODUCT_ERROR.SLUG_TAKEN]: ["slug"],
  [PRODUCT_ERROR.SLUG_INVALID]: ["slug"],
  [PRODUCT_ERROR.CATEGORY_NOT_FOUND]: ["categoryIds"],
  [PRODUCT_ERROR.DESCRIPTION_TOO_LONG]: ["description"]
};
const indexedVariantCodes: Record<string, VariantField | undefined> = {
  [PRODUCT_ERROR.VARIANT_PRICE_INVALID]: "originalPrice",
  [PRODUCT_ERROR.VARIANT_IMAGE_INVALID]: "image",
  [PRODUCT_ERROR.VARIANT_COMBINATION_INVALID]: undefined,
  [PRODUCT_ERROR.VARIANT_DUPLICATE_COMBINATION]: undefined,
  [PRODUCT_ERROR.VARIANT_COMBINATION_LOCKED]: undefined
};

export const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

export function mapProductError(error: ApiError, sent: SentVariant[] = []): ProductErrorView {
  const message = error.message;
  if (error.status === 409) return { message, stale: true };
  const { code, sku, variantIndex, missing } = error.errors ?? {};
  if (typeof code !== "string") return { message };
  if (code in fieldByCode) return { message, field: fieldByCode[code] };
  if (code === PRODUCT_ERROR.SKU_TAKEN && typeof sku === "string") {
    const row = sent.find(variant => normalizeSku(variant.sku) === normalizeSku(sku));
    return row ? { message, variantKey: row.key, variantField: "sku" } : { message };
  }
  if (code in indexedVariantCodes && typeof variantIndex === "number" && sent[variantIndex]) {
    const variantField = indexedVariantCodes[code];
    return { message, variantKey: sent[variantIndex].key, ...(variantField && { variantField }) };
  }
  if (code === PRODUCT_ERROR.PUBLISH_REQUIREMENTS && Array.isArray(missing))
    return {
      message,
      missing: missing.filter((item): item is PublishRequirement =>
        Object.prototype.hasOwnProperty.call(publishRequirementLabels, item)
      )
    };
  return { message };
}
