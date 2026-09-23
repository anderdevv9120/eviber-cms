import axios, { AxiosError, AxiosResponse } from "axios";
import { getCookies, setCookies } from "./cookies";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { refreshTokenAPI } from "@/services/auth";
import { useAppStore } from "@/store/useAppStore";

type IRequestCb = (token: string) => void;

let isRefreshing = false;
const refreshSubscribers: IRequestCb[] = [];

const subscribeTokenRefresh = (cb: IRequestCb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.map(cb => cb(token));
};

const axiosRequest = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// Add a request interceptor
axiosRequest.interceptors.request.use(
  config => {
    const token = getCookies(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add a response interceptor
axiosRequest.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  async function (error) {
    const { config } = error;
    const originalRequest = config;
    const oldRefreshToken = getCookies(REFRESH_TOKEN_KEY);

    if (error.response?.status === 401) {
      if (!oldRefreshToken) {
        useAppStore.getState().clearProfile();
        return Promise.reject(error);
      }

      if (!isRefreshing) {
        isRefreshing = true;

        try {
          // Get Refresh token
          const response = await refreshTokenAPI({ refreshToken: oldRefreshToken });
          const { accessToken, refreshToken: newRefreshToken, refreshExpiresIn } = response;
          setCookies(ACCESS_TOKEN_KEY, accessToken);
          setCookies(REFRESH_TOKEN_KEY, newRefreshToken, refreshExpiresIn);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            onRefreshed(accessToken);
            return axios(originalRequest);
          }
        } catch (error) {
          useAppStore.getState().clearProfile();
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      // Call back previously denied APIs
      return new Promise(resolve => {
        subscribeTokenRefresh((newToken: string) => {
          if (originalRequest.headers) {
            originalRequest.headers.authorization = `Bearer ${newToken}`;
          }
          resolve(axios(originalRequest));
        });
      });
    }

    if (axios.isAxiosError(error)) {
      if (error.code === AxiosError.ERR_NETWORK) {
        return Promise.reject("ERR_NETWORK_MSG");
      }
    }

    return Promise.reject(error.response.data?.message as string);
  }
);

export default axiosRequest;
