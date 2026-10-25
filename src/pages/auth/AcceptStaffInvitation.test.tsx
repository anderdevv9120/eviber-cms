import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { routes } from "@/router";
import axiosRequest from "@/utils/request";
import * as session from "@/utils/session";
import { setCookies, getCookies } from "@/utils/cookies";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { deferred, response } from "@/test/attribute-fixtures";
import { ownerProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/utils/notification", () => ({
  errorNotification: vi.fn(),
  successNotification: vi.fn()
}));
import { errorNotification, successNotification } from "@/utils/notification";

const token = "a".repeat(64);
const pending = {
  state: "pending",
  email: "invitee@example.test",
  roleName: "Nhân viên kho",
  expiresAt: "2026-10-27T00:00:00.000Z",
  passwordMode: "set"
};
let preview: object;
let calls: InternalAxiosRequestConfig[];
let acceptAPI = vi.fn(async (config: InternalAxiosRequestConfig) =>
  response(config, { state: "accepted" })
);
let refreshAPI: ReturnType<typeof vi.spyOn>;
let saveTokens: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  session.clearSession();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", `/auth/staff-invitation#token=${token}`);
  preview = pending;
  calls = [];
  acceptAPI = vi.fn(async (config: InternalAxiosRequestConfig) =>
    response(config, { state: "accepted" })
  );
  refreshAPI = vi.spyOn(axios, "post");
  saveTokens = vi.spyOn(session, "saveTokens");
  axiosRequest.defaults.adapter = async config => {
    calls.push(config);
    if (config.url === "/staff/invitations/preview") return response(config, preview);
    if (config.url === "/staff/invitations/accept") return acceptAPI(config);
    if (config.url === "/auth/profile") return response(config, ownerProfile);
    if (config.url === "/auth/logout") return response(config, { message: "ok" });
    throw new Error(`Unexpected request: ${config.url}`);
  };
});

const open = () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/auth/staff-invitation"] });
  const view = render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  return { router, ...view };
};
const fill = (password = "Secure123!") => {
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), { target: { value: password } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Chấp nhận lời mời$/ }));
const loggedIn = () => {
  setCookies(ACCESS_TOKEN_KEY, "other-access");
  setCookies(REFRESH_TOKEN_KEY, "other-refresh");
};

describe("public staff invitation acceptance", () => {
  it("serves new/passwordless invitees, removes the fragment and never saves a login session", async () => {
    const { router } = open();
    const password = await screen.findByLabelText("Mật khẩu mới");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
    expect(screen.getByText(pending.email)).toBeTruthy();
    expect(screen.getByText(pending.roleName)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fill();
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(JSON.parse(acceptAPI.mock.calls[0][0].data)).toEqual({ token, password: "Secure123!" });
    expect(screen.getByRole("link", { name: "Đăng nhập CMS" }).getAttribute("href")).toBe(
      "/auth/login"
    );
    expect(router.state.location.pathname).toBe("/auth/staff-invitation");
    expect(saveTokens).not.toHaveBeenCalled();
    expect(refreshAPI).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(token);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("uses current-password proof without applying new-password policy", async () => {
    preview = { ...pending, passwordMode: "existing" };
    open();
    const password = await screen.findByLabelText("Mật khẩu hiện tại");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(screen.queryByLabelText("Xác nhận mật khẩu")).toBeNull();
    fireEvent.change(password, { target: { value: " old " } });
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(JSON.parse(acceptAPI.mock.calls[0][0].data).password).toBe(" old ");
  });

  it("validates the new password and matching confirmation before sending", async () => {
    open();
    await screen.findByLabelText("Mật khẩu mới");
    submit();
    await screen.findByText("Vui lòng nhập mật khẩu");
    expect(acceptAPI).not.toHaveBeenCalled();
    fill("weak");
    submit();
    await screen.findByText(/Mật khẩu phải có ít nhất/);
    expect(acceptAPI).not.toHaveBeenCalled();
    fill();
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), {
      target: { value: "Different123!" }
    });
    submit();
    await screen.findByText("Mật khẩu xác nhận không khớp");
    expect(acceptAPI).not.toHaveBeenCalled();
  });

  it("rejects new passwords without uppercase letters under the shared-account policy", async () => {
    open();
    await screen.findByLabelText("Mật khẩu mới");
    fill("abcdef1!");
    submit();
    await screen.findByText(/chữ thường, chữ hoa/);
    expect(acceptAPI).not.toHaveBeenCalled();
  });

  it("accepts question-mark passwords allowed by the shared-account policy", async () => {
    open();
    await screen.findByLabelText("Mật khẩu mới");
    fill("Abcdef1?");
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(JSON.parse(acceptAPI.mock.calls[0][0].data).password).toBe("Abcdef1?");
  });

  it("refreshes password mode after rejection when the invitee creates an account after preview", async () => {
    acceptAPI.mockImplementationOnce(async config => {
      preview = { ...pending, passwordMode: "existing" };
      throw new AxiosError("proof changed", "400", config, null, {
        ...response(config, null),
        status: 400,
        data: { message: "Invalid proof" }
      });
    });
    open();
    await screen.findByLabelText("Mật khẩu mới");
    fill();
    submit();
    const password = await screen.findByLabelText("Mật khẩu hiện tại");
    expect((password as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("Xác nhận mật khẩu")).toBeNull();
    expect(acceptAPI).toHaveBeenCalledTimes(1);
    fireEvent.change(password, { target: { value: " old " } });
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(acceptAPI).toHaveBeenCalledTimes(2);
    expect(JSON.parse(acceptAPI.mock.calls[1][0].data).password).toBe(" old ");
  });

  it.each([
    ["expired", "Lời mời đã hết hạn"],
    ["unusable", "Lời mời không còn sử dụng được"],
    ["already_accepted", "Lời mời đã được chấp nhận"]
  ])("presents the %s link state without a password form", async (state, text) => {
    preview = { state };
    open();
    await screen.findByText(text);
    expect(screen.queryByRole("button", { name: /Chấp nhận lời mời$/ })).toBeNull();
    expect(acceptAPI).not.toHaveBeenCalled();
  });

  it("asks users to reopen the email after reload without the fragment", async () => {
    window.history.replaceState({}, "", "/auth/staff-invitation");
    open();
    await screen.findByText(/Mở lại liên kết trong email/);
    expect(calls).toHaveLength(0);
  });

  it("keeps wrong-password errors inline and redacts raw server errors", async () => {
    preview = { ...pending, passwordMode: "existing" };
    acceptAPI.mockImplementation(async config => {
      throw new AxiosError("bad proof", "400", config, null, {
        ...response(config, null),
        status: 400,
        data: { message: `secret ${token}` }
      });
    });
    open();
    fireEvent.change(await screen.findByLabelText("Mật khẩu hiện tại"), {
      target: { value: "wrong" }
    });
    submit();
    await screen.findByText(/Không thể chấp nhận lời mời/);
    expect(document.body.textContent).not.toContain(token);
    expect(errorNotification).not.toHaveBeenCalled();
    expect(successNotification).not.toHaveBeenCalled();
    expect(refreshAPI).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("loads the cookie account before enabling acceptance and requires explicit sign-out on mismatch", async () => {
    loggedIn();
    useAppStore.getState().setProfile({ ...ownerProfile, email: pending.email });
    const profile = deferred<ReturnType<typeof response>>();
    const adapter = axiosRequest.defaults.adapter;
    axiosRequest.defaults.adapter = config =>
      config.url === "/auth/profile"
        ? profile.promise
        : (adapter as (c: InternalAxiosRequestConfig) => Promise<ReturnType<typeof response>>)(
            config
          );
    open();
    await screen.findByText(pending.email);
    expect(
      (screen.getByRole("button", { name: /Chấp nhận lời mời$/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(acceptAPI).not.toHaveBeenCalled();
    await act(async () =>
      profile.resolve(response({} as InternalAxiosRequestConfig, ownerProfile))
    );
    await screen.findByText(/Bạn đang đăng nhập bằng tài khoản khác/);
    expect(acceptAPI).not.toHaveBeenCalled();
    expect(getCookies(ACCESS_TOKEN_KEY)).toBe("other-access");
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất CMS để tiếp tục" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Chấp nhận lời mời$/ }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    fill();
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(calls.some(c => c.url === "/auth/logout")).toBe(true);
    expect(saveTokens).not.toHaveBeenCalled();
    expect(refreshAPI).not.toHaveBeenCalled();
  });

  it("keeps acceptance disabled after profile failure and permits retry", async () => {
    loggedIn();
    const adapter = axiosRequest.defaults.adapter;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/auth/profile")
        throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
      return (adapter as (c: InternalAxiosRequestConfig) => Promise<ReturnType<typeof response>>)(
        config
      );
    };
    open();
    await screen.findByText(/Không thể xác minh tài khoản CMS/);
    expect(
      (screen.getByRole("button", { name: /Chấp nhận lời mời$/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(acceptAPI).not.toHaveBeenCalled();
    axiosRequest.defaults.adapter = adapter;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText(/Bạn đang đăng nhập bằng tài khoản khác/);
  });

  it("allows the matching cookie account and preserves its session", async () => {
    loggedIn();
    preview = { ...pending, email: ownerProfile.email.toUpperCase() };
    open();
    await screen.findByLabelText("Mật khẩu mới");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Chấp nhận lời mời$/ }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    fill();
    submit();
    await screen.findByText("Đã chấp nhận lời mời");
    expect(getCookies(ACCESS_TOKEN_KEY)).toBe("other-access");
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("checks for a session created in another tab before accepting", async () => {
    open();
    await screen.findByLabelText("Mật khẩu mới");
    fill();
    loggedIn();
    submit();
    await screen.findByText(/Bạn đang đăng nhập bằng tài khoản khác/);
    expect(acceptAPI).not.toHaveBeenCalled();
  });

  it("sends only one acceptance while a submission is in flight", async () => {
    const result = deferred<ReturnType<typeof response>>();
    acceptAPI.mockImplementation(() => result.promise);
    open();
    await screen.findByLabelText("Mật khẩu mới");
    fill();
    submit();
    submit();
    await waitFor(() => expect(acceptAPI).toHaveBeenCalledTimes(1));
    submit();
    await act(async () =>
      result.resolve(response({} as InternalAxiosRequestConfig, { state: "already_accepted" }))
    );
    await screen.findByText("Lời mời đã được chấp nhận");
    expect(acceptAPI).toHaveBeenCalledTimes(1);
  });
});
