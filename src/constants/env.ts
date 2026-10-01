const DEV_ADMIN_API_URL = "http://localhost:8001/admin/v1";

// Thiếu biến mà không có fallback thì axios gọi URL tương đối → dev server trả index.html 200,
// không lỗi nào nổ ra và màn treo spinner. Dev có mặc định; build production thiếu biến → rỗng,
// main.tsx chặn render và báo cấu hình.
export const ADMIN_API_URL: string =
  import.meta.env.VITE_ADMIN_API_URL || (import.meta.env.DEV ? DEV_ADMIN_API_URL : "");
