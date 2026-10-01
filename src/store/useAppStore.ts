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
}

interface AppState {
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
}

// Không persist profile: danh tính + roles phải lấy lại từ server mỗi lần tải trang,
// bản lưu cũ từng hiện tên/roles của tài khoản trước khi người khác đăng nhập cùng máy
export const useAppStore = create<AppState>()(
  immer(set => ({
    profile: null,
    setProfile: (profile: Profile) => {
      set(state => {
        state.profile = profile;
      });
    },
    clearProfile: () =>
      set(state => {
        state.profile = null;
      })
  }))
);
