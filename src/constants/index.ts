export const PASSWORD_REGEX = /^(?=.*[!@#$%^&*.])(?=.*[A-Za-z])(?=.*\d).{8,}$/;
// Cookie không phân biệt cổng: storefront (:3030) cũng đặt "accessToken"/"refreshToken" trên localhost.
// Key riêng để phiên 2 app không đè/xóa lẫn nhau khi chạy cùng máy.
export const ACCESS_TOKEN_KEY = "cmsAccessToken";
export const REFRESH_TOKEN_KEY = "cmsRefreshToken";
