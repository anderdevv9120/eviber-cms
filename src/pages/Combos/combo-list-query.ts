import type { ComboListQuery, ComboPublishRequirement } from "@/services/combos";
import type { ProductStatus } from "@/services/products";

/** `ACTIVE_SET` = every status except archived; it is the default and never written to the URL. */
export type ProductStatusFilter = ProductStatus | "ACTIVE_SET";
export interface ComboListQueryState {
  q: string;
  status: ProductStatusFilter;
  attention: boolean;
  page: number;
}

export const COMBO_PAGE_SIZE = 20;
const Q_MAX = 100; // backend ComboAdminQueryDto

export const productStatusLabels: Record<ProductStatus, string> = {
  PUBLISH: "Đang bán",
  UNPUBLISH: "Tạm ẩn",
  DRAFT: "Nháp",
  DELETED: "Đã lưu trữ"
};
export const publishRequirementLabels: Record<ComboPublishRequirement, string> = {
  CATEGORY: "danh mục",
  PIECE_PUBLISHED: "sản phẩm thành phần đang bán",
  LOCKED_VARIANT_ACTIVE: "biến thể cố định đang bán"
};

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Repeated or invalid keys fall back to their defaults; unknown keys never reach the API. */
export function parseComboListQuery(params: URLSearchParams): ComboListQueryState {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const page = single("page");
  const q = single("q")?.trim() ?? "";
  const status = single("status");
  const attention = single("attention");
  const query: ComboListQueryState = {
    // URLSearchParams replaces invalid UTF-8 with U+FFFD; do not submit that search.
    q: q.length <= Q_MAX && !q.includes("\uFFFD") ? q : "",
    status: status && has(productStatusLabels, status) ? (status as ProductStatus) : "ACTIVE_SET",
    attention: attention === "1",
    page: page && /^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) ? Number(page) : 1
  };
  return query;
}

function writeParams(query: ComboListQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.status !== "ACTIVE_SET") params.set("status", query.status);
  if (query.attention) params.set("attention", "1");
  if (query.page !== 1) params.set("page", String(query.page));
  return params;
}

/** Re-parsed so only values the parser accepts reach the URL; defaults stay implicit. */
export function serializeComboListQuery(query: ComboListQueryState): URLSearchParams {
  return writeParams(parseComboListQuery(writeParams(query)));
}

export function toComboListApiQuery(query: ComboListQueryState): ComboListQuery {
  return {
    ...(query.q && { search: query.q }),
    ...(query.status !== "ACTIVE_SET" && { status: query.status }),
    ...(query.attention && { attention: "true" }),
    page: query.page,
    pageSize: COMBO_PAGE_SIZE
  };
}
