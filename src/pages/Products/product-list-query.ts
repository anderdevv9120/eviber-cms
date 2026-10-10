import type { ProductListQuery, ProductStatus, PublishRequirement } from "@/services/products";

/** `ACTIVE_SET` = every status except archived; it is the default and never written to the URL. */
export type ProductStatusFilter = ProductStatus | "ACTIVE_SET";
export interface ProductListQueryState {
  q: string;
  status: ProductStatusFilter;
  categoryId?: string;
  page: number;
}

export const PRODUCT_PAGE_SIZE = 20;
const Q_MAX = 100; // backend ProductAdminQueryDto

export const productStatusLabels: Record<ProductStatus, string> = {
  PUBLISH: "Đang bán",
  UNPUBLISH: "Tạm ẩn",
  DRAFT: "Nháp",
  DELETED: "Đã lưu trữ"
};
export const publishRequirementLabels: Record<PublishRequirement, string> = {
  ACTIVE_VARIANT: "biến thể đang bán",
  IMAGE: "ảnh sản phẩm",
  CATEGORY: "danh mục",
  DESCRIPTION: "mô tả sản phẩm"
};

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Repeated or invalid keys fall back to their defaults; unknown keys never reach the API. */
export function parseProductListQuery(params: URLSearchParams): ProductListQueryState {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const page = single("page");
  const q = single("q")?.trim() ?? "";
  const status = single("status");
  const categoryId = single("categoryId");
  const query: ProductListQueryState = {
    // URLSearchParams replaces invalid UTF-8 with U+FFFD; do not submit that search.
    q: q.length <= Q_MAX && !q.includes("\uFFFD") ? q : "",
    status: status && has(productStatusLabels, status) ? (status as ProductStatus) : "ACTIVE_SET",
    page: page && /^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) ? Number(page) : 1
  };
  if (categoryId && /^[a-f\d]{24}$/i.test(categoryId)) query.categoryId = categoryId;
  return query;
}

function writeParams(query: ProductListQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.status !== "ACTIVE_SET") params.set("status", query.status);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.page !== 1) params.set("page", String(query.page));
  return params;
}

/** Re-parsed so only values the parser accepts reach the URL; defaults stay implicit. */
export function serializeProductListQuery(query: ProductListQueryState): URLSearchParams {
  return writeParams(parseProductListQuery(writeParams(query)));
}

export function toProductListApiQuery(query: ProductListQueryState): ProductListQuery {
  return {
    ...(query.q && { q: query.q }),
    ...(query.status !== "ACTIVE_SET" && { status: query.status }),
    ...(query.categoryId && { categoryId: query.categoryId }),
    page: query.page,
    pageSize: PRODUCT_PAGE_SIZE
  };
}
