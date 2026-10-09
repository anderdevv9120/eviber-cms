import dayjs from "dayjs";
import type { CouponAvailability, VoucherListQuery, VoucherPage } from "@/services/vouchers";

export const availabilityLabels: Record<CouponAvailability, string> = {
  active: "Đang áp dụng",
  disabled: "Đã tắt",
  expired: "Hết hạn",
  scheduled: "Chưa bắt đầu",
  exhausted: "Hết lượt"
};

export function parseVoucherQuery(params: URLSearchParams): VoucherListQuery {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const size = single("pageSize");
  const pageSize = size && /^(?:[1-9]\d?|100)$/.test(size) ? Number(size) : 10;
  const page = single("page");
  const query: VoucherListQuery = {
    page:
      page &&
      /^[1-9]\d*$/.test(page) &&
      Number.isSafeInteger(Number(page)) &&
      Number.isSafeInteger((Number(page) - 1) * pageSize)
        ? Number(page)
        : 1,
    pageSize
  };
  const search = single("search")?.trim();
  const availability = single("availability");
  if (search && search.length <= 255 && !search.includes("\uFFFD")) query.search = search;
  if (availability && Object.prototype.hasOwnProperty.call(availabilityLabels, availability))
    query.availability = availability as CouponAvailability;
  return query;
}

export function serializeVoucherQuery(query: VoucherListQuery): URLSearchParams {
  const input = new URLSearchParams();
  for (const key of ["page", "pageSize", "search", "availability"] as const) {
    if (query[key] !== undefined) input.set(key, String(query[key]));
  }
  const normalized = parseVoucherQuery(input);
  const params = new URLSearchParams();
  if (normalized.page !== 1) params.set("page", String(normalized.page));
  if (normalized.pageSize !== 10) params.set("pageSize", String(normalized.pageSize));
  if (normalized.search) params.set("search", normalized.search);
  if (normalized.availability) params.set("availability", normalized.availability);
  return params;
}

const shopOffset = 7 * 60 * 60 * 1000;
export function voucherLocalDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("Ngày không hợp lệ");
  return new Date(date.getTime() + shopOffset)
    .toISOString()
    .slice(0, -1)
    .replace(/:00\.000$/, "")
    .replace(/\.000$/, "");
}
export const voucherDateFormat = "DD/MM/YYYY HH:mm:ss";
export const voucherDisplayDate = (iso: string): string =>
  dayjs(voucherLocalDate(iso)).format(voucherDateFormat);
export function voucherInstant(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(local))
    throw new Error("Ngày không hợp lệ");
  const full =
    local.length === 16
      ? `${local}:00.000`
      : local.length === 19
        ? `${local}.000`
        : local.padEnd(23, "0");
  const date = new Date(`${full}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, -1) !== full)
    throw new Error("Ngày không hợp lệ");
  return new Date(date.getTime() - shopOffset).toISOString();
}

// Failed/malformed reads must not manufacture successful empty counts.
export function checkVoucherPage<T>(
  data: VoucherPage<T>,
  query: { page: number; pageSize: number }
): VoucherPage<T> {
  if (
    !data ||
    !Array.isArray(data.data) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.totalPage) ||
    data.totalPage !== Math.ceil(data.total / query.pageSize) ||
    data.page !== query.page ||
    data.pageSize !== query.pageSize
  )
    throw new Error("Không nhận được danh sách hợp lệ. Vui lòng thử lại.");
  return data;
}
