import type { SalesReportQuery } from "@/services/reports";

const DAY_MS = 86400000;
// Asia/Ho_Chi_Minh has no DST: a Vietnam day starts at 17:00 UTC on the preceding date.
const VIETNAM_OFFSET_MS = 7 * 3600000;

export type ReportPreset = "today" | "last7" | "month";
export type ReportQueryState =
  { query: SalesReportQuery; errors: [] } | { query: null; errors: string[] };

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

function calendarTime(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) && isoDay(time) === date ? time : null;
}

/** YYYY-MM-DD as the Vietnamese DD/MM/YYYY display. */
export const calendarLabel = (date: string) => date.split("-").reverse().join("/");
export const vietnamToday = (now = new Date()) => isoDay(now.getTime() + VIETNAM_OFFSET_MS);

export function reportPresetRange(preset: ReportPreset, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "last7")
    return { from: isoDay(Date.parse(`${today}T00:00:00.000Z`) - 6 * DAY_MS), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Mirrors backend validation so an invalid range never reaches the API. */
export function reportRangeErrors(from: string, to: string): string[] {
  const start = calendarTime(from);
  const end = calendarTime(to);
  const errors: string[] = [];
  if (start === null) errors.push("Ngày bắt đầu bị thiếu hoặc không hợp lệ");
  if (end === null) errors.push("Ngày kết thúc bị thiếu hoặc không hợp lệ");
  if (start === null || end === null) return errors;
  if (start > end) return ["Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"];
  if ((end - start) / DAY_MS + 1 > 366) return ["Khoảng thời gian tối đa 366 ngày"];
  return [];
}

/** Absent dates use This month; explicit invalid or repeated values are reported, never replaced. */
export function parseReportQuery(params: URLSearchParams, today: string): ReportQueryState {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key)! : "");
  const range =
    params.has("from") || params.has("to")
      ? { from: single("from"), to: single("to") }
      : reportPresetRange("month", today);
  const errors = reportRangeErrors(range.from, range.to);
  const delivered = params.has("deliveredOnly") ? single("deliveredOnly") : "false";
  if (delivered !== "true" && delivered !== "false")
    errors.push("Bộ lọc chỉ đơn đã giao không hợp lệ");
  return errors.length
    ? { query: null, errors }
    : { query: { ...range, deliveredOnly: delivered === "true" }, errors: [] };
}

/** Dates are always explicit so a shared URL keeps its committed range. */
export function serializeReportQuery({ from, to, deliveredOnly }: SalesReportQuery) {
  const params = new URLSearchParams({ from, to });
  if (deliveredOnly) params.set("deliveredOnly", "true");
  return params;
}
