import axiosRequest from "@/utils/request";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: number;
    refreshExpiresIn: number;
  };
  message: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  refreshExpiresIn: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export const loginAPI = async (data: LoginRequest): Promise<LoginResponse> => {
  return axiosRequest.post("/auth/login", data);
};

export const refreshTokenAPI = async (data: RefreshTokenRequest): Promise<RefreshTokenResponse> => {
  return axiosRequest.post("/auth/refresh-token", data);
};

export const forgotPasswordAPI = async (
  data: ForgotPasswordRequest
): Promise<{ message: string }> => {
  return axiosRequest.post("/auth/forgot-password", data);
};

export const resetPasswordAPI = async (
  data: ResetPasswordRequest
): Promise<{ message: string }> => {
  return axiosRequest.post("/auth/reset-password", data);
};

export const getProfileAPI = async () => {
  return axiosRequest.get("/auth/profile");
};
