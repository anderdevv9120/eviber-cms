import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { response } from "@/test/attribute-fixtures";
import axiosRequest from "@/utils/request";
import * as storeApi from "@/services/storeContent";
import * as api from "@/services/refunds";
import StoreInfo from "@/pages/StoreInfo";
import RefundPolicySettings from "./RefundPolicySettings";

vi.mock("@/services/storeContent", () => ({
  getStoreInfoAPI: vi.fn(),
  saveStoreInfoAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

let policy: api.RefundPolicy;
let failure: number | null;
let calls: InternalAxiosRequestConfig[];
const writes = () => calls.filter(call => call.method === "patch");
const setup = (children: ReactNode = <RefundPolicySettings />) =>
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>
    </StrictMode>
  );
const days = () =>
  screen.getByRole("spinbutton", { name: "Số ngày sau khi giao hàng" }) as HTMLInputElement;
const toggle = () => screen.getByRole("switch", { name: "Hỗ trợ hoàn tiền thông thường" });
const save = () =>
  screen.getByRole("button", { name: "Lưu chính sách hoàn tiền" }) as HTMLButtonElement;

beforeEach(() => {
  policy = { enabled: true, windowDays: 7, revision: 12 };
  failure = null;
  calls = [];
  axiosRequest.defaults.adapter = async config => {
    calls.push(config);
    if (config.url !== "/refund-policy") throw new Error(`Unexpected URL: ${config.url}`);
    if (config.method === "patch") {
      if (failure) {
        throw new AxiosError("Failed", String(failure), config, null, {
          config,
          status: failure,
          statusText: "Failed",
          headers: {},
          data: { message: "Không lưu được chính sách" }
        });
      }
      const input = JSON.parse(config.data);
      policy = {
        enabled: input.enabled,
        windowDays: input.windowDays,
        revision: policy.revision + 1
      };
    }
    return response(config, policy);
  };
  vi.mocked(storeApi.getStoreInfoAPI)
    .mockReset()
    .mockResolvedValue({
      message: "success",
      data: {
        contact: { address: "Số 8", email: "shop@example.test", phone: "1900 0000" },
        socials: { facebook: "", instagram: "", twitter: "" },
        productPromises: ["Giao nhanh", "Đổi size", "COD"],
        revision: 3
      }
    });
  vi.mocked(storeApi.saveStoreInfoAPI)
    .mockReset()
    .mockImplementation(async input => ({
      message: "success",
      data: { ...input, revision: input.revision + 1 }
    }));
});

describe("refund policy settings", () => {
  it("round-trips support and duration through the policy API with its own revision", async () => {
    setup();
    await screen.findByRole("switch", { name: "Hỗ trợ hoàn tiền thông thường" });
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(days().value).toBe("7");
    fireEvent.click(toggle());
    fireEvent.change(days(), { target: { value: "14" } });
    fireEvent.click(save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(writes()[0].data)).toEqual({
      enabled: false,
      windowDays: 14,
      expectedRevision: 12
    });
    await waitFor(() => expect(save().disabled).toBe(false));
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle());
    fireEvent.click(save());
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1].data)).toEqual({
      enabled: true,
      windowDays: 14,
      expectedRevision: 13
    });
    expect(calls.every(call => call.toastError === false)).toBe(true);
    expect(screen.getByText(/chỉ áp dụng cho các đơn hàng mua sau/i)).toBeTruthy();
    expect(screen.getByText(/vẫn có thể báo hàng thiếu hoặc giao sai/i)).toBeTruthy();
  });

  it("preserves a conflicting draft and blocks saving until explicit reload", async () => {
    setup();
    await screen.findByRole("switch", { name: "Hỗ trợ hoàn tiền thông thường" });
    fireEvent.click(toggle());
    fireEvent.change(days(), { target: { value: "14" } });
    failure = 409;
    fireEvent.click(save());
    await screen.findByText(/Nội dung đã thay đổi/);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(days().value).toBe("14");
    expect(save().disabled).toBe(true);
    const reads = calls.filter(call => call.method === "get").length;
    fireEvent.click(save());
    expect(writes()).toHaveLength(1);
    expect(calls.filter(call => call.method === "get")).toHaveLength(reads);
    policy = { enabled: true, windowDays: 30, revision: 13 };
    failure = null;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(days().value).toBe("30"));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(save());
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1].data)).toEqual({
      enabled: true,
      windowDays: 30,
      expectedRevision: 13
    });
  });

  it.each(["", "0", "366", "1.5"])("does not submit invalid duration %j", async value => {
    setup();
    await screen.findByRole("spinbutton", { name: "Số ngày sau khi giao hàng" });
    fireEvent.change(days(), { target: { value } });
    fireEvent.click(save());
    await screen.findByText("Nhập số ngày nguyên từ 1 đến 365");
    expect(writes()).toHaveLength(0);
  });

  it("keeps the draft and shows an inline save error", async () => {
    setup();
    await screen.findByRole("spinbutton", { name: "Số ngày sau khi giao hàng" });
    fireEvent.change(days(), { target: { value: "21" } });
    failure = 500;
    fireEvent.click(save());
    await screen.findByText("Không lưu được chính sách");
    expect(days().value).toBe("21");
    expect(save().disabled).toBe(false);
  });

  it("offers a retry after a load error without exposing editable defaults", async () => {
    axiosRequest.defaults.adapter = async () => {
      throw new Error("Mất kết nối");
    };
    setup();
    await screen.findByText(/Mất kết nối/);
    expect(screen.queryByRole("switch")).toBeNull();
    axiosRequest.defaults.adapter = async config => response(config, policy);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("spinbutton", { name: "Số ngày sau khi giao hàng" });
    expect(days().value).toBe("7");
  });

  it("saves policy independently of an unsaved store-info draft", async () => {
    setup(<StoreInfo />);
    fireEvent.change(await screen.findByLabelText("Số điện thoại"), {
      target: { value: "0900 draft" }
    });
    await screen.findByRole("switch", { name: "Hỗ trợ hoàn tiền thông thường" });
    fireEvent.click(toggle());
    fireEvent.click(save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(writes()[0].data)).toEqual({
      enabled: false,
      windowDays: 7,
      expectedRevision: 12
    });
    expect(storeApi.saveStoreInfoAPI).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Số điện thoại") as HTMLInputElement).value).toBe("0900 draft");
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    await waitFor(() =>
      expect(storeApi.saveStoreInfoAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 3,
          contact: expect.objectContaining({ phone: "0900 draft" })
        })
      )
    );
    expect(writes()).toHaveLength(1);
  });
});
