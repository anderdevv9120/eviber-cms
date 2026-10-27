import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export type EmailSettingsStatus = "configured" | "not_configured" | "undecryptable";

/** App Password không bao giờ về tới CMS — chỉ 4 ký tự cuối để admin nhận ra bản đang lưu */
export interface EmailSettings {
  status: EmailSettingsStatus;
  address: string | null;
  appPasswordLast4: string | null;
  senderName: string | null;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface EmailSettingsInput {
  /** Không gửi = giữ địa chỉ Gmail đang lưu */
  address?: string;
  /** Không gửi = giữ App Password đang lưu; BE tự bỏ khoảng trắng giữa 4 nhóm */
  appPassword?: string;
  senderName: string;
  /** Revision của bản đang hiển thị; lệch bản DB → 409 */
  revision: number;
}

export const getEmailSettingsAPI = (signal?: AbortSignal): Promise<ApiResponse<EmailSettings>> =>
  axiosRequest.get("/email-settings", { toastError: false, signal });

// BE đăng nhập thử Gmail trước khi lưu / gửi mail thử với timeout SMTP 10s mỗi chặng (kết nối, chào, gửi) nối
// tiếp nhau, tệ nhất ~30s. CMS bỏ cuộc trước thì BE vẫn có thể lưu xong → lần Lưu sau nhận 409 khó hiểu
const SMTP_ROUND_TRIP_TIMEOUT_MS = 45_000;

/**
 * Địa chỉ / App Password đổi → BE đăng nhập thử Gmail, chỉ lưu khi Gmail chấp nhận: từ chối → 400 `email00004`,
 * không tới được Gmail → 503 `email00005` (message BE đủ để hiển thị). Chỉ đổi tên người gửi → lưu ngay.
 */
export const saveEmailSettingsAPI = (
  input: EmailSettingsInput
): Promise<ApiResponse<EmailSettings>> =>
  axiosRequest.put("/email-settings", input, {
    toastError: false,
    timeout: SMTP_ROUND_TRIP_TIMEOUT_MS
  });

/**
 * Gửi 1 mail mẫu bằng cấu hình ĐÃ LƯU tới email của admin đang đăng nhập (BE tự lấy, không nhận người nhận).
 * 400 `email00001` = chưa cấu hình; 400 `email00006` = Gmail không nhận gửi (message kèm lý do của Gmail); 429 = quá 5 lần/phút.
 */
export const sendTestEmailAPI = (): Promise<ApiResponse<{ sentTo: string }>> =>
  axiosRequest.post("/email-settings/test-send", undefined, {
    toastError: false,
    timeout: SMTP_ROUND_TRIP_TIMEOUT_MS
  });
