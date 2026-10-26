import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getCookies } from "./cookies";
import { clearSession, getSessionId, hasSession, saveTokens, TokenPair } from "./session";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { ADMIN_API_URL } from "@/constants/env";
import { errorNotification } from "./notification";
import { getErrorMessage } from "./getErrorMessage";
import { useAppStore } from "@/store/useAppStore";
import { refreshProfile } from "@/services/auth";

declare module "axios" {
  export interface AxiosRequestConfig {
    /** false → không notify lỗi global (caller tự hiển thị); string → message custom */
    toastError?: boolean | string;
    /** Public invitation requests must not read or mutate the CMS session. */
    skipAuth?: boolean;
  }
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _sessionRevision?: number;
  _sessionId?: string;
}

// BE treo (không sập) thì request không bao giờ trả về → nút submit/spinner quay vô hạn.
// Endpoint chậm có chủ đích (upload lớn) tự truyền `timeout` riêng trong config.
const REQUEST_TIMEOUT_MS = 15_000;
const NETWORK_ERROR_MESSAGE = "Không thể kết nối đến máy chủ, vui lòng thử lại";
const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn";

/** Lỗi API chuẩn hóa: `.message` là chuỗi hiển thị, `.status` để caller rẽ nhánh */
export class ApiError extends Error {
  status?: number;
  messages: string | string[];
  /** `errors` của BE (`{ code, ...details }`) để caller map lỗi theo mã */
  errors?: ApiErrorDetails;

  constructor(messages: string | string[], status?: number, errors?: ApiErrorDetails) {
    super(Array.isArray(messages) ? String(messages[0] ?? "") : messages);
    this.name = "ApiError";
    this.messages = messages;
    this.status = status;
    this.errors = errors;
  }
}

export type ApiErrorDetails = { code?: string } & Record<string, unknown>;

interface RefreshSubscriber {
  onSuccess: (token: string) => void;
  onFailure: (error: unknown) => void;
}

let isRefreshing = false;
let refreshSubscribers: RefreshSubscriber[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(subscriber => subscriber.onSuccess(token));
  refreshSubscribers = [];
};

const onRefreshFailed = (error: unknown) => {
  refreshSubscribers.forEach(subscriber => subscriber.onFailure(error));
  refreshSubscribers = [];
};

// Endpoint auth không được trigger refresh flow khi trả 401. Logout mang refresh token trong body:
// refresh rồi retry sẽ gửi lại token CŨ (đã bị rotate) → phiên mới mồ côi trên server.
const REFRESH_EXCLUDED_PATHS = ["/auth/login", "/auth/refresh-token", "/auth/logout"];

// Gọi bằng axios thuần để không đi lại vòng interceptor này
const performRefresh = async (): Promise<string> => {
  const revision = useAppStore.getState().sessionRevision;
  const sessionId = getSessionId();
  const refreshToken = getCookies(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401);
  }
  const { data } = await axios.post<{ data: TokenPair }>(
    `${ADMIN_API_URL}/auth/refresh-token`,
    { refreshToken },
    { timeout: REQUEST_TIMEOUT_MS }
  );
  // Đăng xuất chen vào lúc refresh đang bay: ghi cookie mới là hồi sinh phiên vừa đăng xuất,
  // nên bỏ cặp token này và thu hồi luôn phiên vừa được cấp trên server
  if (
    getCookies(REFRESH_TOKEN_KEY) !== refreshToken ||
    useAppStore.getState().sessionRevision !== revision ||
    getSessionId() !== sessionId
  ) {
    void axios
      .post(
        `${ADMIN_API_URL}/auth/logout`,
        { refreshToken: data.data.refreshToken },
        { timeout: REQUEST_TIMEOUT_MS }
      )
      .catch(() => undefined);
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401);
  }
  saveTokens(data.data);
  return data.data.accessToken;
};

type ToastOption = boolean | string | undefined;

const notify = (option: ToastOption, message: string) => {
  if (option === false) return;
  errorNotification(typeof option === "string" ? option : message);
};

const UNREACHABLE_CODES: Array<string | undefined> = [
  AxiosError.ERR_NETWORK,
  AxiosError.ECONNABORTED,
  AxiosError.ETIMEDOUT
];

const toApiError = (error: AxiosError): ApiError => {
  if (UNREACHABLE_CODES.includes(error.code)) {
    return new ApiError(NETWORK_ERROR_MESSAGE);
  }
  const data = error.response?.data as
    { message?: string | string[]; errors?: unknown } | undefined;
  const errors =
    typeof data?.errors === "string"
      ? { code: data.errors }
      : data?.errors && typeof data.errors === "object" && !Array.isArray(data.errors)
        ? (data.errors as ApiErrorDetails)
        : undefined;
  return new ApiError(data?.message ?? error.message, error.response?.status, errors);
};

const axiosRequest = axios.create({
  baseURL: ADMIN_API_URL,
  timeout: REQUEST_TIMEOUT_MS
});

axiosRequest.interceptors.request.use(config => {
  if (config.skipAuth) {
    config.headers.delete("Authorization");
    return config;
  }
  (config as RetriableRequestConfig)._sessionRevision ??= useAppStore.getState().sessionRevision;
  (config as RetriableRequestConfig)._sessionId ??= getSessionId();
  const token = getCookies(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosRequest.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const requestUrl = originalRequest?.url ?? "";
    const isRefreshExcluded = REFRESH_EXCLUDED_PATHS.some(path => requestUrl.includes(path));
    const isCurrentSession = () =>
      originalRequest?._sessionRevision === useAppStore.getState().sessionRevision &&
      originalRequest?._sessionId === getSessionId();

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest.skipAuth &&
      isCurrentSession() &&
      !originalRequest._retry &&
      !isRefreshExcluded
    ) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await performRefresh();
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          onRefreshed(newToken);
          return axiosRequest(originalRequest);
        } catch (refreshError) {
          const apiError = axios.isAxiosError(refreshError)
            ? toApiError(refreshError)
            : refreshError instanceof ApiError
              ? refreshError
              : new ApiError(getErrorMessage(refreshError));
          // Chỉ 401/403 là phiên thực sự bị từ chối → dọn phiên; lỗi transient giữ cookie để thử lại
          if ((apiError.status === 401 || apiError.status === 403) && isCurrentSession()) {
            // 401 về muộn sau khi phiên đã bị dọn (hoặc user vừa đăng xuất) không báo "hết hạn" lần nữa
            const hadSession = hasSession();
            clearSession();
            if (hadSession) errorNotification(SESSION_EXPIRED_MESSAGE);
          } else if (isCurrentSession()) {
            notify(originalRequest.toastError, apiError.message);
          }
          onRefreshFailed(apiError);
          return Promise.reject(apiError);
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve, reject) => {
        refreshSubscribers.push({
          onSuccess: newToken => {
            if (!isCurrentSession()) {
              reject(new ApiError(SESSION_EXPIRED_MESSAGE, 401));
              return;
            }
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(axiosRequest(originalRequest));
          },
          onFailure: reject
        });
      });
    }

    const apiError = toApiError(error);
    if (apiError.status === 403 && !originalRequest?.skipAuth && isCurrentSession()) {
      if (apiError.errors?.code === "CMS_MEMBERSHIP_REQUIRED") {
        clearSession();
      } else if (
        apiError.errors?.code === "CMS_ACCESS_DENIED" &&
        !requestUrl.includes("/auth/profile")
      ) {
        // Refresh authority once; a rejected write must never be replayed.
        await refreshProfile(true).catch(() => undefined);
      }
    }
    if (!axios.isCancel(error) && error.code !== AxiosError.ERR_CANCELED) {
      notify(error.config?.toastError, apiError.message);
    }
    return Promise.reject(apiError);
  }
);

export default axiosRequest;
