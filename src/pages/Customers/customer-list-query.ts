import type { CustomerListQuery, CustomerStatus } from "@/services/customers";

/** Repeated keys invalidate only that field; unknown keys never reach the API. */
export function parseCustomerListQuery(params: URLSearchParams): CustomerListQuery {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const page = single("page");
  const pageSize = single("pageSize");
  const search = single("search")?.trim();
  const status = single("status");
  const query: CustomerListQuery = {
    tab: single("tab") === "guests" ? "guests" : "registered",
    page:
      page && /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) && Number(page) > 0
        ? Number(page)
        : 1,
    pageSize: pageSize && ["10", "20", "50"].includes(pageSize) ? Number(pageSize) : 10
  };
  // URLSearchParams replaces invalid UTF-8 with U+FFFD; do not submit that search.
  if (search && search.length <= 255 && !search.includes("\uFFFD")) query.search = search;
  if (
    query.tab === "registered" &&
    status &&
    ["VERIFIED", "UNVERIFIED", "DELETED"].includes(status)
  )
    query.status = status as CustomerStatus;
  return query;
}

/** Default values stay implicit so unfiltered lists retain their plain URLs. */
export function serializeCustomerListQuery(query: CustomerListQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["tab", "page", "pageSize", "search", "status"] as const) {
    const value = query[key];
    if (value !== undefined) params.set(key, String(value));
  }
  const normalized = parseCustomerListQuery(params);
  const result = new URLSearchParams();
  if (normalized.tab === "guests") result.set("tab", "guests");
  if (normalized.page !== 1) result.set("page", String(normalized.page));
  if (normalized.pageSize !== 10) result.set("pageSize", String(normalized.pageSize));
  if (normalized.search) result.set("search", normalized.search);
  if (normalized.status) result.set("status", normalized.status);
  return result;
}

export function safeCustomerReturnTo(value: string | null): string {
  if (!value || value.includes("#")) return "/customers";
  const separator = value.indexOf("?");
  const path = separator < 0 ? value : value.slice(0, separator);
  if (path !== "/customers") return "/customers";
  const params = new URLSearchParams(separator < 0 ? "" : value.slice(separator + 1));
  const query = serializeCustomerListQuery(parseCustomerListQuery(params)).toString();
  return query ? `${path}?${query}` : path;
}
