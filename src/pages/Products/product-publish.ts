import type { PublishRequirement } from "@/services/products";
import { publishRequirementLabels } from "./product-list-query";
import type { GridRow } from "./variant-grid";

export const PUBLISH_REQUIREMENTS = Object.keys(publishRequirementLabels) as PublishRequirement[];

/** Backend `hasVisibleText`: tags stripped, whitespace (nbsp included in `\s`) ignored. */
const hasVisibleText = (html: string): boolean =>
  (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s/g, "")
    .length > 0;

export const DESCRIPTION_IMAGE_INVALID =
  "Ảnh trong mô tả phải là liên kết https:// hoặc /images/ — ảnh chèn từ tệp máy tính không lưu được";

/** Backend `ALLOWED_IMAGE_SRC` (product-html.ts): any other img src is emptied on save. */
const ALLOWED_IMAGE_SRC = /^(https:\/\/|\/images\/)/i;

export const hasInvalidDescriptionImage = (html: string): boolean =>
  Array.from(new DOMParser().parseFromString(html, "text/html").images).some(
    img => !ALLOWED_IMAGE_SRC.test(img.getAttribute("src") ?? "")
  );

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
