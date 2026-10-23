import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/storeContent";
import StoreInfo from "./index";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/storeContent", () => ({
  getStoreInfoAPI: vi.fn(),
  saveStoreInfoAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const settings: api.Revisioned<api.StoreInfoSettings> = {
  contact: { address: "Số 8 Phạm Hùng", email: "hotro@clothes.vn", phone: "1900 0000" },
  socials: { facebook: "", instagram: "", twitter: "" },
  productPromises: ["Giao nhanh", "Đổi size", "COD"],
  revision: 3
};
const ok = <T,>(data: T) => ({ data, message: "success" });
const setup = () =>
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <StoreInfo />
      </ConfigProvider>
    </StrictMode>
  );
const save = () => fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));

describe("store info page", () => {
  beforeEach(() => {
    vi.mocked(api.getStoreInfoAPI).mockReset().mockResolvedValue(ok(settings));
    vi.mocked(api.saveStoreInfoAPI)
      .mockReset()
      .mockImplementation(async input => ok({ ...input, revision: input.revision + 1 }));
  });

  it("saves the info payload with the loaded revision", async () => {
    setup();
    expect(((await screen.findByLabelText("Số điện thoại")) as HTMLInputElement).value).toBe(
      "1900 0000"
    );
    fireEvent.change(await screen.findByLabelText("Số điện thoại"), {
      target: { value: "0900 111 222" }
    });
    save();
    await waitFor(() =>
      expect(api.saveStoreInfoAPI).toHaveBeenCalledWith({
        ...settings,
        contact: { ...settings.contact, phone: "0900 111 222" },
        revision: 3
      })
    );
  });

  it("rejects a non-https social link and an invalid email, and accepts empty socials", async () => {
    setup();
    const facebook = await screen.findByLabelText("Facebook");
    fireEvent.change(facebook, { target: { value: "http://facebook.com/shop" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "khong-phai-email" } });
    save();
    expect(await screen.findByText("Link phải bắt đầu bằng https://")).toBeTruthy();
    expect(await screen.findByText("Email không hợp lệ")).toBeTruthy();
    expect(api.saveStoreInfoAPI).not.toHaveBeenCalled();

    fireEvent.change(facebook, { target: { value: "https://facebook.com/shop" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hotro@clothes.vn" } });
    save();
    await waitFor(() =>
      expect(api.saveStoreInfoAPI).toHaveBeenCalledWith({
        ...settings,
        socials: { ...settings.socials, facebook: "https://facebook.com/shop" },
        revision: 3
      })
    );
  });

  it("blocks saving after a stale revision until the admin reloads", async () => {
    vi.mocked(api.saveStoreInfoAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    setup();
    fireEvent.change(await screen.findByLabelText("Số điện thoại"), {
      target: { value: "0900 draft" }
    });
    vi.mocked(api.getStoreInfoAPI).mockResolvedValue(
      ok({ ...settings, contact: { ...settings.contact, phone: "0911 fresh" }, revision: 4 })
    );
    save();
    expect(
      await screen.findByText("Nội dung đã thay đổi. Tải lại để bỏ bản nháp trước khi lưu.")
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Lưu thông tin" }) as HTMLButtonElement).disabled
    ).toBe(true);

    const loads = vi.mocked(api.getStoreInfoAPI).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() =>
      expect(vi.mocked(api.getStoreInfoAPI).mock.calls.length).toBeGreaterThan(loads)
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Lưu thông tin" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    // Reload discards the draft and shows the other admin's saved copy
    expect((screen.getByLabelText("Số điện thoại") as HTMLInputElement).value).toBe("0911 fresh");
  });

  it("shows a retryable load error", async () => {
    vi.mocked(api.getStoreInfoAPI).mockRejectedValue(new ApiError("Máy chủ lỗi", 500));
    setup();
    expect(await screen.findByText("Không tải được thông tin cửa hàng")).toBeTruthy();
    vi.mocked(api.getStoreInfoAPI).mockResolvedValue(ok(settings));
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText("Số điện thoại")).toBeTruthy();
  });
});
