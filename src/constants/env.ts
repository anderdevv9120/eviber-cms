const DEV_ADMIN_API_URL = "http://localhost:8005/admin/v1";

// Thiếu biến mà không có fallback thì axios gọi URL tương đối → dev server trả index.html 200,
// không lỗi nào nổ ra và màn treo spinner. Dev có mặc định; build production thiếu biến → rỗng,
// main.tsx chặn render và báo cấu hình.
export const ADMIN_API_URL: string =
  import.meta.env.VITE_ADMIN_API_URL || (import.meta.env.DEV ? DEV_ADMIN_API_URL : "");

const DEV_STOREFRONT_URL = "http://localhost:3030";

// Chỉ dùng cho link "Xem trên cửa hàng"; production thiếu biến thì ẩn link
export const STOREFRONT_URL: string =
  import.meta.env.VITE_STOREFRONT_URL || (import.meta.env.DEV ? DEV_STOREFRONT_URL : "");
