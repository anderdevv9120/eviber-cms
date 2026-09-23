import Cookies from "js-cookie";

export function getCookies(key: string) {
  return Cookies.get(key);
}

export function setCookies(key: string, value: string, maxAge?: number) {
  if (maxAge) {
    return Cookies.set(key, value, { expires: maxAge / 86400 });
  }
  return Cookies.set(key, value);
}

export function removeCookies(key: string) {
  return Cookies.remove(key);
}
