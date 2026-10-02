import Cookies from "js-cookie";

const MS_PER_DAY = 86_400_000;

export function getCookies(key: string) {
  return Cookies.get(key);
}

/** maxAgeMs: mili-giây — cùng đơn vị với `*ExpiresIn` BE trả về; bỏ trống = session cookie */
export function setCookies(key: string, value: string, maxAgeMs?: number) {
  if (maxAgeMs) {
    return Cookies.set(key, value, { expires: maxAgeMs / MS_PER_DAY });
  }
  return Cookies.set(key, value);
}

export function removeCookies(key: string) {
  return Cookies.remove(key);
}
