import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/payment-settings";
import PaymentSettingsPage from "./index";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/payment-settings", () => ({
  getPaymentSettingsAPI: vi.fn(),
  savePaymentSettingsAPI: vi.fn(),
  testPaymentConnectionAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const configured: api.PaymentSettings = {
  status: "configured",
  clientId: "client-123",
  apiKeyLast4: "9876",
  checksumKeyLast4: "5432",
  linkTtlMinutes: 15,
  revision: 3,
  updatedAt: "2026-10-24T03:00:00.000Z",
  updatedBy: "admin@demo.local",
  webhookUrl: "https://api.shop.test/api/v1/payments/payos/webhook"
};
const empty: api.PaymentSettings = {
  ...configured,
  status: "not_configured",
  clientId: null,
  apiKeyLast4: null,
  checksumKeyLast4: null,
  revision: 0,
  updatedAt: null,
  updatedBy: null
};
const ok = <T,>(data: T) => ({ data, message: "success" });
const setup = () =>
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PaymentSettingsPage />
      </ConfigProvider>
    </StrictMode>
  );
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = async (label: string, value: string) =>
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });

describe("payment settings page", () => {
  beforeEach(() => {
    vi.mocked(api.getPaymentSettingsAPI).mockReset().mockResolvedValue(ok(configured));
    vi.mocked(api.savePaymentSettingsAPI)
      .mockReset()
      .mockImplementation(async input =>
        ok({ ...configured, linkTtlMinutes: input.linkTtlMinutes, revision: input.revision + 1 })
      );
    vi.mocked(api.testPaymentConnectionAPI)
      .mockReset()
      .mockResolvedValue(ok({ ok: true }));
  });

  it("shows the saved key set read-only and saves only the QR lifetime when keys are untouched", async () => {
    setup();
    expect(await screen.findByText("Đã cấu hình")).toBeTruthy();
    const saved = within(screen.getByRole("region", { name: "Bộ key payOS đang lưu" }));
    expect(saved.getByText("client-123")).toBeTruthy();
    expect(saved.getByText("••••••••••••9876")).toBeTruthy();
    expect(saved.getByText("••••••••••••5432")).toBeTruthy();
    expect(screen.queryByLabelText("API Key")).toBeNull();

    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.savePaymentSettingsAPI).toHaveBeenCalledWith({ linkTtlMinutes: 15, revision: 3 })
    );
  });

  it("opens the new key set on demand, keeps blank fields and cancels back to the saved set", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    click("Đổi bộ key");
    const apiKey = (await screen.findByLabelText("API Key")) as HTMLInputElement;
    expect(apiKey.value).toBe("");
    expect(apiKey.placeholder).toBe("Giữ ••••9876 nếu để trống");
    expect(((await screen.findByLabelText("Client ID")) as HTMLInputElement).placeholder).toBe(
      "Giữ client-123 nếu để trống"
    );

    await type("API Key", "api-rotated");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.savePaymentSettingsAPI).toHaveBeenCalledWith({
        clientId: "",
        apiKey: "api-rotated",
        checksumKey: undefined,
        linkTtlMinutes: 15,
        revision: 3
      })
    );
    expect(await screen.findByRole("region", { name: "Bộ key payOS đang lưu" })).toBeTruthy();

    click("Đổi bộ key");
    await type("API Key", "will-be-discarded");
    click("Hủy đổi");
    expect(await screen.findByRole("region", { name: "Bộ key payOS đang lưu" })).toBeTruthy();
    click("Đổi bộ key");
    expect(((await screen.findByLabelText("API Key")) as HTMLInputElement).value).toBe("");
  });

  it("requires all three keys before the first save", async () => {
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(ok(empty));
    setup();
    expect(await screen.findByText("Chưa cấu hình")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đổi bộ key" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hủy đổi" })).toBeNull();
    await type("Client ID", "client-new");
    click("Lưu cấu hình");
    expect((await screen.findAllByText("Vui lòng nhập key")).length).toBe(2);
    expect(api.savePaymentSettingsAPI).not.toHaveBeenCalled();

    await type("API Key", "api-new");
    await type("Checksum Key", "checksum-new");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.savePaymentSettingsAPI).toHaveBeenCalledWith({
        clientId: "client-new",
        apiKey: "api-new",
        checksumKey: "checksum-new",
        linkTtlMinutes: 15,
        revision: 0
      })
    );
  });

  it("tests the saved keys, or the keys being typed, and shows payOS's verdict", async () => {
    vi.mocked(api.testPaymentConnectionAPI)
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(
        ok({ ok: false, reason: "rejected", message: "Thông tin truyền lên không đúng" })
      );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Kiểm tra kết nối");
    expect(await screen.findByText(/Kết nối payOS thành công/)).toBeTruthy();
    expect(api.testPaymentConnectionAPI).toHaveBeenLastCalledWith({});

    click("Đổi bộ key");
    await type("API Key", "typed-key");
    click("Kiểm tra kết nối");
    expect(await screen.findByText(/payOS từ chối: Thông tin truyền lên không đúng/)).toBeTruthy();
    expect(api.testPaymentConnectionAPI).toHaveBeenLastCalledWith({
      clientId: "",
      apiKey: "typed-key",
      checksumKey: undefined
    });
  });

  it("tells payOS not answering apart from payOS rejecting the keys", async () => {
    vi.mocked(api.testPaymentConnectionAPI).mockResolvedValue(
      ok({ ok: false, reason: "unreachable", message: "Request timed out." })
    );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Kiểm tra kết nối");
    expect(
      await screen.findByText("Chưa kiểm tra được: payOS chưa phản hồi (Request timed out.)")
    ).toBeTruthy();
    expect(screen.queryByText(/payOS từ chối/)).toBeNull();
  });

  it("shows why a new key set was not saved when payOS rejects it", async () => {
    vi.mocked(api.savePaymentSettingsAPI).mockRejectedValue(
      new ApiError("payOS từ chối bộ key này, chưa lưu: Thông tin truyền lên không đúng", 400)
    );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Đổi bộ key");
    await type("API Key", "wrong-key");
    click("Lưu cấu hình");
    expect(
      await screen.findByText("payOS từ chối bộ key này, chưa lưu: Thông tin truyền lên không đúng")
    ).toBeTruthy();
    expect(screen.getByLabelText("API Key")).toBeTruthy();
  });

  it("tells a server that cannot be reached apart from payOS rejecting the keys", async () => {
    vi.mocked(api.testPaymentConnectionAPI).mockRejectedValue(
      new ApiError("Không thể kết nối đến máy chủ, vui lòng thử lại")
    );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Kiểm tra kết nối");
    expect(
      await screen.findByText("Chưa kiểm tra được: Không thể kết nối đến máy chủ, vui lòng thử lại")
    ).toBeTruthy();
    expect(screen.queryByText(/payOS từ chối/)).toBeNull();
  });

  it("stops saving on a stale revision and offers a reload", async () => {
    vi.mocked(api.savePaymentSettingsAPI).mockRejectedValue(new ApiError("stale", 409));
    setup();
    await screen.findByText("Đã cấu hình");
    click("Lưu cấu hình");
    expect(await screen.findByText(/vừa được người khác thay đổi/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu cấu hình" }).hasAttribute("disabled")).toBe(
      true
    );

    const callsBefore = vi.mocked(api.getPaymentSettingsAPI).mock.calls.length;
    click("Tải lại");
    await waitFor(() => expect(api.getPaymentSettingsAPI).toHaveBeenCalledTimes(callsBefore + 1));
  });

  it("shows the latest QR lifetime after reloading on a stale revision", async () => {
    vi.mocked(api.savePaymentSettingsAPI).mockRejectedValue(new ApiError("stale", 409));
    setup();
    await screen.findByText("Đã cấu hình");
    click("Lưu cấu hình");
    await screen.findByText(/vừa được người khác thay đổi/);
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(
      ok({ ...configured, linkTtlMinutes: 25, revision: 4 })
    );
    click("Tải lại");
    await waitFor(() =>
      expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("25")
    );
  });

  it("says the saved key set was tested when the new-key inputs are open but blank", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    click("Đổi bộ key");
    await screen.findByLabelText("API Key");
    click("Kiểm tra kết nối");
    expect(await screen.findByText(/với bộ key đang lưu/)).toBeTruthy();
    expect(api.testPaymentConnectionAPI).toHaveBeenLastCalledWith({
      clientId: "",
      apiKey: undefined,
      checksumKey: undefined
    });
  });

  it("does not carry the old client id into the next key change after re-entering keys", async () => {
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(
      ok({ ...configured, status: "undecryptable", apiKeyLast4: null, checksumKeyLast4: null })
    );
    vi.mocked(api.savePaymentSettingsAPI).mockImplementation(async input =>
      ok({ ...configured, clientId: input.clientId ?? configured.clientId, revision: 4 })
    );
    setup();
    await type("Client ID", "client-new");
    await type("API Key", "api-new");
    await type("Checksum Key", "checksum-new");
    click("Lưu cấu hình");
    await screen.findByRole("region", { name: "Bộ key payOS đang lưu" });

    click("Đổi bộ key");
    const clientId = (await screen.findByLabelText("Client ID")) as HTMLInputElement;
    expect(clientId.value).toBe("");
    expect(clientId.placeholder).toBe("Giữ client-new nếu để trống");
    click("Lưu cấu hình");
    await waitFor(() =>
      expect(api.savePaymentSettingsAPI).toHaveBeenLastCalledWith({
        clientId: "",
        apiKey: undefined,
        checksumKey: undefined,
        linkTtlMinutes: 15,
        revision: 4
      })
    );
  });

  it("ignores a connection test that was still running when the key context changed", async () => {
    let resolveTest: (value: {
      data: api.ConnectionTestResult;
      message: string;
    }) => void = () => {};
    vi.mocked(api.testPaymentConnectionAPI).mockImplementation(
      () => new Promise(resolve => (resolveTest = resolve))
    );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Kiểm tra kết nối");
    expect(screen.getByRole("button", { name: "Đổi bộ key" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Lưu cấu hình" }).hasAttribute("disabled")).toBe(
      true
    );
    resolveTest(ok({ ok: true }));
    expect(await screen.findByText(/Kết nối payOS thành công/)).toBeTruthy();

    click("Đổi bộ key");
    click("Kiểm tra kết nối");
    await type("API Key", "typed-after-test-started");
    resolveTest(ok({ ok: true }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Kiểm tra kết nối" }).className).not.toMatch(
        /ant-btn-loading/
      )
    );
    expect(screen.queryByText(/Kết nối payOS thành công/)).toBeNull();
  });

  it("names a throttled or incomplete test instead of calling it unreachable", async () => {
    vi.mocked(api.testPaymentConnectionAPI).mockRejectedValueOnce(
      new ApiError("ThrottlerException: Too Many Requests", 429)
    );
    setup();
    await screen.findByText("Đã cấu hình");
    click("Kiểm tra kết nối");
    expect(await screen.findByText(/thử quá nhiều lần/)).toBeTruthy();
    expect(screen.queryByText(/ThrottlerException/)).toBeNull();
  });

  it("validates the keys being entered before asking the server to test them", async () => {
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(ok(empty));
    setup();
    await screen.findByText("Chưa cấu hình");
    click("Kiểm tra kết nối");
    expect((await screen.findAllByText("Vui lòng nhập key")).length).toBe(2);
    expect(api.testPaymentConnectionAPI).not.toHaveBeenCalled();
  });

  it("asks to re-enter keys when the stored ones cannot be decrypted, keeping the client id", async () => {
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(
      ok({ ...configured, status: "undecryptable", apiKeyLast4: null, checksumKeyLast4: null })
    );
    setup();
    expect(await screen.findByText("Cần nhập lại key")).toBeTruthy();
    expect(((await screen.findByLabelText("Client ID")) as HTMLInputElement).value).toBe(
      "client-123"
    );
    click("Lưu cấu hình");
    expect((await screen.findAllByText("Vui lòng nhập key")).length).toBe(2);
  });

  it("shows the exact webhook URL to paste, or who to ask when the server has none", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    expect(screen.getByText("https://api.shop.test/api/v1/payments/payos/webhook")).toBeTruthy();
    expect(screen.queryByText(/PUBLIC_API_URL/)).toBeNull();
  });

  it("asks for the deployer when the server has no public address", async () => {
    vi.mocked(api.getPaymentSettingsAPI).mockResolvedValue(ok({ ...configured, webhookUrl: null }));
    setup();
    await screen.findByText("Đã cấu hình");
    expect(screen.getByText("PUBLIC_API_URL")).toBeTruthy();
    expect(screen.queryByText(/\/api\/v1\/payments\/payos\/webhook/)).toBeNull();
  });

  it("links the official payOS guides", async () => {
    setup();
    await screen.findByText("Đã cấu hình");
    const hrefs = screen
      .getAllByRole("link")
      .map(link => link.getAttribute("href"))
      .filter(Boolean);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://my.payos.vn",
        "https://payos.vn/docs/huong-dan-su-dung/tao-tai-khoan-payos",
        "https://payos.vn/docs/du-lieu-tra-ve/webhook"
      ])
    );
  });
});
