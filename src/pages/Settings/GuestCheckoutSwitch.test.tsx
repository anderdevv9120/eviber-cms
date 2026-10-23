import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { deferred, response } from "@/test/attribute-fixtures";
import axiosRequest from "@/utils/request";
import { errorNotification, successNotification } from "@/utils/notification";
import * as settings from "@/services/checkout-settings";
import GuestCheckoutSwitch from "./GuestCheckoutSwitch";

vi.mock("@/services/checkout-settings", () => ({
  getCheckoutSettingsAPI: vi.fn(),
  updateCheckoutSettingsAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  errorNotification: vi.fn(),
  successNotification: vi.fn()
}));

type SettingsResponse = Awaited<ReturnType<typeof settings.getCheckoutSettingsAPI>>;
const confirmed = (allowGuestCheckout: boolean): SettingsResponse => ({
  data: { allowGuestCheckout },
  message: "success"
});
const control = () => screen.getByRole("switch", { name: "Cho phép mua hàng không cần đăng nhập" });
const checked = () => control().getAttribute("aria-checked") === "true";
const disabled = () => (control() as HTMLButtonElement).disabled;

beforeEach(() => {
  vi.mocked(settings.getCheckoutSettingsAPI).mockReset().mockResolvedValue(confirmed(true));
  vi.mocked(settings.updateCheckoutSettingsAPI).mockReset().mockResolvedValue(confirmed(false));
  vi.mocked(successNotification).mockClear();
  vi.mocked(errorNotification).mockClear();
});

describe("Guest checkout switch", () => {
  it("stays disabled and unknown until the initial GET confirms true", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.getCheckoutSettingsAPI).mockReturnValueOnce(pending.promise);
    render(<GuestCheckoutSwitch />);
    expect(disabled()).toBe(true);
    expect(screen.getByText("Chưa xác nhận")).toBeTruthy();
    fireEvent.click(control());
    expect(settings.updateCheckoutSettingsAPI).not.toHaveBeenCalled();
    await act(async () => pending.resolve(confirmed(true)));
    expect(disabled()).toBe(false);
    expect(checked()).toBe(true);
  });

  it("locks saves and shows success only after a confirmed PATCH response", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.updateCheckoutSettingsAPI).mockReturnValueOnce(pending.promise);
    render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    fireEvent.click(control());
    expect(disabled()).toBe(true);
    expect(checked()).toBe(true);
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledExactlyOnceWith({
      allowGuestCheckout: false
    });
    expect(successNotification).not.toHaveBeenCalled();
    expect(screen.queryByText("Đã lưu cài đặt.")).toBeNull();
    await act(async () => pending.resolve(confirmed(false)));
    expect(checked()).toBe(false);
    expect(disabled()).toBe(false);
    expect(screen.getByText("Đã lưu cài đặt.")).toBeTruthy();
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
  });

  it("reads the persisted false value after a lost PATCH response without replaying", async () => {
    let stored = true;
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.getCheckoutSettingsAPI).mockImplementation(async () => confirmed(stored));
    vi.mocked(settings.updateCheckoutSettingsAPI).mockImplementationOnce(input => {
      stored = input.allowGuestCheckout;
      return pending.promise;
    });
    render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    await act(async () => pending.reject(new Error("Lost response")));
    await waitFor(() => expect(disabled()).toBe(false));
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(2);
    expect(checked()).toBe(false);
    expect(successNotification).not.toHaveBeenCalled();
    expect(screen.queryByText("Đã lưu cài đặt.")).toBeNull();
  });

  it("keeps failed recovery unknown until an explicit GET retry succeeds", async () => {
    vi.mocked(settings.updateCheckoutSettingsAPI).mockRejectedValueOnce(new Error("Lost response"));
    vi.mocked(settings.getCheckoutSettingsAPI)
      .mockResolvedValueOnce(confirmed(true))
      .mockRejectedValueOnce(new Error("Recovery failed"))
      .mockResolvedValueOnce(confirmed(false));
    render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    await screen.findByText("Recovery failed");
    expect(disabled()).toBe(true);
    expect(screen.getByText("Chưa xác nhận")).toBeTruthy();
    fireEvent.click(control());
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(2);
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại cài đặt" }));
    await waitFor(() => expect(disabled()).toBe(false));
    expect(checked()).toBe(false);
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(3);
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { allowGuestCheckout: "false" }, { allowGuestCheckout: 0 }])(
    "rejects a malformed GET payload %j instead of guessing a boolean",
    async data => {
      vi.mocked(settings.getCheckoutSettingsAPI).mockResolvedValueOnce({
        data,
        message: "success"
      } as unknown as SettingsResponse);
      render(<GuestCheckoutSwitch />);
      await screen.findByRole("button", { name: "Thử lại cài đặt" });
      expect(disabled()).toBe(true);
      expect(screen.getByText("Chưa xác nhận")).toBeTruthy();
      expect(settings.updateCheckoutSettingsAPI).not.toHaveBeenCalled();
    }
  );

  it("recovers a malformed PATCH response without a success notification", async () => {
    vi.mocked(settings.updateCheckoutSettingsAPI).mockResolvedValueOnce({
      data: {},
      message: "success"
    } as SettingsResponse);
    vi.mocked(settings.getCheckoutSettingsAPI)
      .mockResolvedValueOnce(confirmed(true))
      .mockResolvedValueOnce(confirmed(false));
    render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    await waitFor(() => expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(disabled()).toBe(false));
    expect(checked()).toBe(false);
    expect(successNotification).not.toHaveBeenCalled();
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
  });

  it("aborts a late initial read on unmount and cannot overwrite a new instance", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.getCheckoutSettingsAPI)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(confirmed(false));
    const first = render(<GuestCheckoutSwitch />);
    const signal = vi.mocked(settings.getCheckoutSettingsAPI).mock.calls[0][0];
    first.unmount();
    expect(signal?.aborted).toBe(true);
    render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    await act(async () => pending.resolve(confirmed(true)));
    expect(checked()).toBe(false);
  });

  it("ignores a save rejection after unmount instead of starting recovery", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.updateCheckoutSettingsAPI).mockReturnValueOnce(pending.promise);
    const rendered = render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    rendered.unmount();
    await act(async () => pending.reject(new Error("Late failure")));
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
    expect(successNotification).not.toHaveBeenCalled();
  });

  it("ignores an older read after StrictMode starts a newer lifecycle", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.getCheckoutSettingsAPI)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(confirmed(false));
    render(
      <StrictMode>
        <GuestCheckoutSwitch />
      </StrictMode>
    );
    await waitFor(() => expect(disabled()).toBe(false));
    expect(vi.mocked(settings.getCheckoutSettingsAPI).mock.calls[0][0]?.aborted).toBe(true);
    await act(async () => pending.resolve(confirmed(true)));
    expect(checked()).toBe(false);
    expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending recovery read when unmounted", async () => {
    const pending = deferred<SettingsResponse>();
    vi.mocked(settings.updateCheckoutSettingsAPI).mockRejectedValueOnce(new Error("Lost response"));
    vi.mocked(settings.getCheckoutSettingsAPI)
      .mockResolvedValueOnce(confirmed(true))
      .mockReturnValueOnce(pending.promise);
    const rendered = render(<GuestCheckoutSwitch />);
    await waitFor(() => expect(disabled()).toBe(false));
    fireEvent.click(control());
    await waitFor(() => expect(settings.getCheckoutSettingsAPI).toHaveBeenCalledTimes(2));
    expect(disabled()).toBe(true);
    const signal = vi.mocked(settings.getCheckoutSettingsAPI).mock.calls[1][0];
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(confirmed(false)));
    expect(settings.updateCheckoutSettingsAPI).toHaveBeenCalledTimes(1);
    expect(successNotification).not.toHaveBeenCalled();
  });
});

describe("Checkout settings transport", () => {
  it("uses the existing admin GET/PATCH, one envelope, a boolean-only body and inline errors", async () => {
    const actual = await vi.importActual<typeof settings>("@/services/checkout-settings");
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { allowGuestCheckout: false });
    };
    const signal = new AbortController().signal;
    expect(await actual.getCheckoutSettingsAPI(signal)).toEqual(confirmed(false));
    expect(
      await actual.updateCheckoutSettingsAPI({
        allowGuestCheckout: false,
        extra: true
      } as settings.CheckoutSettings)
    ).toEqual(confirmed(false));
    expect(calls.map(config => [config.method, config.url, config.toastError])).toEqual([
      ["get", "/checkout-settings", false],
      ["patch", "/checkout-settings", false]
    ]);
    expect(calls[0].signal).toBe(signal);
    expect(JSON.parse(calls[1].data)).toEqual({ allowGuestCheckout: false });
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("Unavailable", "ERR_BAD_RESPONSE", config, undefined, {
        ...response(config, {}),
        data: { message: "Unavailable" },
        status: 503
      });
    };
    await expect(actual.getCheckoutSettingsAPI()).rejects.toThrow("Unavailable");
    await expect(actual.updateCheckoutSettingsAPI({ allowGuestCheckout: true })).rejects.toThrow(
      "Unavailable"
    );
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
