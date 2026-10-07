import type { StockReportQuery, StockStatus } from "@/services/reports";

export type StockQuery = Required<StockReportQuery>;
export interface DashboardUrlState {
  /** Valid URL values with defaults for absent or invalid ones: the base for user edits only. */
  query: StockQuery;
  /** Values to read; null while an explicit URL value awaits correction. */
  threshold: number | null;
  stock: StockQuery | null;
  thresholdError: string | null;
  stockErrors: string[];
}

export const thresholdError = "Ngưỡng tồn kho phải là số nguyên từ 1 đến 1000";
// Mirrors backend THRESHOLD_PATTERN: no signs, fractions, exponents or leading zeros.
export const validThreshold = (value: string) => /^(?:[1-9]\d{0,2}|1000)$/.test(value);
const defaults: StockQuery = { lowStockThreshold: 5, stockStatus: "low", page: 1, pageSize: 10 };

/** Absent values use defaults; explicit invalid or repeated values are reported, never replaced. */
export function parseDashboardQuery(params: URLSearchParams): DashboardUrlState {
  const field = (key: keyof StockQuery, valid: (value: string) => boolean) => {
    const values = params.getAll(key);
    return !values.length || (values.length === 1 && valid(values[0]));
  };
  const valid = {
    lowStockThreshold: field("lowStockThreshold", validThreshold),
    stockStatus: field("stockStatus", value => value === "low" || value === "out"),
    page: field("page", value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))),
    pageSize: field("pageSize", value => ["10", "20", "50"].includes(value))
  };
  const raw = (key: keyof StockQuery) => (valid[key] ? params.get(key) : null);
  const query: StockQuery = {
    lowStockThreshold: Number(raw("lowStockThreshold") ?? defaults.lowStockThreshold),
    stockStatus: (raw("stockStatus") ?? defaults.stockStatus) as StockStatus,
    page: Number(raw("page") ?? defaults.page),
    pageSize: Number(raw("pageSize") ?? defaults.pageSize)
  };
  const stockErrors = [
    !valid.stockStatus && "Chế độ tồn kho không hợp lệ",
    !valid.page && "Trang tồn kho không hợp lệ",
    !valid.pageSize && "Số SKU mỗi trang không hợp lệ"
  ].filter(error => error !== false);
  return {
    query,
    threshold: valid.lowStockThreshold ? query.lowStockThreshold : null,
    stock: valid.lowStockThreshold && !stockErrors.length ? query : null,
    thresholdError: valid.lowStockThreshold ? null : thresholdError,
    stockErrors
  };
}

/** Default values stay implicit so the plain Dashboard keeps its plain URL. */
export function serializeDashboardQuery(query: StockQuery) {
  const params = new URLSearchParams();
  for (const key of ["lowStockThreshold", "stockStatus", "page", "pageSize"] as const)
    if (query[key] !== defaults[key]) params.set(key, String(query[key]));
  return params;
}
