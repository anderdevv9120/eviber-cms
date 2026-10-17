import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";

// Backend `error-code.const.ts` category codes
export const CATEGORY_ERROR = {
  NOT_FOUND: "sys00005",
  NAME_EXISTED: "sys00006",
  SLUG_TAKEN: "category00001",
  SLUG_INVALID: "category00002",
  STALE_REVISION: "category00003",
  IN_USE: "category00004",
  ORDER_STALE: "category00005"
} as const;

export interface CategoryErrorView {
  field?: "name" | "slug";
  message: string;
  stale?: boolean;
  inUse?: { productCount: number; couponCount: number };
}

const count = (value: unknown) => (typeof value === "number" ? value : 0);

export function toCategoryErrorView(error: unknown): CategoryErrorView {
  const details = error instanceof ApiError ? error.errors : undefined;
  switch (details?.code) {
    case CATEGORY_ERROR.NAME_EXISTED:
      return { field: "name", message: "Tên danh mục đã tồn tại" };
    case CATEGORY_ERROR.SLUG_TAKEN:
      return { field: "slug", message: "Slug đã được dùng" };
    case CATEGORY_ERROR.SLUG_INVALID:
      return { field: "slug", message: "Slug không hợp lệ" };
    case CATEGORY_ERROR.STALE_REVISION:
      return { stale: true, message: "Danh mục đã được người khác sửa" };
    case CATEGORY_ERROR.IN_USE: {
      const productCount = count(details?.productCount);
      const couponCount = count(details?.couponCount);
      return {
        inUse: { productCount, couponCount },
        message: `Không thể xóa: đang dùng bởi ${productCount} sản phẩm (kể cả đã lưu trữ) và ${couponCount} voucher`
      };
    }
    default:
      return { message: getErrorMessage(error) };
  }
}
