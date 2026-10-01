import axios from "axios";

const FALLBACK_MESSAGE = "Có lỗi xảy ra, vui lòng thử lại";

export function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (Array.isArray(err)) return String(err[0] ?? FALLBACK_MESSAGE);
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    const first = Array.isArray(msg) ? msg[0] : msg;
    return String(first ?? err.message);
  }
  if (err instanceof Error) return err.message;
  return FALLBACK_MESSAGE;
}
