export const SAVED_MESSAGE = "Đã lưu. Cửa hàng cập nhật trong tối đa 5 phút.";
export const CONFLICT_MESSAGE = "Nội dung đã thay đổi. Tải lại để bỏ bản nháp trước khi lưu.";

export const required = (message: string) => ({ required: true, whitespace: true, message });
export const isFilled = (value: unknown) => typeof value === "string" && value.trim() !== "";
