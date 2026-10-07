import { describe, expect, it } from "vitest";
import {
  parseReportQuery,
  reportPresetRange,
  reportRangeErrors,
  serializeReportQuery,
  vietnamToday
} from "./report-query";

const parse = (search: string, today = "2026-10-07") =>
  parseReportQuery(new URLSearchParams(search), today);

describe("Vietnam calendar dates", () => {
  it("switches day at 17:00 UTC regardless of the computer timezone", () => {
    expect(vietnamToday(new Date("2026-10-06T16:59:59.999Z"))).toBe("2026-10-06");
    expect(vietnamToday(new Date("2026-10-06T17:00:00.000Z"))).toBe("2026-10-07");
    expect(vietnamToday(new Date("2026-12-31T17:00:00.000Z"))).toBe("2027-01-01");
  });

  it("builds Today, Last 7 days (today plus six earlier dates) and This month presets", () => {
    expect(reportPresetRange("today", "2026-10-07")).toEqual({
      from: "2026-10-07",
      to: "2026-10-07"
    });
    expect(reportPresetRange("last7", "2026-10-07")).toEqual({
      from: "2026-10-01",
      to: "2026-10-07"
    });
    expect(reportPresetRange("last7", "2024-03-03")).toEqual({
      from: "2024-02-26",
      to: "2024-03-03"
    });
    expect(reportPresetRange("month", "2026-10-07")).toEqual({
      from: "2026-10-01",
      to: "2026-10-07"
    });
    expect(reportPresetRange("month", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-01"
    });
  });

  it.each([
    ["2024-02-29", "2024-02-29", []],
    ["2025-01-01", "2025-12-31", []],
    ["2024-01-01", "2024-12-31", []],
    ["2024-01-01", "2025-01-01", ["Khoảng thời gian tối đa 366 ngày"]],
    ["2026-10-07", "2026-10-06", ["Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"]],
    [
      "2025-02-29",
      "2026-02-30",
      ["Ngày bắt đầu bị thiếu hoặc không hợp lệ", "Ngày kết thúc bị thiếu hoặc không hợp lệ"]
    ],
    ["", "2026-10-07", ["Ngày bắt đầu bị thiếu hoặc không hợp lệ"]],
    ["2026-10-07", "", ["Ngày kết thúc bị thiếu hoặc không hợp lệ"]],
    [
      "2026-1-07",
      "2026-10-07T00:00",
      ["Ngày bắt đầu bị thiếu hoặc không hợp lệ", "Ngày kết thúc bị thiếu hoặc không hợp lệ"]
    ]
  ])("validates range %s..%s", (from, to, errors) => {
    expect(reportRangeErrors(from, to)).toEqual(errors);
  });
});

describe("report URL filters", () => {
  it("defaults to This month through Vietnam today when no report field is present", () => {
    expect(parse("")).toEqual({
      query: { from: "2026-10-01", to: "2026-10-07", deliveredOnly: false },
      errors: []
    });
    expect(parse("unknown=1&threshold=9")).toEqual(parse(""));
    expect(parse("deliveredOnly=true")).toEqual({
      query: { from: "2026-10-01", to: "2026-10-07", deliveredOnly: true },
      errors: []
    });
  });

  it("restores explicit committed filters exactly", () => {
    expect(parse("from=2026-09-30&to=2026-10-02&deliveredOnly=true")).toEqual({
      query: { from: "2026-09-30", to: "2026-10-02", deliveredOnly: true },
      errors: []
    });
    expect(parse("from=2026-09-30&to=2026-10-02&deliveredOnly=false").query?.deliveredOnly).toBe(
      false
    );
  });

  it.each([
    ["from=2026-10-01", ["Ngày kết thúc bị thiếu hoặc không hợp lệ"]],
    ["from=2026-10-01&from=2026-10-02&to=2026-10-07", ["Ngày bắt đầu bị thiếu hoặc không hợp lệ"]],
    ["from=2026-10-01&to=2026-10-07&deliveredOnly=1", ["Bộ lọc chỉ đơn đã giao không hợp lệ"]],
    [
      "from=2026-10-01&to=2026-10-07&deliveredOnly=true&deliveredOnly=true",
      ["Bộ lọc chỉ đơn đã giao không hợp lệ"]
    ],
    ["deliveredOnly=TRUE", ["Bộ lọc chỉ đơn đã giao không hợp lệ"]],
    ["from=2026-10-08&to=2026-10-07", ["Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"]]
  ])("shows correction errors instead of a substitute range for %s", (search, errors) => {
    expect(parse(search)).toEqual({ query: null, errors });
  });

  it("serializes dates always and the delivery toggle only when on", () => {
    expect(
      serializeReportQuery({
        from: "2026-10-01",
        to: "2026-10-07",
        deliveredOnly: false
      }).toString()
    ).toBe("from=2026-10-01&to=2026-10-07");
    const params = serializeReportQuery({
      from: "2026-09-30",
      to: "2026-10-02",
      deliveredOnly: true
    });
    expect(params.toString()).toBe("from=2026-09-30&to=2026-10-02&deliveredOnly=true");
    expect(parseReportQuery(params, "2027-01-15").query).toEqual({
      from: "2026-09-30",
      to: "2026-10-02",
      deliveredOnly: true
    });
  });
});
