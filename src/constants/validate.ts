export const MIN_PASSWORD_LENGTH = 8;

export const EMAIL_REQUIRED_MESSAGE = "Vui lòng nhập email";
export const EMAIL_INVALID_MESSAGE = "Email không hợp lệ";
export const PASSWORD_REQUIRED_MESSAGE = "Vui lòng nhập mật khẩu";
export const PASSWORD_RULE_MESSAGE = `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự, chứa ký tự đặc biệt, chữ cái và số`;

// Khớp HREF_PATTERN của banner DTO backend (dùng lại cho ô khuyến mãi, câu chuyện): path nội bộ
// (không `//` hay `/\`) hoặc https — chặn javascript:/protocol-relative
export const HREF_PATTERN = /^(\/(?![/\\])\S*|https:\/\/\S+)$/;
export const HREF_MESSAGE = "Đường dẫn phải bắt đầu bằng / hoặc https://";
export const SOCIAL_PATTERN = /^(|https:\/\/\S+)$/;
