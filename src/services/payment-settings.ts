import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export type PaymentSettingsStatus = "configured" | "not_configured" | "undecryptable";

/** Secret không bao giờ về tới CMS — chỉ 4 ký tự cuối để admin nhận ra key đang lưu */
export interface PaymentSettings {
  status: PaymentSettingsStatus;
  clientId: string | null;
  apiKeyLast4: string | null;
  checksumKeyLast4: string | null;
  linkTtlMinutes: number;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Webhook URL hoàn chỉnh để admin dán vào kênh payOS; null = BE chưa có PUBLIC_API_URL */
  webhookUrl: string | null;
}

/** Field key bỏ trống / không gửi = BE giữ giá trị đang lưu */
export interface PayosCredentialsInput {
  clientId?: string;
  apiKey?: string;
  checksumKey?: string;
}

export interface PaymentSettingsInput extends PayosCredentialsInput {
  /** Hạn mỗi mã QR, phút, 5–30 */
  linkTtlMinutes: number;
  /** Revision của bản đang hiển thị; lệch bản DB → 409 */
  revision: number;
}

/** `reason` khi ok = false: `rejected` = payOS từ chối key; `unreachable` = payOS không phản hồi dứt khoát */
export interface ConnectionTestResult {
  ok: boolean;
  reason?: "rejected" | "unreachable";
  message?: string;
}

export const getPaymentSettingsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<PaymentSettings>> =>
  axiosRequest.get("/payment-settings", { toastError: false, signal });

// BE chờ payOS tối đa 10s × 2 lần (PAYOS_CONFIG: timeout 10s, retry 1) — timeout mặc định 15s của
// CMS cắt trước khi BE kịp trả lời, payOS chậm bị báo nhầm thành "không kết nối được máy chủ".
// Áp cho cả lưu: đổi bộ key thì BE thử với payOS trước khi lưu
const PAYOS_ROUND_TRIP_TIMEOUT_MS = 30_000;

/**
 * Đổi bộ key → BE thử với payOS trước, chỉ lưu khi payOS chấp nhận: từ chối → 400 `sys00031`,
 * không gọi được payOS → 503 `sys00032` (message BE đã đủ để hiển thị). Chỉ đổi hạn QR → lưu ngay.
 */
export const savePaymentSettingsAPI = (
  input: PaymentSettingsInput
): Promise<ApiResponse<PaymentSettings>> =>
  axiosRequest.put("/payment-settings", input, {
    toastError: false,
    timeout: PAYOS_ROUND_TRIP_TIMEOUT_MS
  });

/**
 * Tạo rồi hủy ngay một link payOS thử; key bỏ trống dùng key đang lưu.
 * Resolve `{ ok: false, reason }` = payOS từ chối / không phản hồi; reject = CMS không tới được BE.
 */
export const testPaymentConnectionAPI = (
  input: PayosCredentialsInput
): Promise<ApiResponse<ConnectionTestResult>> =>
  axiosRequest.post("/payment-settings/test-connection", input, {
    toastError: false,
    timeout: PAYOS_ROUND_TRIP_TIMEOUT_MS
  });
