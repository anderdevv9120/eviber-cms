import type { ReviewListQuery, ReviewStatus } from "@/services/reviews";

// ponytail: cỡ trang cố định 20, chưa có chọn cỡ trang — thêm khi admin cần
const PAGE_SIZE = 20;
const STATUSES: ReviewStatus[] = ["pending", "approved", "rejected"];

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối"
};
export const STATUS_COLOR: Record<ReviewStatus, string> = {
  pending: "gold",
  approved: "green",
  rejected: "red"
};

/** Key lặp lại chỉ làm hỏng field đó; giá trị sai quay về mặc định. */
export function parseReviewListQuery(params: URLSearchParams): ReviewListQuery {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  const status = single("status");
  const page = single("page");
  const rating = single("rating");
  const search = single("search")?.trim();
  const query: ReviewListQuery = {
    status: STATUSES.includes(status as ReviewStatus) ? (status as ReviewStatus) : "pending",
    page:
      page && /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) && Number(page) > 0
        ? Number(page)
        : 1,
    pageSize: PAGE_SIZE
  };
  if (rating && /^[1-5]$/.test(rating)) query.rating = Number(rating);
  // URLSearchParams thay UTF-8 hỏng bằng U+FFFD; không gửi search đó
  if (search && search.length <= 255 && !search.includes("�")) query.search = search;
  return query;
}

/** Giá trị mặc định không ghi lên URL. */
export function serializeReviewListQuery(query: ReviewListQuery): URLSearchParams {
  const result = new URLSearchParams();
  if (query.status !== "pending") result.set("status", query.status);
  if (query.page !== 1) result.set("page", String(query.page));
  if (query.rating) result.set("rating", String(query.rating));
  if (query.search) result.set("search", query.search);
  return result;
}
