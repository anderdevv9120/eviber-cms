import { afterEach, describe, expect, it, vi } from "vitest";
import Cookies from "js-cookie";
import { getCookies, removeCookies, setCookies } from "./cookies";

describe("cookies util", () => {
  afterEach(() => {
    removeCookies("k");
    vi.restoreAllMocks();
  });

  it("set/get/remove theo key", () => {
    expect(getCookies("k")).toBeUndefined();
    setCookies("k", "v");
    expect(getCookies("k")).toBe("v");
    removeCookies("k");
    expect(getCookies("k")).toBeUndefined();
  });

  it("maxAgeMs là mili-giây (đơn vị BE trả): 7 ngày ms → expires 7 ngày", () => {
    const spy = vi.spyOn(Cookies, "set");
    setCookies("k", "v", 7 * 24 * 60 * 60 * 1000);
    expect(spy).toHaveBeenCalledWith("k", "v", { expires: 7 });
    expect(getCookies("k")).toBe("v");
  });
});
