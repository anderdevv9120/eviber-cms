import { ADMIN_API_URL } from "@/constants/env";

/** Upload trả path tương đối (`/images/x.jpg`) do backend serve — ghép origin admin API để xem trước. */
export function resolveImageUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || !ADMIN_API_URL) return src;
  return new URL(src, ADMIN_API_URL).toString();
}
