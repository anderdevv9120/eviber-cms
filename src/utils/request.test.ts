import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { getCookies, setCookies } from "./cookies";
import { clearSession } from "./session";
import axiosRequest, { ApiError } from "./request";

vi.mock("./notification", () => ({
  errorNotification: vi.fn(),
  successNotification: vi.fn()
}));
import { errorNotification } from "./notification";

type Handler = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

const ok = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config
});

const fail = (config: InternalAxiosRequestConfig, status: number): Promise<never> =>
  Promise.reject(
    new AxiosError("fail", String(status), config, null, {
      data: { message: `error ${status}` },
      status,
      statusText: "",
      headers: {},
      config
    })
  );

const tokens = (suffix: string) => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  accessExpiresIn: 60_000,
  refreshExpiresIn: 600_000
});

const bearer = (config: InternalAxiosRequestConfig) => String(config.headers.Authorization ?? "");

describe("request interceptor", () => {
  let apiHandler: Handler;
  let authHandler: Handler;
  const originalAdapter = axios.defaults.adapter;

  beforeEach(() => {
    setCookies(ACCESS_TOKEN_KEY, "access-old");
    setCookies(REFRESH_TOKEN_KEY, "refresh-old");
    axiosRequest.defaults.adapter = config => apiHandler(config);
    axios.defaults.adapter = config => authHandler(config);
    vi.mocked(errorNotification).mockClear();
  });

  afterEach(() => {
    clearSession();
    axios.defaults.adapter = originalAdapter;
  });

  it("401 → refresh 1 lần → retry bằng token mới, cookie được cập nhật", async () => {
    authHandler = vi.fn(async config => ok(config, { data: tokens("new") }));
    apiHandler = vi.fn(async config =>
      bearer(config) === "Bearer access-new" ? ok(config, { data: "profile" }) : fail(config, 401)
    );

    await expect(axiosRequest.get("/auth/profile")).resolves.toEqual({ data: "profile" });
    expect(authHandler).toHaveBeenCalledTimes(1);
    expect(getCookies(ACCESS_TOKEN_KEY)).toBe("access-new");
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-new");
  });

  it("nhiều request cùng 401 → chỉ 1 lần gọi refresh, tất cả retry thành công", async () => {
    authHandler = vi.fn(async config => ok(config, { data: tokens("new") }));
    apiHandler = vi.fn(async config =>
      bearer(config) === "Bearer access-new" ? ok(config, { data: config.url }) : fail(config, 401)
    );

    const results = await Promise.all([
      axiosRequest.get("/a"),
      axiosRequest.get("/b"),
      axiosRequest.get("/c")
    ]);
    expect(results).toEqual([{ data: "/a" }, { data: "/b" }, { data: "/c" }]);
    expect(authHandler).toHaveBeenCalledTimes(1);
  });

  it("refresh bị 401 → dọn phiên, báo hết hạn đúng 1 lần, mọi request reject ApiError 401", async () => {
    authHandler = vi.fn(async config => fail(config, 401));
    apiHandler = vi.fn(async config => fail(config, 401));

    const settled = await Promise.allSettled([axiosRequest.get("/a"), axiosRequest.get("/b")]);
    for (const result of settled) {
      expect(result.status).toBe("rejected");
      const reason = (result as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ApiError);
      expect((reason as ApiError).status).toBe(401);
    }
    expect(getCookies(REFRESH_TOKEN_KEY)).toBeUndefined();

    await expect(axiosRequest.get("/late")).rejects.toBeInstanceOf(ApiError);
    expect(errorNotification).toHaveBeenCalledTimes(1);
  });

  it("refresh lỗi 5xx → giữ cookie, reject ApiError, có thông báo", async () => {
    authHandler = vi.fn(async config => fail(config, 503));
    apiHandler = vi.fn(async config => fail(config, 401));

    await expect(axiosRequest.get("/a")).rejects.toMatchObject({ name: "ApiError", status: 503 });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-old");
    expect(errorNotification).toHaveBeenCalledTimes(1);
  });

  it("đăng xuất chen vào lúc refresh đang bay → không ghi lại cookie, thu hồi phiên vừa cấp", async () => {
    authHandler = vi.fn(async config => {
      if (String(config.url).endsWith("/auth/refresh-token")) {
        clearSession();
        return ok(config, { data: tokens("new") });
      }
      return ok(config, { data: { message: "ok" } });
    });
    apiHandler = vi.fn(async config => fail(config, 401));

    await expect(axiosRequest.get("/a")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(getCookies(ACCESS_TOKEN_KEY)).toBeUndefined();
    expect(getCookies(REFRESH_TOKEN_KEY)).toBeUndefined();
    const revoke = vi
      .mocked(authHandler)
      .mock.calls.find(([config]) => String(config.url).endsWith("/auth/logout"));
    expect(JSON.parse(String(revoke?.[0].data))).toEqual({ refreshToken: "refresh-new" });
    expect(errorNotification).not.toHaveBeenCalled();
  });

  it("login / refresh-token / logout trả 401 không kích refresh; toastError: false không thông báo", async () => {
    authHandler = vi.fn(async config => ok(config, { data: tokens("new") }));
    apiHandler = vi.fn(async config => fail(config, 401));

    for (const path of ["/auth/login", "/auth/refresh-token", "/auth/logout"]) {
      await expect(axiosRequest.post(path, {}, { toastError: false })).rejects.toBeInstanceOf(
        ApiError
      );
    }
    expect(authHandler).not.toHaveBeenCalled();
    expect(errorNotification).not.toHaveBeenCalled();
  });

  it("timeout hoặc mất mạng → ApiError với thông báo không kết nối được", async () => {
    apiHandler = vi.fn(async config =>
      Promise.reject(new AxiosError("timeout", AxiosError.ECONNABORTED, config))
    );
    await expect(axiosRequest.get("/a")).rejects.toMatchObject({
      name: "ApiError",
      message: "Không thể kết nối đến máy chủ, vui lòng thử lại"
    });
  });
});
