import axiosRequest from "@/utils/request";
import type { Profile } from "@/store/useAppStore";
import type { TokenPair } from "@/utils/session";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export const loginAPI = (data: LoginRequest): Promise<ApiResponse<TokenPair>> => {
  return axiosRequest.post("/auth/login", data, { toastError: false });
};

export const logoutAPI = (data: RefreshTokenRequest): Promise<ApiResponse<{ message: string }>> => {
  return axiosRequest.post("/auth/logout", data, { toastError: false });
};

export const getProfileAPI = (): Promise<ApiResponse<Profile>> => {
  return axiosRequest.get("/auth/profile");
};
