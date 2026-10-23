import type { InventoryQuery, InventoryStockFilter } from "@/services/inventory";

export interface InventoryUrlQuery {
  search: string;
  productId?: string;
  productStatus?: InventoryQuery["productStatus"];
  variantStatus?: InventoryQuery["variantStatus"];
  stock: InventoryStockFilter;
  lowStockThreshold: number;
  page: number;
  pageSize: number;
}
export interface InventoryUrlState {
  /** Valid URL values with defaults for absent or invalid ones: the base for user edits. */
  query: InventoryUrlQuery;
  /** One message per explicit invalid or repeated value; any entry blocks the request. */
  errors: string[];
}

export const thresholdError = "Ngưỡng tồn kho phải là số nguyên từ 1 đến 1000";
// Mirrors backend THRESHOLD_PATTERN: no signs, fractions, exponents or leading zeros.
export const validThreshold = (value: string) => /^(?:[1-9]\d{0,2}|1000)$/.test(value);

export const INVENTORY_PAGE_SIZES = [10, 20, 50];
const SEARCH_MAX = 100; // backend InventoryQueryDto
const DEFAULT_THRESHOLD = 5;
const DEFAULT_PAGE_SIZE = 10;

const oneOf =
  <T extends string>(options: readonly T[]) =>
  (value: string) =>
    options.find(option => option === value);

/** Explicit invalid or repeated values are reported, never replaced; absent ones use defaults. */
export function parseInventoryQuery(params: URLSearchParams): InventoryUrlState {
  const errors: string[] = [];
  const read = <T>(key: string, error: string, parse: (value: string) => T | undefined) => {
    const values = params.getAll(key);
    if (!values.length) return undefined;
    const parsed = values.length === 1 ? parse(values[0]) : undefined;
    if (parsed === undefined) errors.push(error);
    return parsed;
  };
  const query: InventoryUrlQuery = {
    search:
      read("search", "Từ khoá tìm kiếm không hợp lệ", value => {
        const text = value.trim();
        // URLSearchParams replaces invalid UTF-8 with U+FFFD; do not submit that search.
        return text.length <= SEARCH_MAX && !text.includes("�") ? text : undefined;
      }) ?? "",
    productId: read("productId", "Mã sản phẩm không hợp lệ", value =>
      /^[a-f\d]{24}$/i.test(value) ? value : undefined
    ),
    productStatus: read(
      "productStatus",
      "Trạng thái sản phẩm không hợp lệ",
      oneOf(["PUBLISH", "UNPUBLISH", "DRAFT"] as const)
    ),
    variantStatus: read(
      "variantStatus",
      "Trạng thái biến thể không hợp lệ",
      oneOf(["ACTIVE", "INACTIVE"] as const)
    ),
    stock:
      read("stock", "Chế độ tồn kho không hợp lệ", oneOf(["all", "low", "out"] as const)) ?? "all",
    lowStockThreshold: Number(
      read("lowStockThreshold", thresholdError, value =>
        validThreshold(value) ? value : undefined
      ) ?? DEFAULT_THRESHOLD
    ),
    page: Number(
      read("page", "Trang tồn kho không hợp lệ", value =>
        /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : undefined
      ) ?? 1
    ),
    pageSize: Number(
      read("pageSize", "Số biến thể mỗi trang không hợp lệ", value =>
        INVENTORY_PAGE_SIZES.map(String).find(size => size === value)
      ) ?? DEFAULT_PAGE_SIZE
    )
  };
  return { query, errors };
}

/** Defaults stay implicit; the threshold only matters (and only stays) for stock=low. */
export function toInventorySearch(query: InventoryUrlQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.productId) params.set("productId", query.productId);
  if (query.productStatus) params.set("productStatus", query.productStatus);
  if (query.variantStatus) params.set("variantStatus", query.variantStatus);
  if (query.stock !== "all") params.set("stock", query.stock);
  if (query.stock === "low" && query.lowStockThreshold !== DEFAULT_THRESHOLD)
    params.set("lowStockThreshold", String(query.lowStockThreshold));
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  return params;
}

export function toInventoryApiQuery(query: InventoryUrlQuery): InventoryQuery {
  return {
    ...(query.search && { search: query.search }),
    ...(query.productId && { productId: query.productId }),
    ...(query.productStatus && { productStatus: query.productStatus }),
    ...(query.variantStatus && { variantStatus: query.variantStatus }),
    ...(query.stock !== "all" && { stock: query.stock }),
    ...(query.stock === "low" && { lowStockThreshold: query.lowStockThreshold }),
    page: query.page,
    pageSize: query.pageSize
  };
}
