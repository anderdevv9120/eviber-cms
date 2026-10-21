import type { NamePath } from "antd/es/form/interface";
import type { ComboPublishRequirement } from "@/services/combos";
import type { ApiError } from "@/utils/request";
import { publishRequirementLabels } from "./combo-list-query";

// Backend error-code.const.ts combo codes.
export const COMBO_ERROR = {
  STALE_REVISION: "combo00001",
  NOT_FOUND: "combo00002",
  SLUG_TAKEN: "combo00003",
  SLUG_INVALID: "combo00004",
  CATEGORY_NOT_FOUND: "combo00005",
  ITEMS_INVALID: "combo00006",
  PUBLISH_REQUIREMENTS: "combo00007",
  STATUS_TRANSITION_INVALID: "combo00008",
  ARCHIVED: "combo00009"
} as const;

export interface ComboErrorView {
  field?: NamePath;
  itemKey?: string;
  message: string;
  missing?: ComboPublishRequirement[];
  stale?: boolean;
}
export interface SentComboItem {
  key: string;
}
const fieldByCode: Record<string, NamePath> = {
  [COMBO_ERROR.SLUG_TAKEN]: ["slug"],
  [COMBO_ERROR.SLUG_INVALID]: ["slug"],
  [COMBO_ERROR.CATEGORY_NOT_FOUND]: ["categoryIds"]
};

export function mapComboError(error: ApiError, sent: SentComboItem[] = []): ComboErrorView {
  const message = error.message;
  if (error.status === 409) return { message, stale: true };
  const { code, index, missing } = error.errors ?? {};
  if (typeof code !== "string") return { message };
  if (Object.prototype.hasOwnProperty.call(fieldByCode, code))
    return { message, field: fieldByCode[code] };
  if (code === COMBO_ERROR.ITEMS_INVALID) {
    if (typeof index === "number" && Number.isInteger(index) && sent[index])
      return { message, itemKey: sent[index].key, field: ["items", index] };
    return { message, field: ["items"] };
  }
  if (code === COMBO_ERROR.PUBLISH_REQUIREMENTS && Array.isArray(missing))
    return {
      message,
      missing: missing.filter((item): item is ComboPublishRequirement =>
        Object.prototype.hasOwnProperty.call(publishRequirementLabels, item)
      )
    };
  return { message };
}
