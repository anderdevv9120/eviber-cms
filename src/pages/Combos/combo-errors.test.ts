import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/request";
import { mapComboError } from "./combo-errors";

const bad = (code: string, details: Record<string, unknown> = {}) =>
  new ApiError("Lỗi combo", 400, { code, ...details });

describe("combo inline errors", () => {
  it("marks any 409 stale and maps slug/category fields", () => {
    expect(mapComboError(new ApiError("Tải lại", 409))).toEqual({
      message: "Tải lại",
      stale: true
    });
    expect(mapComboError(bad("combo00003"))).toEqual({ message: "Lỗi combo", field: ["slug"] });
    expect(mapComboError(bad("combo00004"))).toEqual({ message: "Lỗi combo", field: ["slug"] });
    expect(mapComboError(bad("combo00005"))).toEqual({
      message: "Lỗi combo",
      field: ["categoryIds"]
    });
  });
  it("maps the backend item index to its sent row without trusting unknown indices", () => {
    expect(
      mapComboError(bad("combo00006", { index: 1, reason: "VARIANT_NOT_IN_PRODUCT" }), [
        { key: "a" },
        { key: "b" }
      ])
    ).toEqual({ message: "Lỗi combo", itemKey: "b", field: ["items", 1] });
    expect(mapComboError(bad("combo00006", { index: 9 }), [{ key: "a" }])).toEqual({
      message: "Lỗi combo",
      field: ["items"]
    });
  });
  it("returns only backend publish requirements and preserves other messages", () => {
    expect(
      mapComboError(
        bad("combo00007", { missing: ["CATEGORY", "unknown", "LOCKED_VARIANT_ACTIVE"] })
      )
    ).toEqual({ message: "Lỗi combo", missing: ["CATEGORY", "LOCKED_VARIANT_ACTIVE"] });
    for (const code of ["combo00001", "combo00002", "combo00008", "combo00009", "unknown"])
      expect(mapComboError(bad(code))).toEqual({ message: "Lỗi combo" });
    expect(mapComboError(new ApiError("Mất mạng"))).toEqual({ message: "Mất mạng" });
  });
});
