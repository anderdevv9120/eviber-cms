import { create } from "zustand";
import type { ThemeMode } from "@/constants/theme";

const THEME_KEY = "cms.themeMode";

// Storage có thể bị chặn (private mode, site data tắt) → theo cài đặt hệ điều hành, không lưu
const readThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // bỏ qua: chỉ mất phần nhớ lựa chọn
  }
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

interface ThemeState {
  mode: ThemeMode;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(set => ({
  mode: readThemeMode(),
  toggleMode: () =>
    set(state => {
      const mode = state.mode === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, mode);
      } catch {
        // bỏ qua: chỉ mất phần nhớ lựa chọn
      }
      return { mode };
    })
}));
