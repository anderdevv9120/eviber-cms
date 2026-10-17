import { describe, expect, it } from "vitest";
import { previewAfter, toAdjustRequest } from "./adjust-stock";

describe("toAdjustRequest", () => {
  it("sends a positive delta for in and a negative delta for out, without expectedCurrent", () => {
    expect(toAdjustRequest("in", 50, 37, "Nhập kho")).toEqual({ delta: 50, note: "Nhập kho" });
    expect(toAdjustRequest("out", 7, 37, "Hỏng")).toEqual({ delta: -7, note: "Hỏng" });
  });

  it("sends N - current and expectedCurrent for count, also when N is 0", () => {
    expect(toAdjustRequest("count", 40, 37, "Kiểm kê")).toEqual({
      delta: 3,
      note: "Kiểm kê",
      expectedCurrent: 37
    });
    expect(toAdjustRequest("count", 0, 37, "Mất")).toEqual({
      delta: -37,
      note: "Mất",
      expectedCurrent: 37
    });
  });

  it("trims the note", () => {
    expect(toAdjustRequest("in", 1, 0, "  ok  ")?.note).toBe("ok");
  });

  it("returns null for a zero delta", () => {
    expect(toAdjustRequest("count", 37, 37, "Kiểm kê")).toBeNull();
    expect(toAdjustRequest("in", 0, 37, "x")).toBeNull();
    expect(toAdjustRequest("out", 0, 37, "x")).toBeNull();
  });

  it("returns null when the result would be negative", () => {
    expect(toAdjustRequest("out", 38, 37, "x")).toBeNull();
    expect(toAdjustRequest("out", 37, 37, "x")).toEqual({ delta: -37, note: "x" });
  });

  it("returns null for an invalid amount", () => {
    expect(toAdjustRequest("in", null, 37, "x")).toBeNull();
    expect(toAdjustRequest("in", 1.5, 37, "x")).toBeNull();
    expect(toAdjustRequest("in", -2, 37, "x")).toBeNull();
    expect(toAdjustRequest("out", -2, 37, "x")).toBeNull();
    expect(toAdjustRequest("count", -1, 37, "x")).toBeNull();
    expect(toAdjustRequest("count", Number.NaN, 37, "x")).toBeNull();
    expect(toAdjustRequest("in", 100001, 0, "x")).toBeNull();
    expect(toAdjustRequest("in", 100000, 0, "x")).toEqual({ delta: 100000, note: "x" });
  });

  it("omits a blank note and returns null for an over-long note", () => {
    expect(toAdjustRequest("in", 1, 37, "")).toEqual({ delta: 1 });
    expect(toAdjustRequest("count", 40, 37, "  \n ")).toEqual({ delta: 3, expectedCurrent: 37 });
    expect(toAdjustRequest("in", 1, 37, "a".repeat(501))).toBeNull();
    expect(toAdjustRequest("in", 1, 37, "a".repeat(500))).not.toBeNull();
  });
});

describe("previewAfter", () => {
  it("shows the stock after each mode", () => {
    expect(previewAfter("in", 50, 37)).toBe(87);
    expect(previewAfter("out", 7, 37)).toBe(30);
    expect(previewAfter("count", 12, 37)).toBe(12);
  });

  it("is null without a valid amount and negative when out exceeds stock", () => {
    expect(previewAfter("in", null, 37)).toBeNull();
    expect(previewAfter("count", 1.5, 37)).toBeNull();
    expect(previewAfter("out", 40, 37)).toBe(-3);
  });
});
