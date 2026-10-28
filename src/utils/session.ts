import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import { getCookies, removeCookies, setCookies } from "./cookies";

const SESSION_ID_KEY = "cmsSessionId";
const REFRESH_REQUEST_ID_KEY = "cmsRefreshRequestId";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** mili-giây (BE: TimeUtils.convertLifespanToMilliseconds) */
  accessExpiresIn: number;
  /** mili-giây */
  refreshExpiresIn: number;
}

export const saveTokens = (pair: TokenPair) => {
  setCookies(
    SESSION_ID_KEY,
    getCookies(SESSION_ID_KEY) ?? crypto.randomUUID(),
    pair.refreshExpiresIn
  );
  setCookies(ACCESS_TOKEN_KEY, pair.accessToken, pair.accessExpiresIn);
  setCookies(REFRESH_TOKEN_KEY, pair.refreshToken, pair.refreshExpiresIn);
  removeCookies(REFRESH_REQUEST_ID_KEY);
};

export const getRefreshRequestId = (): string => {
  const existing = getCookies(REFRESH_REQUEST_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  // Keep the same request ID across a lost response or page reload during the server retry window.
  setCookies(REFRESH_REQUEST_ID_KEY, id, 60_000);
  return id;
};

// Access cookie hết hạn trước refresh: còn refresh là còn phiên (request đầu 401 → interceptor tự refresh)
export const hasSession = () =>
  Boolean(getCookies(ACCESS_TOKEN_KEY) || getCookies(REFRESH_TOKEN_KEY));

// Shared across tabs and stable through token rotation; contains no profile or permissions.
export const getSessionId = (): string | undefined => {
  if (!hasSession()) return undefined;
  const existing = getCookies(SESSION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  setCookies(SESSION_ID_KEY, id);
  return id;
};

export const clearSession = () => {
  removeCookies(REFRESH_REQUEST_ID_KEY);
  removeCookies(SESSION_ID_KEY);
  removeCookies(ACCESS_TOKEN_KEY);
  removeCookies(REFRESH_TOKEN_KEY);
  useAppStore.getState().clearProfile();
};
