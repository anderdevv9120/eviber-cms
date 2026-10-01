import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import { getCookies, removeCookies, setCookies } from "./cookies";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** mili-giây (BE: TimeUtils.convertLifespanToMilliseconds) */
  accessExpiresIn: number;
  /** mili-giây */
  refreshExpiresIn: number;
}

export const saveTokens = (pair: TokenPair) => {
  setCookies(ACCESS_TOKEN_KEY, pair.accessToken, pair.accessExpiresIn);
  setCookies(REFRESH_TOKEN_KEY, pair.refreshToken, pair.refreshExpiresIn);
};

// Access cookie hết hạn trước refresh: còn refresh là còn phiên (request đầu 401 → interceptor tự refresh)
export const hasSession = () =>
  Boolean(getCookies(ACCESS_TOKEN_KEY) || getCookies(REFRESH_TOKEN_KEY));

export const clearSession = () => {
  removeCookies(ACCESS_TOKEN_KEY);
  removeCookies(REFRESH_TOKEN_KEY);
  useAppStore.getState().clearProfile();
};
