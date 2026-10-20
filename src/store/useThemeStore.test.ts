import { afterEach, describe, expect, it, vi } from "vitest";

const KEY = "cms.themeMode";

const mockSystemDark = (dark: boolean) =>
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: dark } as MediaQueryList));

// Store đọc mode lúc import module → mỗi case nạp lại module sau khi dựng môi trường
const loadStore = async () => {
  vi.resetModules();
  return (await import("./useThemeStore")).useThemeStore;
};

describe("useThemeStore", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dùng lựa chọn đã lưu, bỏ qua cài đặt hệ điều hành", async () => {
    mockSystemDark(false);
    localStorage.setItem(KEY, "dark");
    expect((await loadStore()).getState().mode).toBe("dark");
  });

  it("giá trị lưu không hợp lệ → theo prefers-color-scheme", async () => {
    mockSystemDark(true);
    localStorage.setItem(KEY, "blue");
    expect((await loadStore()).getState().mode).toBe("dark");
    mockSystemDark(false);
    expect((await loadStore()).getState().mode).toBe("light");
  });

  it("toggleMode đảo mode và ghi lại lựa chọn", async () => {
    mockSystemDark(false);
    const store = await loadStore();
    store.getState().toggleMode();
    expect(store.getState().mode).toBe("dark");
    expect(localStorage.getItem(KEY)).toBe("dark");
    store.getState().toggleMode();
    expect(store.getState().mode).toBe("light");
    expect(localStorage.getItem(KEY)).toBe("light");
  });

  it("storage bị chặn → không crash, vẫn đổi mode trong phiên", async () => {
    mockSystemDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = await loadStore();
    expect(store.getState().mode).toBe("dark");
    store.getState().toggleMode();
    expect(store.getState().mode).toBe("light");
  });
});
