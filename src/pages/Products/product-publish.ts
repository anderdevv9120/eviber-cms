import type { PublishRequirement } from "@/services/products";
import { publishRequirementLabels } from "./product-list-query";
import type { GridRow } from "./variant-grid";

export const PUBLISH_REQUIREMENTS = Object.keys(publishRequirementLabels) as PublishRequirement[];

/** Backend `hasVisibleText`: tags stripped, whitespace (nbsp included in `\s`) ignored. */
const hasVisibleText = (html: string): boolean =>
  (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s/g, "")
    .length > 0;

/** Mirrors backend `publishMissing`; a new row counts once it is included (it is sent ACTIVE). */
export const publishMissing = (input: {
  images: string[];
  categoryIds: string[];
  description: string;
  rows: GridRow[];
}): PublishRequirement[] => {
  const ok: Record<PublishRequirement, boolean> = {
    ACTIVE_VARIANT: input.rows.some(row => (row.saved || row.include) && row.status === "ACTIVE"),
    IMAGE: input.images.length > 0,
    CATEGORY: input.categoryIds.length > 0,
    DESCRIPTION: hasVisibleText(input.description)
  };
  return PUBLISH_REQUIREMENTS.filter(code => !ok[code]);
};
