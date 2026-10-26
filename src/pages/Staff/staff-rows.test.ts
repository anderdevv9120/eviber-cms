import { describe, expect, it } from "vitest";
import {
  MAX_STAFF_ROWS,
  normalizeEmail,
  parsePastedStaffRows,
  validateStaffRows,
  type StaffRowDraft
} from "./staff-rows";

const draft = (clientRowId: string, over: Partial<StaffRowDraft> = {}): StaffRowDraft => ({
  clientRowId,
  firstName: "An",
  lastName: "Nguyễn",
  email: `${clientRowId}@example.test`,
  roleId: "admin-role",
  ...over
});

describe("parsePastedStaffRows", () => {
  it("parses the pinned spreadsheet row", () => {
    expect(parsePastedStaffRows("An\tNguyễn\tan@example.test\r\n")).toEqual([
      { firstName: "An", lastName: "Nguyễn", email: "an@example.test" }
    ]);
  });

  it("accepts LF, CR and Unicode names while trimming every field", () => {
    expect(
      parsePastedStaffRows(
        "  An \t Nguyễn Thị \t an@example.test \nBùi\tTrường\ttruong@example.test\rHồ\tGia\tgia@example.test\r\n"
      )
    ).toEqual([
      { firstName: "An", lastName: "Nguyễn Thị", email: "an@example.test" },
      { firstName: "Bùi", lastName: "Trường", email: "truong@example.test" },
      { firstName: "Hồ", lastName: "Gia", email: "gia@example.test" }
    ]);
  });

  it("ignores entirely empty trailing rows", () => {
    expect(parsePastedStaffRows("An\tNguyễn\tan@example.test\r\n\r\n \t\t \n")).toEqual([
      { firstName: "An", lastName: "Nguyễn", email: "an@example.test" }
    ]);
  });

  it("never maps an extra pasted role column into authority", () => {
    expect(parsePastedStaffRows("An\tNguyễn\tan@example.test\tADMIN\tUSER_CREATE")).toEqual([
      { firstName: "An", lastName: "Nguyễn", email: "an@example.test" }
    ]);
  });

  it("surfaces short rows as missing required fields instead of shifting identity", () => {
    expect(parsePastedStaffRows("An")).toEqual([{ firstName: "An", lastName: "", email: "" }]);
  });
});

describe("validateStaffRows", () => {
  it("flags missing email, invalid email and missing role per row", () => {
    const errors = validateStaffRows([
      draft("r1", { email: " " }),
      draft("r2", { email: "không-phải-email", roleId: null })
    ]);
    expect(errors.get("r1")).toBe("Vui lòng nhập email");
    expect(errors.get("r2")).toBe("Email không hợp lệ");
    const noRole = validateStaffRows([draft("r3", { roleId: null, email: "ok@example.test" })]);
    expect(noRole.get("r3")).toBe("Chọn vai trò cho hàng này");
  });

  it("rejects duplicate emails after trim and lowercase on every duplicate row", () => {
    const errors = validateStaffRows([
      draft("r1", { email: " AN@Example.TEST " }),
      draft("r2", { email: "an@example.test" }),
      draft("r3", { email: "khac@example.test" })
    ]);
    expect(errors.get("r1")).toBe("Email bị trùng trong danh sách mời");
    expect(errors.get("r2")).toBe("Email bị trùng trong danh sách mời");
    expect(errors.has("r3")).toBe(false);
  });

  it("accepts a valid full batch of 50 rows", () => {
    const rows = Array.from({ length: MAX_STAFF_ROWS }, (_, i) =>
      draft(`r${i}`, { email: `staff${i}@example.test` })
    );
    expect(validateStaffRows(rows).size).toBe(0);
  });

  it("normalizes emails the same way the backend preflight does", () => {
    expect(normalizeEmail("  An@Example.TEST ")).toBe("an@example.test");
  });
});
