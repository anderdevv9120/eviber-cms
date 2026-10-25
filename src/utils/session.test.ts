import { ownerProfile } from "@/test/access-fixtures";
import { afterEach, describe, expect, it } from "vitest";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { useAppStore } from "@/store/useAppStore";
import { getCookies, setCookies } from "./cookies";
import { clearSession, hasSession, saveTokens } from "./session";

const HOUR_MS = 60 * 60 * 1000;

describe("session util", () => {
  afterEach(() => clearSession());

  it("saveTokens ghi cả 2 cookie; hasSession đúng khi còn access HOẶC refresh", () => {
    expect(hasSession()).toBe(false);
    saveTokens({
      accessToken: "a",
      refreshToken: "r",
      accessExpiresIn: HOUR_MS,
      refreshExpiresIn: 24 * HOUR_MS
    });
    expect(getCookies(ACCESS_TOKEN_KEY)).toBe("a");
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("r");
    expect(hasSession()).toBe(true);
  });

  it("chỉ còn refresh cookie vẫn tính là còn phiên", () => {
    setCookies(REFRESH_TOKEN_KEY, "r");
    expect(hasSession()).toBe(true);
  });

  it("clearSession xóa cookie lẫn profile trong store", () => {
    setCookies(ACCESS_TOKEN_KEY, "a");
    useAppStore.getState().setProfile({
      _id: "1",
      email: "a@b.c",
      phone: "",
      status: "VERIFIED",
      firstName: "A",
      lastName: "B",
      roles: ["SUPER_ADMIN"],
      access: ownerProfile.access
    });
    clearSession();
    expect(hasSession()).toBe(false);
    expect(useAppStore.getState().profile).toBeNull();
  });
});
