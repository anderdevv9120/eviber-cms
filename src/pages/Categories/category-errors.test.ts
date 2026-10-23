import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/request";
import { CATEGORY_ERROR, toCategoryErrorView } from "./category-errors";

const fail = (code: string, status = 409, details: Record<string, unknown> = {}) =>
  new ApiError("Lỗi máy chủ", status, { code, ...details });

describe("toCategoryErrorView", () => {
  it("maps name and slug codes to their fields", () => {
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.NAME_EXISTED, 409, { field: "name" }))).toEqual({
      field: "name",
      message: "Tên danh mục đã tồn tại"
    });
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.SLUG_TAKEN))).toEqual({
      field: "slug",
      message: "Slug đã được dùng"
    });
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.SLUG_INVALID, 400))).toEqual({
      field: "slug",
      message: "Slug không hợp lệ"
    });
  });

  it("marks a stale revision", () => {
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.STALE_REVISION))).toEqual({
      stale: true,
      message: "Danh mục đã được người khác sửa"
    });
  });

  it("reports in-use counts, defaulting missing ones to 0", () => {
    expect(
      toCategoryErrorView(
        fail(CATEGORY_ERROR.IN_USE, 409, { productCount: 2, couponCount: 1, comboCount: 3 })
      )
    ).toEqual({
      inUse: { productCount: 2, couponCount: 1, comboCount: 3 },
      message: "Không thể xóa: đang dùng bởi 2 sản phẩm (kể cả đã lưu trữ) và 1 voucher và 3 combo"
    });
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.IN_USE, 409, { productCount: "3" }))).toEqual({
      inUse: { productCount: 0, couponCount: 0, comboCount: 0 },
      message: "Không thể xóa: đang dùng bởi 0 sản phẩm (kể cả đã lưu trữ) và 0 voucher và 0 combo"
    });
  });

  it("falls back to the generic message for other codes and non-ApiError values", () => {
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.NOT_FOUND, 404))).toEqual({
      message: "Lỗi máy chủ"
    });
    expect(toCategoryErrorView(fail(CATEGORY_ERROR.ORDER_STALE))).toEqual({
      message: "Lỗi máy chủ"
    });
    expect(toCategoryErrorView(new ApiError("Mất kết nối"))).toEqual({ message: "Mất kết nối" });
    expect(toCategoryErrorView(new Error("boom"))).toEqual({ message: "boom" });
    expect(toCategoryErrorView(undefined)).toEqual({
      message: "Có lỗi xảy ra, vui lòng thử lại"
    });
  });
});
