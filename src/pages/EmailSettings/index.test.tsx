import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/email-settings";
import { useAppStore } from "@/store/useAppStore";
import EmailSettingsPage from "./index";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/email-settings", () => ({
  getEmailSettingsAPI: vi.fn(),
  saveEmailSettingsAPI: vi.fn(),
  sendTestEmailAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const configured: api.EmailSettings = {
  status: "configured",
  address: "shop.ao@gmail.com",
  appPasswordLast4: "mnop",
  senderName: "Shop Áo",
  revision: 2,
  updatedAt: "2026-10-25T13:14:00.000Z",
  updatedBy: "admin@demo.local"
};
const empty: api.EmailSettings = {
  ...configured,
  status: "not_configured",
  address: null,
  appPasswordLast4: null,
  senderName: null,
  revision: 0,
  updatedAt: null,
  updatedBy: null
};
const ok = <T,>(data: T) => ({ data, message: "success" });
const setup = () =>
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <EmailSettingsPage />
      </ConfigProvider>
    </StrictMode>
  );
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = async (label: string, value: string) =>
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });

describe("email settings page", () => {
  beforeEach(() => {
    useAppStore.setState({
      profile: {
        _id: "admin-1",
        email: "admin@demo.local",
        phone: "",
        status: "VERIFIED",
        firstName: "Admin",
        lastName: "",
        roles: ["ADMIN"]
      }
    });
    vi.mocked(api.getEmailSettingsAPI).mockReset().mockResolvedValue(ok(configured));
    vi.mocked(api.saveEmailSettingsAPI)
      .mockReset()
      .mockImplementation(async input =>
        ok({ ...configured, senderName: input.senderName, revision: input.revision + 1 })
      );
    vi.mocked(api.sendTestEmailAPI)
      .mockReset()
      .mockResolvedValue(ok({ sentTo: "admin@demo.local" }));
  });

  it("shows the saved Gmail read-only and saves only the sender name when the account is untouched", async () => {
    setup();
    expect(await screen.findByText("Đã cấu hình")).toBeTruthy();
    const saved = within(screen.getByRole("region", { name: "Tài khoản Gmail đang lưu" }));
    expect(saved.getByText("shop.ao@gmail.com")).toBeTruthy();
    expect(saved.getByText("••••••••••••mnop")).toBeTruthy();
    expect(screen.queryByLabelText("App Password")).toBeNull();
    expect(((await screen.findByLabelText("Tên người gửi")) as HTMLInputElement).value).toBe(
      "Shop Áo"
    );

    await type("Tên người gửi", "Shop Áo Mới");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.saveEmailSettingsAPI).toHaveBeenCalledWith({
        senderName: "Shop Áo Mới",
        revision: 2
      })
    );
  });

  it("previews the sender name in the inbox row as the admin types", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    const inbox = within(screen.getByRole("region", { name: "Khách thấy trong hộp thư" }));
    expect(inbox.getByText("Shop Áo")).toBeTruthy();

    await type("Tên người gửi", "Tiệm Len Nhà Mây");
    await waitFor(() => expect(inbox.getByText("Tiệm Len Nhà Mây")).toBeTruthy());
    await type("Tên người gửi", "");
    await waitFor(() => expect(inbox.getByText("Tên người gửi")).toBeTruthy());
  });

  it("requires Gmail, App Password and sender name on first setup, with example placeholders", async () => {
    vi.mocked(api.getEmailSettingsAPI).mockResolvedValue(ok(empty));
    setup();
    expect(await screen.findByText("Chưa cấu hình")).toBeTruthy();
    expect(((await screen.findByLabelText("Địa chỉ Gmail")) as HTMLInputElement).placeholder).toBe(
      "tencuahang@gmail.com"
    );
    expect(((await screen.findByLabelText("App Password")) as HTMLInputElement).placeholder).toBe(
      "abcd efgh ijkl mnop"
    );
    expect(((await screen.findByLabelText("Tên người gửi")) as HTMLInputElement).placeholder).toBe(
      "Ví dụ: Shop Áo Nam Hà Nội"
    );
    expect(screen.queryByRole("button", { name: "Gửi mail thử" })).toBeNull();

    click("Lưu cấu hình");
    expect(await screen.findByText("Vui lòng nhập địa chỉ Gmail")).toBeTruthy();
    expect(await screen.findByText("Vui lòng nhập App Password")).toBeTruthy();
    expect(await screen.findByText("Vui lòng nhập tên người gửi")).toBeTruthy();
    expect(api.saveEmailSettingsAPI).not.toHaveBeenCalled();

    await type("Địa chỉ Gmail", "shop.ao@gmail.com");
    await type("App Password", "abcd efgh ijkl mnop");
    await type("Tên người gửi", "Shop Áo");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.saveEmailSettingsAPI).toHaveBeenCalledWith({
        address: "shop.ao@gmail.com",
        appPassword: "abcd efgh ijkl mnop",
        senderName: "Shop Áo",
        revision: 0
      })
    );
    expect(await screen.findByText("Đã cấu hình")).toBeTruthy();
  });

  it("changes the Gmail account on demand and cancels back to the saved one", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    click("Đổi tài khoản Gmail");
    expect(((await screen.findByLabelText("Địa chỉ Gmail")) as HTMLInputElement).value).toBe(
      "shop.ao@gmail.com"
    );
    expect(screen.queryByRole("button", { name: "Gửi mail thử" })).toBeNull();

    click("Hủy đổi");
    expect(await screen.findByRole("region", { name: "Tài khoản Gmail đang lưu" })).toBeTruthy();

    click("Đổi tài khoản Gmail");
    await type("Địa chỉ Gmail", " moi@gmail.com ");
    await type("App Password", "qrstuvwxyzabcdef");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.saveEmailSettingsAPI).toHaveBeenCalledWith({
        address: "moi@gmail.com",
        appPassword: "qrstuvwxyzabcdef",
        senderName: "Shop Áo",
        revision: 2
      })
    );
  });

  it("prefills the Gmail address and asks for the App Password again when it cannot be decrypted", async () => {
    vi.mocked(api.getEmailSettingsAPI).mockResolvedValue(
      ok({ ...configured, status: "undecryptable", appPasswordLast4: null })
    );
    setup();
    expect(await screen.findByText("Cần nhập lại App Password")).toBeTruthy();
    expect(((await screen.findByLabelText("Địa chỉ Gmail")) as HTMLInputElement).value).toBe(
      "shop.ao@gmail.com"
    );
    expect(((await screen.findByLabelText("App Password")) as HTMLInputElement).value).toBe("");
  });

  it("shows Gmail's rejection without saving, and a conflict on a stale revision", async () => {
    vi.mocked(api.getEmailSettingsAPI).mockResolvedValue(ok(empty));
    vi.mocked(api.saveEmailSettingsAPI).mockRejectedValueOnce(
      new ApiError("Gmail từ chối đăng nhập (sai App Password…), chưa lưu", 400)
    );
    setup();
    await screen.findByText("Chưa cấu hình");
    await type("Địa chỉ Gmail", "shop.ao@gmail.com");
    await type("App Password", "wrongwrongwrongw");
    await type("Tên người gửi", "Shop Áo");
    click("Lưu cấu hình");
    expect(
      await screen.findByText("Gmail từ chối đăng nhập (sai App Password…), chưa lưu")
    ).toBeTruthy();
    expect(screen.getByText("Chưa cấu hình")).toBeTruthy();

    vi.mocked(api.saveEmailSettingsAPI).mockRejectedValueOnce(new ApiError("stale", 409));
    click("Lưu cấu hình");
    expect(
      await screen.findByText("Cấu hình vừa được người khác thay đổi. Tải lại để xem bản mới nhất.")
    ).toBeTruthy();
  });

  it("sends a test mail to the signed-in admin and reports Gmail failures and throttling", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    expect(screen.getByText(/gửi tới admin@demo\.local/)).toBeTruthy();

    click("Gửi mail thử");
    expect(await screen.findByText(/Đã gửi mail thử tới admin@demo\.local/)).toBeTruthy();
    expect(api.sendTestEmailAPI).toHaveBeenCalledTimes(1);

    vi.mocked(api.sendTestEmailAPI).mockRejectedValueOnce(
      new ApiError("Gửi mail thử thất bại: 550 Daily user sending limit exceeded", 400)
    );
    click("Gửi mail thử");
    expect(await screen.findByText(/Daily user sending limit exceeded/)).toBeTruthy();

    vi.mocked(api.sendTestEmailAPI).mockRejectedValueOnce(new ApiError("Too Many Requests", 429));
    click("Gửi mail thử");
    expect(await screen.findByText("Gửi thử quá nhiều lần, chờ 1 phút rồi thử lại.")).toBeTruthy();
  });

  it("offers a retry when the settings cannot be loaded", async () => {
    // StrictMode chạy effect 2 lần (lần đầu bị abort) — reject mọi lần cho tới khi bấm Thử lại
    vi.mocked(api.getEmailSettingsAPI).mockRejectedValue(new Error("Network Error"));
    setup();
    expect(await screen.findByText("Không tải được cấu hình email")).toBeTruthy();
    vi.mocked(api.getEmailSettingsAPI).mockResolvedValue(ok(configured));
    click("Thử lại");
    expect(await screen.findByText("Đã cấu hình")).toBeTruthy();
  });
});
