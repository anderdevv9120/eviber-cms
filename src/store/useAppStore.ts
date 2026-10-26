import type { CmsAccess } from "@/constants/permissions";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface Profile {
  _id: string;
  email: string;
  phone: string;
  status: string;
  firstName: string;
  lastName: string;
  roles: string[];
  access: CmsAccess;
}

interface AppState {
  profile: Profile | null;
  sessionRevision: number;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
}

// Không persist profile: danh tính + roles phải lấy lại từ server mỗi lần tải trang,
// bản lưu cũ từng hiện tên/roles của tài khoản trước khi người khác đăng nhập cùng máy
export const useAppStore = create<AppState>()(
  immer(set => ({
    profile: null,
    sessionRevision: 0,
    setProfile: (profile: Profile) => {
      set(state => {
        if (state.profile && state.profile._id !== profile._id) state.sessionRevision++;
        state.profile = profile;
      });
    },
    clearProfile: () =>
      set(state => {
        state.sessionRevision++;
        state.profile = null;
      })
  }))
);
