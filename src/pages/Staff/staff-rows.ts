import { EMAIL_INVALID_MESSAGE, EMAIL_REQUIRED_MESSAGE } from "@/constants/validate";

export const MAX_STAFF_ROWS = 50;

export interface ParsedStaffRow {
  firstName: string;
  lastName: string;
  email: string;
}

export interface StaffRowDraft {
  clientRowId: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string | null;
}

/** Chuẩn hóa email giống preflight backend: trim rồi lowercase */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dán thẳng từ bảng tính: mỗi dòng 3 cột tab (Tên, Họ, Email). Dòng chỉ toàn
 * khoảng trắng bị bỏ. Cột thừa (vd cột vai trò copy kèm) bị loại — vai trò
 * không bao giờ nhận từ text dán. Cột thiếu hiển thị thành trường bắt buộc
 * thiếu thay vì dịch lệ cột.
 */
export function parsePastedStaffRows(text: string): ParsedStaffRow[] {
  return text
    .split(/\r\n|\r|\n/)
    .filter(line => line.trim() !== "")
    .map(line => {
      const cells = line.split("\t");
      return {
        firstName: (cells[0] ?? "").trim(),
        lastName: (cells[1] ?? "").trim(),
        email: (cells[2] ?? "").trim()
      };
    });
}

/** Lỗi mỗi hàng trước khi gửi: map theo clientRowId để không lệch khi thêm/xóa hàng */
export function validateStaffRows(rows: StaffRowDraft[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeEmail(row.email);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const errors = new Map<string, string>();
  for (const row of rows) {
    const email = row.email.trim();
    if (!email) errors.set(row.clientRowId, EMAIL_REQUIRED_MESSAGE);
    else if (!EMAIL_PATTERN.test(email)) errors.set(row.clientRowId, EMAIL_INVALID_MESSAGE);
    else if (!row.roleId) errors.set(row.clientRowId, "Chọn vai trò cho hàng này");
    else if ((counts.get(normalizeEmail(email)) ?? 0) > 1)
      errors.set(row.clientRowId, "Email bị trùng trong danh sách mời");
  }
  return errors;
}
