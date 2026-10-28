import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { getCookies, setCookies } from "./cookies";
import { clearSession, saveTokens } from "./session";
import axiosRequest, { ApiError } from "./request";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { refreshProfile } from "@/services/auth";

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
    vi.unstubAllGlobals();
  });

  it.each([401, 403])(
    "isolates public invitation errors (%s) from the current CMS session",
    async status => {
      useAppStore.getState().setProfile(ownerProfile);
      const calls: InternalAxiosRequestConfig[] = [];
      const refreshAPI = vi.fn(async config => ok(config, { data: tokens("new") }));
      authHandler = refreshAPI;
      apiHandler = async config => {
        calls.push(config);
        throw new AxiosError("denied", String(status), config, null, {
          ...ok(config, { message: "Invalid proof", errors: { code: "CMS_MEMBERSHIP_REQUIRED" } }),
          status
        });
      };
      await expect(
        axiosRequest.post(
          "/staff/invitations/accept",
          { token: "secret", password: "wrong" },
          {
            skipAuth: true,
            toastError: false,
            headers: { Authorization: "Bearer explicit" }
          }
        )
      ).rejects.toMatchObject({ status });
      expect(calls).toHaveLength(1);
      expect(calls[0].headers.Authorization).toBeUndefined();
      expect(refreshAPI).not.toHaveBeenCalled();
      expect(getCookies(ACCESS_TOKEN_KEY)).toBe("access-old");
      expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-old");
      expect(useAppStore.getState().profile).toEqual(ownerProfile);
      expect(errorNotification).not.toHaveBeenCalled();
    }
  );

  it("normalizes Nest string conflict codes without dropping the revision error", async () => {
    apiHandler = async config => {
      throw new AxiosError("conflict", "409", config, null, {
        ...ok(config, { message: "Vai trò vừa được thay đổi", errors: "ROLE_STALE_REVISION" }),
        status: 409
      });
    };
    await expect(axiosRequest.put("/roles/admin", {}, { toastError: false })).rejects.toMatchObject(
      {
        status: 409,
        errors: { code: "ROLE_STALE_REVISION" }
      }
    );
  });

  it("refreshes profile once after concurrent feature denial without retrying writes or losing session", async () => {
    apiHandler = async config => ok(config, { data: ownerProfile });
    await refreshProfile();
    const denied = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError("denied", "403", config, null, {
          ...ok(config, { message: "Forbidden", errors: { code: "CMS_ACCESS_DENIED" } }),
          status: 403
        })
      );
    apiHandler = vi.fn(async config =>
      config.url === "/auth/profile"
        ? ok(config, { data: staffProfile(["INVENTORY_READ"]) })
        : denied(config)
    );
    const outcomes = await Promise.allSettled([
      axiosRequest.post("/products", {}),
      axiosRequest.get("/reports/sales")
    ]);
    expect(outcomes.map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(
      vi.mocked(apiHandler).mock.calls.filter(([config]) => config.url === "/products")
    ).toHaveLength(1);
    expect(
      vi.mocked(apiHandler).mock.calls.filter(([config]) => config.url === "/auth/profile")
    ).toHaveLength(1);
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-old");
    expect(useAppStore.getState().profile?.access.permissions).toEqual(["INVENTORY_READ"]);
  });

  it("clears a real membership denial", async () => {
    useAppStore.getState().setProfile(ownerProfile);
    apiHandler = async config => {
      throw new AxiosError("denied", "403", config, null, {
        ...ok(config, { message: "Forbidden", errors: { code: "CMS_MEMBERSHIP_REQUIRED" } }),
        status: 403
      });
    };
    await expect(axiosRequest.get("/products")).rejects.toMatchObject({ status: 403 });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBeUndefined();
    expect(useAppStore.getState().profile).toBeNull();
  });

  it("ignores membership denial from an account replaced in another tab", async () => {
    let release!: () => void;
    let start!: () => void;
    const started = new Promise<void>(resolve => {
      start = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    apiHandler = async config => {
      start();
      await gate;
      throw new AxiosError("denied", "403", config, null, {
        ...ok(config, { message: "Forbidden", errors: { code: "CMS_MEMBERSHIP_REQUIRED" } }),
        status: 403
      });
    };
    const pending = axiosRequest.get("/orders");
    await started;
    const revision = useAppStore.getState().sessionRevision;
    clearSession();
    saveTokens(tokens("other-tab"));
    useAppStore.setState({ sessionRevision: revision });
    release();
    await expect(pending).rejects.toMatchObject({ status: 403 });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-other-tab");
  });

  it("does not recurse when profile itself returns feature denial", async () => {
    apiHandler = vi.fn(async config => {
      throw new AxiosError("denied", "403", config, null, {
        ...ok(config, { message: "Forbidden", errors: { code: "CMS_ACCESS_DENIED" } }),
        status: 403
      });
    });
    await expect(axiosRequest.get("/auth/profile")).rejects.toMatchObject({ status: 403 });
    expect(apiHandler).toHaveBeenCalledTimes(1);
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-old");
  });

  it("keeps the new account when an older token refresh is rejected late", async () => {
    let start!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => {
      start = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    authHandler = async config => {
      start();
      await gate;
      return fail(config, 401);
    };
    apiHandler = async config => fail(config, 401);
    const pending = axiosRequest.get("/auth/profile");
    await started;
    clearSession();
    saveTokens(tokens("new-account"));
    useAppStore.getState().setProfile(staffProfile([]));
    release();
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-new-account");
    expect(useAppStore.getState().profile?._id).toBe("staff");
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

  it("reuses cookies rotated by another tab while waiting for the browser lock", async () => {
    const locks: string[] = [];
    vi.stubGlobal("navigator", {
      locks: {
        request: async (name: string, run: () => Promise<string>) => {
          locks.push(name);
          saveTokens(tokens("winner"));
          return run();
        }
      }
    });
    authHandler = vi.fn(async config => ok(config, { data: tokens("unnecessary") }));
    apiHandler = async config =>
      bearer(config) === "Bearer access-winner" ? ok(config, { data: "ok" }) : fail(config, 401);
    await expect(axiosRequest.get("/orders")).resolves.toEqual({ data: "ok" });
    expect(locks).toHaveLength(1);
    expect(authHandler).not.toHaveBeenCalled();
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-winner");
  });

  it("does not refresh a different account after waiting for the browser lock", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, run: () => Promise<string>) => {
          clearSession();
          saveTokens(tokens("other-account"));
          return run();
        }
      }
    });
    authHandler = vi.fn(async config => ok(config, { data: tokens("unnecessary") }));
    apiHandler = async config => fail(config, 401);
    await expect(axiosRequest.get("/orders")).rejects.toMatchObject({ status: 401 });
    expect(authHandler).not.toHaveBeenCalled();
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-other-account");
  });

  it("keeps another tab's rotated session when an old refresh rejects late", async () => {
    useAppStore.getState().setProfile(ownerProfile);
    authHandler = vi.fn(async config => {
      saveTokens(tokens("winner"));
      return fail(config, 401);
    });
    apiHandler = async config =>
      bearer(config) === "Bearer access-winner" ? ok(config, { data: "ok" }) : fail(config, 401);
    await expect(axiosRequest.get("/auth/profile")).resolves.toEqual({ data: "ok" });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-winner");
    expect(useAppStore.getState().profile).toEqual(ownerProfile);
    expect(errorNotification).not.toHaveBeenCalled();
  });

  it("keeps newer cookies when an older refresh response succeeds late", async () => {
    authHandler = vi.fn(async config => {
      saveTokens(tokens("winner"));
      return ok(config, { data: tokens("older-response") });
    });
    apiHandler = async config =>
      bearer(config) === "Bearer access-winner" ? ok(config, { data: "ok" }) : fail(config, 401);
    await expect(axiosRequest.get("/orders")).resolves.toEqual({ data: "ok" });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-winner");
    expect(authHandler).toHaveBeenCalledTimes(1);
  });

  it("reuses a new access cookie for delayed 401 responses without rotating again", async () => {
    authHandler = vi.fn(async config => ok(config, { data: tokens("unnecessary") }));
    apiHandler = async config => {
      if (bearer(config) === "Bearer access-winner") return ok(config, { data: "ok" });
      saveTokens(tokens("winner"));
      return fail(config, 401);
    };
    await expect(axiosRequest.get("/orders")).resolves.toEqual({ data: "ok" });
    expect(authHandler).not.toHaveBeenCalled();
  });

  it("reuses the refresh request ID after a lost response so the server can recover it", async () => {
    const requestIds: string[] = [];
    authHandler = vi.fn(async config => {
      const body = JSON.parse(String(config.data));
      requestIds.push(body.requestId);
      if (requestIds.length === 1)
        throw new AxiosError("response lost", AxiosError.ECONNABORTED, config);
      return ok(config, { data: tokens("recovered") });
    });
    apiHandler = async config =>
      bearer(config) === "Bearer access-recovered" ? ok(config, { data: "ok" }) : fail(config, 401);
    await expect(axiosRequest.get("/orders", { toastError: false })).rejects.toMatchObject({
      name: "ApiError"
    });
    expect(getCookies(REFRESH_TOKEN_KEY)).toBe("refresh-old");
    await expect(axiosRequest.get("/orders")).resolves.toEqual({ data: "ok" });
    expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIds[1]).toBe(requestIds[0]);
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

  it("lỗi 4xx giữ `errors` của BE để caller map theo mã", async () => {
    const reject = (data: unknown) =>
      vi.fn(async (config: InternalAxiosRequestConfig) =>
        Promise.reject(
          new AxiosError("fail", "400", config, null, {
            data,
            status: 400,
            statusText: "",
            headers: {},
            config
          })
        )
      );
    apiHandler = reject({ message: "x", errors: { code: "product00016", missing: ["IMAGE"] } });
    const error = await axiosRequest.get("/a").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errors).toEqual({ code: "product00016", missing: ["IMAGE"] });
    apiHandler = reject({ message: "x", errors: ["bad"] });
    expect(((await axiosRequest.get("/a").catch(c => c)) as ApiError).errors).toBeUndefined();
  });
});
