import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import type { AdminOrderDetail } from "@/services/orders";
import { deferred, order, response } from "@/test/order-fixtures";
import OrderActionDialog, { type OrderActionIntent } from "./OrderActionDialog";

type Reply = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse> | AxiosResponse;
interface Step {
  method: "get" | "patch";
  reply: Reply;
}
const get = (data: AdminOrderDetail): Step => ({
  method: "get",
  reply: config => response(config, data)
});
const patch = (data: AdminOrderDetail): Step => ({
  method: "patch",
  reply: config => response(config, data)
});
const failure = (method: Step["method"], status: number, message: string): Step => ({
  method,
  reply: config =>
    Promise.reject(
      new AxiosError(message, "ERR_BAD_REQUEST", config, null, {
        config,
        data: { message },
        status,
        statusText: "",
        headers: {}
      })
    )
});
const networkLoss = (method: Step["method"]): Step => ({
  method,
  reply: config => Promise.reject(new AxiosError("timeout", AxiosError.ECONNABORTED, config))
});
const pending = (method: Step["method"], gate: Promise<AxiosResponse>): Step => ({
  method,
  reply: () => gate
});

function script(steps: Step[]) {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  axiosRequest.defaults.adapter = async config => {
    const method = String(config.method);
    calls.push({
      method,
      url: String(config.url),
      body: typeof config.data === "string" ? JSON.parse(config.data) : undefined
    });
    const step = steps[calls.length - 1];
    if (step?.method !== method) throw new Error(`Unexpected ${method} ${config.url}`);
    return step.reply(config);
  };
  return calls;
}

const paidOrder = (overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail => ({
  ...order,
  revision: 9,
  paymentStatus: "paid",
  actions: {
    ...order.actions,
    orderStatuses: [{ status: "cancelled", enabled: true, reason: null, requiresNote: true }],
    paymentActions: [
      {
        action: "receipt",
        enabled: false,
        reason: "Đã thanh toán",
        targets: [],
        requiresNote: false
      },
      { action: "refund", enabled: true, reason: null, targets: ["refunded"], requiresNote: false },
      {
        action: "correction",
        enabled: true,
        reason: null,
        targets: ["unpaid", "failed"],
        requiresNote: true
      }
    ]
  },
  ...overrides
});
const cancelIntent: OrderActionIntent = { type: "fulfillment", status: "cancelled" };
const receipt: OrderActionIntent = { type: "payment", action: "receipt" };
const correction: OrderActionIntent = { type: "payment", action: "correction" };

function renderDialog(intent: OrderActionIntent = cancelIntent) {
  const onClose = vi.fn();
  const onOrderChanged = vi.fn<(order: AdminOrderDetail) => Promise<void>>(async () => {});
  const view = render(
    <OrderActionDialog
      orderId='order-id'
      intent={intent}
      onClose={onClose}
      onOrderChanged={onOrderChanged}
    />
  );
  return { onClose, onOrderChanged, ...view };
}
const dialog = () => within(screen.getByRole("dialog"));
const ready = () => screen.findByRole("button", { name: "Xác nhận" });
const confirm = () => fireEvent.click(dialog().getByRole("button", { name: "Xác nhận" }));
const note = () => dialog().getByRole("textbox", { name: /^Ghi chú/ });
const noSubmit = () => expect(dialog().queryByRole("button", { name: "Xác nhận" })).toBeNull();
const submitDisabled = () =>
  expect((dialog().getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
    true
  );

beforeEach(() => useAppStore.getState().setProfile(ownerProfile));

describe("order action dialog", () => {
  it("RBAC backend denial wins even when a permitted payment button is forced enabled", async () => {
    useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_PAYMENT_UPDATE"]));
    const calls = script([get(order), failure("patch", 403, "Payment access denied"), get(order)]);
    const { onOrderChanged } = renderDialog(receipt);
    const button = (await ready()) as HTMLButtonElement;
    button.disabled = false;
    fireEvent.click(button);
    await screen.findByText("Payment access denied");
    expect(calls.map(call => call.method)).toEqual(["get", "patch", "get"]);
    expect(onOrderChanged).not.toHaveBeenCalled();
    expect(screen.queryByText("Đã ghi nhận thao tác.")).toBeNull();
    expect(useAppStore.getState().profile?._id).toBe("staff");
  });
  it.each([cancelIntent, receipt])(
    "RBAC disables an open $type draft on permission refresh and blocks forced submission",
    async intent => {
      const permission = intent.type === "payment" ? "ORDER_PAYMENT_UPDATE" : "ORDER_UPDATE";
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", permission]));
      const calls = script([get(order), patch({ ...order, revision: 5 })]);
      renderDialog(intent);
      await ready();
      fireEvent.change(note(), { target: { value: "Keep this draft" } });
      await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
      submitDisabled();
      expect((note() as HTMLInputElement).value).toBe("Keep this draft");
      expect((note() as HTMLInputElement).disabled).toBe(true);
      if (intent.type === "payment")
        expect(
          (dialog().getByRole("textbox", { name: "Mã tham chiếu" }) as HTMLInputElement).disabled
        ).toBe(true);
      fireEvent.submit(dialog().getByRole("button", { name: "Xác nhận" }).closest("form")!);
      expect(calls.map(call => call.method)).toEqual(["get"]);
      await act(async () =>
        useAppStore.getState().setProfile(staffProfile(["ORDER_READ", permission]))
      );
      expect((note() as HTMLInputElement).disabled).toBe(false);
      expect((note() as HTMLInputElement).value).toBe("Keep this draft");
    }
  );
  it("reviews fresh order number, total and both statuses, and sends the fresh revision", async () => {
    const calls = script([get({ ...order, revision: 9 }), patch({ ...order, revision: 10 })]);
    renderDialog();
    await ready();
    for (const text of ["ORD-SNAPSHOT", "210.000 ₫", "Chờ xử lý", "Chưa thanh toán"])
      expect(dialog().getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
    confirm();
    await screen.findByText("Đã ghi nhận thao tác.");
    expect(calls.map(call => call.method)).toEqual(["get", "patch"]);
    expect(calls[0].url).toBe("/orders/order-id");
    expect(calls[1].url).toBe("/orders/order-id/status");
    expect(calls[1].body).toEqual({ status: "cancelled", expectedRevision: 9 });
  });

  it("sends exactly one PATCH on repeated clicks and uses the returned detail on success", async () => {
    const gate = deferred<AxiosResponse>();
    const committed = { ...order, revision: 5, status: "cancelled" as const };
    const calls = script([get(order), pending("patch", gate.promise)]);
    const { onOrderChanged } = renderDialog();
    await ready();
    const button = dialog().getByRole("button", { name: "Xác nhận" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest("form")!);
    await waitFor(() => expect(calls.filter(call => call.method === "patch")).toHaveLength(1));
    await act(async () => {}); // let any (wrongly) queued second request reach the adapter
    expect(calls.filter(call => call.method === "patch")).toHaveLength(1);
    await act(async () => {
      gate.resolve(response({} as InternalAxiosRequestConfig, committed));
    });
    await screen.findByText("Đã ghi nhận thao tác.");
    expect(onOrderChanged).toHaveBeenCalledExactlyOnceWith(committed);
    expect(calls.map(call => call.method)).toEqual(["get", "patch"]);
    noSubmit();
  });

  it("keeps the committed outcome and blocks writes when the post-commit refresh fails", async () => {
    const calls = script([get(order), patch({ ...order, revision: 5 })]);
    const { onOrderChanged } = renderDialog();
    onOrderChanged.mockRejectedValueOnce(new Error("Không tải được danh sách"));
    await ready();
    confirm();
    await screen.findByText("Đã ghi nhận thao tác.");
    await screen.findByText(/Không làm mới được dữ liệu.*Không tải được danh sách/);
    noSubmit();
    fireEvent.click(dialog().getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() => expect(screen.queryByText(/Không làm mới được dữ liệu/)).toBeNull());
    expect(onOrderChanged).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Đã ghi nhận thao tác.")).toBeTruthy();
    expect(calls.filter(call => call.method === "patch")).toHaveLength(1);
  });

  it("keeps input after a conflict, shows what changed and needs a new explicit confirmation", async () => {
    const changed = { ...order, revision: 6, status: "confirmed" as const };
    const calls = script([
      get(order),
      failure("patch", 409, "Đơn hàng đã thay đổi"),
      get(changed),
      patch({ ...changed, revision: 7, status: "cancelled" })
    ]);
    const { onOrderChanged } = renderDialog();
    await ready();
    fireEvent.change(note(), { target: { value: "Khách đổi ý" } });
    confirm();
    await screen.findByText(/đã được thay đổi bởi thao tác khác/);
    expect(dialog().getByText(/Phiên bản: 4 → 6/)).toBeTruthy();
    expect(dialog().getByText(/Trạng thái đơn hàng: Chờ xử lý → Đã xác nhận/)).toBeTruthy();
    expect((note() as HTMLTextAreaElement).value).toBe("Khách đổi ý");
    expect(onOrderChanged).toHaveBeenCalledExactlyOnceWith(changed);
    expect(calls.map(call => call.method)).toEqual(["get", "patch", "get"]);
    submitDisabled();
    fireEvent.click(dialog().getByRole("checkbox", { name: "Tôi đã xem lại dữ liệu mới nhất" }));
    confirm();
    await screen.findByText("Đã ghi nhận thao tác.");
    expect(calls[3].body).toEqual({
      status: "cancelled",
      expectedRevision: 6,
      note: "Khách đổi ý"
    });
  });

  it("clears a correction target that is no longer valid and requires reselection", async () => {
    const calls = script([
      get(paidOrder()),
      failure("patch", 409, "Đơn hàng đã thay đổi"),
      get(
        paidOrder({
          revision: 10,
          paymentStatus: "unpaid",
          actions: {
            ...paidOrder().actions,
            paymentActions: [
              {
                action: "correction",
                enabled: true,
                reason: null,
                targets: ["paid", "failed"],
                requiresNote: true
              }
            ]
          }
        })
      ),
      patch(paidOrder({ revision: 11 }))
    ]);
    renderDialog(correction);
    await ready();
    fireEvent.click(dialog().getByRole("radio", { name: "Chưa thanh toán" }));
    fireEvent.change(note(), { target: { value: "Ghi nhầm" } });
    confirm();
    await screen.findByText(/Trạng thái đích không còn hợp lệ/);
    expect(
      (dialog().getByRole("radio", { name: "Đã thanh toán" }) as HTMLInputElement).checked
    ).toBe(false);
    expect(dialog().queryByRole("radio", { name: "Chưa thanh toán" })).toBeNull();
    fireEvent.click(dialog().getByRole("checkbox", { name: "Tôi đã xem lại dữ liệu mới nhất" }));
    submitDisabled();
    fireEvent.click(dialog().getByRole("radio", { name: "Thanh toán thất bại" }));
    confirm();
    await screen.findByText("Đã ghi nhận thao tác.");
    expect(calls[3].body).toEqual({
      paymentStatus: "failed",
      action: "correction",
      expectedRevision: 10,
      note: "Ghi nhầm"
    });
  });

  it("offers retry without submit when the conflict reload fails", async () => {
    const changed = { ...order, revision: 6 };
    const calls = script([
      get(order),
      failure("patch", 409, "Đơn hàng đã thay đổi"),
      networkLoss("get"),
      get(changed)
    ]);
    const { onOrderChanged } = renderDialog();
    await ready();
    confirm();
    await screen.findByText(/Không tải được trạng thái hiện tại/);
    noSubmit();
    expect(onOrderChanged).not.toHaveBeenCalled();
    fireEvent.click(dialog().getByRole("button", { name: "Thử lại" }));
    await screen.findByText(/đã được thay đổi bởi thao tác khác/);
    expect(dialog().getByText(/Phiên bản: 4 → 6/)).toBeTruthy();
    expect(onOrderChanged).toHaveBeenCalledExactlyOnceWith(changed);
    expect(calls.filter(call => call.method === "patch")).toHaveLength(1);
  });

  it.each([
    ["network loss", networkLoss("patch")],
    ["server error", failure("patch", 503, "Lỗi máy chủ")]
  ])("never replays or claims success after an ambiguous %s", async (_name, ambiguous) => {
    const current = { ...order, revision: 5, status: "cancelled" as const };
    const calls = script([get(order), ambiguous, get(current)]);
    const { onOrderChanged } = renderDialog();
    await ready();
    confirm();
    await screen.findByText(/Chưa xác định được kết quả thao tác trước/);
    expect(screen.queryByText("Đã ghi nhận thao tác.")).toBeNull();
    expect(dialog().getByText(/Trạng thái đơn hàng: Chờ xử lý → Đã hủy/)).toBeTruthy();
    expect(onOrderChanged).toHaveBeenCalledExactlyOnceWith(current);
    expect(calls.map(call => call.method)).toEqual(["get", "patch", "get"]);
    submitDisabled();
  });

  it("shows the backend message for a validation rejection and keeps the input", async () => {
    const calls = script([
      get(paidOrder()),
      failure("patch", 400, "Đơn hàng đã thanh toán cần lý do hủy"),
      get(paidOrder())
    ]);
    const { onOrderChanged } = renderDialog();
    await ready();
    fireEvent.change(note(), { target: { value: "Lý do" } });
    confirm();
    await screen.findByText("Đơn hàng đã thanh toán cần lý do hủy");
    expect((note() as HTMLTextAreaElement).value).toBe("Lý do");
    expect(onOrderChanged).not.toHaveBeenCalled();
    expect(calls.map(call => call.method)).toEqual(["get", "patch", "get"]);
    expect((dialog().getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it("cannot submit when fresh eligibility no longer allows the action", async () => {
    script([
      get({
        ...order,
        actions: {
          ...order.actions,
          orderStatuses: [
            { status: "cancelled", enabled: false, reason: "Đơn đã hoàn tất", requiresNote: false }
          ]
        }
      })
    ]);
    renderDialog();
    await screen.findByText("Đơn đã hoàn tất");
    submitDisabled();
  });

  it("shows a retryable read failure and no submit when the review read fails", async () => {
    script([failure("get", 500, "Lỗi máy chủ"), get(order)]);
    renderDialog(receipt);
    await screen.findByText(/Lỗi máy chủ/);
    noSubmit();
    fireEvent.click(dialog().getByRole("button", { name: "Thử lại" }));
    await ready();
  });

  it("ignores a late review read after the dialog is replaced by another order", async () => {
    const late = deferred<AxiosResponse>();
    const second = { ...order, _id: "second-id", orderNumber: "ORD-SECOND" };
    const calls = script([pending("get", late.promise), get(second)]);
    function Host() {
      const [id, setId] = useState("order-id");
      return (
        <>
          <button onClick={() => setId("second-id")}>đổi dòng</button>
          <OrderActionDialog
            key={id}
            orderId={id}
            intent={receipt}
            onClose={vi.fn()}
            onOrderChanged={async () => {}}
          />
        </>
      );
    }
    render(<Host />);
    await waitFor(() => expect(calls).toHaveLength(1)); // first read is in flight
    fireEvent.click(screen.getByRole("button", { name: "đổi dòng" }));
    await screen.findByText(/ORD-SECOND/);
    await act(async () => {
      late.resolve(response({} as InternalAxiosRequestConfig, order));
    });
    expect(screen.queryByText(/ORD-SNAPSHOT/)).toBeNull();
    expect(screen.getByText(/ORD-SECOND/)).toBeTruthy();
  });

  it("does not notify the parent when navigation unmounts the dialog mid-mutation", async () => {
    const gate = deferred<AxiosResponse>();
    const calls = script([get(order), pending("patch", gate.promise)]);
    const { onOrderChanged, unmount } = renderDialog();
    await ready();
    confirm();
    unmount();
    await act(async () => {
      gate.resolve(response({} as InternalAxiosRequestConfig, { ...order, revision: 5 }));
    });
    expect(onOrderChanged).not.toHaveBeenCalled();
    expect(calls.filter(call => call.method === "patch")).toHaveLength(1);
  });

  it("calls onClose from the close button", async () => {
    script([get(order)]);
    const { onClose } = renderDialog();
    await ready();
    fireEvent.click(dialog().getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalled();
  });
});
