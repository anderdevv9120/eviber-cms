import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { ApiError } from "@/utils/request";
import * as api from "@/services/inventory";
import { errorNotification, successNotification } from "@/utils/notification";
import { INVENTORY_ERROR } from "./inventory-errors";
import AdjustStockModal from "./AdjustStockModal";

vi.mock("@/services/inventory", () => ({ adjustStockAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  errorNotification: vi.fn(),
  successNotification: vi.fn()
}));

const row: api.InventoryRow = {
  variantId: "v1",
  productId: "p1",
  productName: "Áo thun",
  productStatus: "PUBLISH",
  sku: "SKU-1",
  attributeLabels: ["Đỏ", "M"],
  image: null,
  variantStatus: "ACTIVE",
  inventoryCount: 37
};
const result = (inventoryCount: number): api.AdjustStockResult => ({
  row: { ...row, inventoryCount },
  movement: {
    id: "m1",
    createdAt: "2026-10-14T00:00:00.000Z",
    reason: "manual_adjust",
    delta: inventoryCount - row.inventoryCount,
    stockAfter: inventoryCount,
    note: "Ghi chú",
    actor: null,
    order: null
  }
});
const ok = <T,>(data: T) => ({ data, message: "success" });

const renderModal = (props: Partial<ComponentProps<typeof AdjustStockModal>> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onAdjusted: vi.fn(),
    onGone: vi.fn(),
    onUnknownResult: vi.fn()
  };
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AdjustStockModal row={row} open {...handlers} {...props} />
      </ConfigProvider>
    </StrictMode>
  );
  return handlers;
};
const amount = (value: number) =>
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: String(value) } });
const note = (value: string) =>
  fireEvent.change(screen.getByLabelText("Ghi chú"), { target: { value } });
const mode = (name: string) => fireEvent.click(screen.getByText(name));
// The loading icon joins the accessible name, so match the label text instead.
const submitButton = () => screen.getByText("Lưu điều chỉnh").closest("button")!;
const submit = () => fireEvent.click(submitButton());
const submitDisabled = () => submitButton().hasAttribute("disabled");
const calls = () => vi.mocked(api.adjustStockAPI).mock.calls;

describe("AdjustStockModal", () => {
  beforeEach(() => {
    vi.mocked(api.adjustStockAPI)
      .mockReset()
      .mockResolvedValue(ok(result(87)));
    vi.mocked(errorNotification).mockReset();
    vi.mocked(successNotification).mockReset();
  });

  it("shows the variant, current stock and the preview for each mode", () => {
    renderModal();
    expect(screen.getByText("Áo thun")).toBeTruthy();
    expect(screen.getByText(/SKU-1/)).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    amount(50);
    expect(screen.getByText("37 → 87")).toBeTruthy();
    mode("Xuất bớt (−)");
    amount(7);
    expect(screen.getByText("37 → 30")).toBeTruthy();
    mode("Kiểm kê (= N)");
    amount(12);
    expect(screen.getByText("37 → 12")).toBeTruthy();
  });

  it("keeps submit disabled until the amount makes a valid request", () => {
    renderModal();
    expect(submitDisabled()).toBe(true);
    amount(50);
    expect(submitDisabled()).toBe(false); // note optional
    note("   ");
    expect(submitDisabled()).toBe(false);
    mode("Xuất bớt (−)");
    amount(38);
    expect(submitDisabled()).toBe(true); // below zero
    amount(37);
    expect(submitDisabled()).toBe(false);
    mode("Kiểm kê (= N)");
    amount(37);
    expect(submitDisabled()).toBe(true); // delta 0
    expect(calls()).toHaveLength(0);
  });

  it("caps the note at 500 without a counter", () => {
    renderModal();
    expect(screen.queryByText("0 / 500")).toBeNull();
    expect(screen.getByLabelText("Ghi chú").getAttribute("maxlength")).toBe("500");
  });

  it("sends no note when it is blank", async () => {
    renderModal();
    amount(5);
    note("   ");
    submit();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0]).toEqual(["v1", { delta: 5 }]);
  });

  it("sends in/out without expectedCurrent and count with it", async () => {
    renderModal();
    amount(50);
    note(" Nhập kho ");
    submit();
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0]).toEqual(["v1", { delta: 50, note: "Nhập kho" }]);
    mode("Xuất bớt (−)");
    amount(7);
    submit();
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1]).toEqual(["v1", { delta: -7, note: "Nhập kho" }]);
    mode("Kiểm kê (= N)");
    amount(40);
    submit();
    await waitFor(() => expect(calls()).toHaveLength(3));
    expect(calls()[2]).toEqual(["v1", { delta: 3, note: "Nhập kho", expectedCurrent: 37 }]);
  });

  it("toasts, calls onAdjusted once with the result, then closes on success", async () => {
    const { onAdjusted, onClose, onGone } = renderModal();
    amount(50);
    note("Ghi chú");
    submit();
    await waitFor(() => expect(onAdjusted).toHaveBeenCalledTimes(1));
    expect(onAdjusted).toHaveBeenCalledWith(result(87));
    expect(successNotification).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGone).not.toHaveBeenCalled();
  });

  it("sends exactly one request on a double click and shows loading while pending", async () => {
    let finish!: (value: ReturnType<typeof ok<api.AdjustStockResult>>) => void;
    vi.mocked(api.adjustStockAPI).mockReturnValue(new Promise(resolve => (finish = resolve)));
    const { onAdjusted } = renderModal();
    amount(50);
    note("Ghi chú");
    // Both clicks land before React re-renders, so only the in-flight guard can stop the second.
    act(() => {
      submitButton().click();
      submitButton().click();
    });
    expect(calls()).toHaveLength(1);
    await waitFor(() => expect(submitButton().className).toContain("ant-btn-loading"));
    fireEvent.click(submitButton());
    expect(calls()).toHaveLength(1);
    finish(ok(result(87)));
    await waitFor(() => expect(onAdjusted).toHaveBeenCalledTimes(1));
    expect(calls()).toHaveLength(1);
  });

  it("on 409 updates current, shows the new stock, does not resubmit and stays open", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(
      new ApiError("Tồn kho đã thay đổi", 409, {
        code: INVENTORY_ERROR.STOCK_CHANGED,
        currentInventoryCount: 60
      })
    );
    const { onAdjusted, onClose, onGone } = renderModal();
    mode("Kiểm kê (= N)");
    amount(40);
    note("Kiểm kê");
    submit();
    expect(await screen.findByText("Tồn kho vừa đổi thành 60")).toBeTruthy();
    expect(screen.getByText("60 → 40")).toBeTruthy();
    expect(calls()).toHaveLength(1);
    expect(submitDisabled()).toBe(false);
    expect(onAdjusted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
    submit(); // staff resubmits against the new current
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1]).toEqual(["v1", { delta: -20, note: "Kiểm kê", expectedCurrent: 60 }]);
  });

  it("on 409 keeps submit disabled and sends nothing when N now equals the current stock", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(
      new ApiError("Tồn kho đã thay đổi", 409, {
        code: INVENTORY_ERROR.STOCK_CHANGED,
        currentInventoryCount: 40
      })
    );
    renderModal();
    mode("Kiểm kê (= N)");
    amount(40);
    note("Kiểm kê");
    submit();
    expect(await screen.findByText("Tồn kho vừa đổi thành 40")).toBeTruthy();
    expect(screen.getByText("40 → 40")).toBeTruthy();
    expect(submitDisabled()).toBe(true);
    submit();
    expect(calls()).toHaveLength(1);
  });

  it("on 400 insufficient stock shows an inline error with the current value and updates it", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(
      new ApiError("Không đủ tồn kho", 400, {
        code: INVENTORY_ERROR.INSUFFICIENT_STOCK,
        currentInventoryCount: 5
      })
    );
    const { onClose, onGone } = renderModal();
    mode("Xuất bớt (−)");
    amount(30);
    note("Hỏng");
    submit();
    expect(await screen.findByText("Không đủ tồn kho: hiện còn 5")).toBeTruthy();
    expect(screen.getByText("5 → -25")).toBeTruthy();
    expect(submitDisabled()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });

  it("on 404 toasts the error and calls onGone without onAdjusted", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(
      new ApiError("Biến thể không tồn tại", 404, { code: INVENTORY_ERROR.VARIANT_NOT_FOUND })
    );
    const { onAdjusted, onGone } = renderModal();
    amount(50);
    note("Ghi chú");
    submit();
    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1));
    expect(errorNotification).toHaveBeenCalledWith("Biến thể không tồn tại");
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it("shows other failures inline and lets staff retry", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500));
    const { onClose } = renderModal();
    amount(50);
    note("Ghi chú");
    submit();
    expect(await screen.findByText("Máy chủ lỗi")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(calls()).toHaveLength(2));
  });

  it("flags an unknown result and asks the page to refetch after a network failure", async () => {
    // toApiError gives network errors and timeouts no status
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(
      new ApiError("Không thể kết nối đến máy chủ, vui lòng thử lại")
    );
    const { onClose, onAdjusted, onUnknownResult } = renderModal();
    amount(50);
    note("Ghi chú");
    submit();
    expect(
      await screen.findByText("Không rõ kết quả — kiểm tra Lịch sử trước khi thử lại")
    ).toBeTruthy();
    expect(onUnknownResult).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it("does not ask for a refetch after failures that carry an HTTP status", async () => {
    vi.mocked(api.adjustStockAPI).mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500));
    const { onUnknownResult } = renderModal();
    amount(50);
    note("Ghi chú");
    submit();
    await screen.findByText("Máy chủ lỗi");
    expect(onUnknownResult).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("stock adjustment authority", () => {
  beforeEach(() => {
    vi.mocked(api.adjustStockAPI)
      .mockReset()
      .mockResolvedValue(ok(result(87)));
  });
  it("preserves quantity and note while blocking a forced submit after refresh", async () => {
    renderModal();
    amount(8);
    note("Draft note");
    act(() => useAppStore.getState().setProfile(staffProfile(["INVENTORY_READ"])));
    expect(submitDisabled()).toBe(true);
    expect((screen.getByLabelText("Ghi chú") as HTMLTextAreaElement).value).toBe("Draft note");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("8");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(true);
    submitButton().removeAttribute("disabled");
    submit();
    await act(async () => {});
    expect(calls()).toHaveLength(0);
  });
  it("denies null profile even with a valid adjustment", () => {
    useAppStore.setState({ profile: null });
    renderModal();
    amount(8);
    expect(submitDisabled()).toBe(true);
  });
});

it("submits a permitted staff adjustment using INVENTORY_ADJUST", async () => {
  vi.mocked(api.adjustStockAPI)
    .mockReset()
    .mockResolvedValue(ok(result(45)));
  useAppStore.getState().setProfile(staffProfile(["INVENTORY_READ", "INVENTORY_ADJUST"]));
  renderModal();
  amount(8);
  submit();
  await waitFor(() => expect(api.adjustStockAPI).toHaveBeenCalledWith("v1", { delta: 8 }));
});
