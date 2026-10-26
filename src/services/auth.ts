import axiosRequest from "@/utils/request";
import { useAppStore, type Profile } from "@/store/useAppStore";
import { clearSession, getSessionId, hasSession } from "@/utils/session";
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
  return axiosRequest.get("/auth/profile", { toastError: false });
};

let pendingProfile: { revision: number; sessionId: string; promise: Promise<void> } | null = null;
let cachedProfile: {
  revision: number;
  sessionId: string;
  expiresAt: number;
  profile: Profile;
} | null = null;

export const isProfileFresh = (): boolean => {
  const { profile, sessionRevision } = useAppStore.getState();
  return !!(
    cachedProfile &&
    cachedProfile.profile === profile &&
    cachedProfile.revision === sessionRevision &&
    cachedProfile.sessionId === getSessionId() &&
    Date.now() < cachedProfile.expiresAt
  );
};

export const refreshProfile = (force = false): Promise<void> => {
  const revision = useAppStore.getState().sessionRevision;
  const sessionId = getSessionId();
  if (!sessionId) return Promise.resolve();
  if (pendingProfile?.revision === revision && pendingProfile.sessionId === sessionId)
    return pendingProfile.promise;
  if (!force && isProfileFresh()) return Promise.resolve();
  cachedProfile = null;
  const isCurrent = () =>
    useAppStore.getState().sessionRevision === revision &&
    getSessionId() === sessionId &&
    hasSession();
  const promise = getProfileAPI()
    .then(({ data }) => {
      if (!isCurrent()) return;
      if (!data?._id || !data.access || !Array.isArray(data.access.permissions)) {
        throw new Error("Invalid profile response");
      }
      useAppStore.getState().setProfile(data);
      cachedProfile = {
        revision: useAppStore.getState().sessionRevision,
        sessionId,
        expiresAt: Date.now() + 60 * 60 * 1000,
        profile: useAppStore.getState().profile!
      };
    })
    .catch((error: unknown) => {
      if (isCurrent() && error instanceof Error && "status" in error && error.status === 401) {
        clearSession();
      }
      throw error;
    })
    .finally(() => {
      if (pendingProfile?.promise === promise) pendingProfile = null;
    });
  pendingProfile = { revision, sessionId, promise };
  return promise;
};
