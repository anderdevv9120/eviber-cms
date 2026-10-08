import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  AdminOrderDetail,
  PaymentAction,
  PaymentStatus,
  UpdatePaymentInput
} from "@/services/orders";
import { order } from "@/test/order-fixtures";
import PaymentForm from "./PaymentForm";
import type { ActionDraft } from "./order-action-input";

const detail = (overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail => ({
  ...order,
  ...overrides
});
const refundable = detail({
  paymentStatus: "paid",
  actions: {
    ...order.actions,
    paymentActions: [
      {
        action: "receipt",
        enabled: false,
        reason: "Đã thanh toán trước đó",
        targets: [],
        requiresNote: false
      },
      { action: "refund", enabled: true, reason: null, targets: ["refunded"], requiresNote: false },
      {
        action: "correction",
        enabled: true,
        reason: null,
        targets: ["unpaid", "failed", "refunded"],
        requiresNote: true
      }
    ]
  }
});

function Harness({
  action,
  order: current = order,
  initial,
  onSubmit
}: {
  action: PaymentAction;
  order?: AdminOrderDetail;
  initial?: Partial<ActionDraft>;
  onSubmit: (input: UpdatePaymentInput) => void;
}) {
  const [draft, setDraft] = useState<ActionDraft>({ note: "", reference: "", ...initial });
  return (
    <PaymentForm
      order={current}
      action={action}
      draft={draft}
      onDraftChange={patch => setDraft(value => ({ ...value, ...patch }))}
      onSubmit={onSubmit}
    />
  );
}
const note = () => screen.getByRole("textbox", { name: /^Ghi chú/ });
const reference = () => screen.getByRole("textbox", { name: "Mã tham chiếu" });
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
const targets = () =>
  screen.queryAllByRole("radio").map(radio => (radio as HTMLInputElement).value);

describe("payment form", () => {
  it.each<PaymentAction>(["receipt", "refund", "correction"])(
    "cannot submit %s for an order whose backend requires no payment",
    action => {
      const free = detail({
        paymentStatus: "not_required",
        paymentInfo: { method: "NO_PAYMENT" },
        actions: {
          ...order.actions,
          paymentActions: order.actions.paymentActions.map(item => ({
            ...item,
            enabled: false,
            targets: [],
            reason: "Đơn hàng không cần thanh toán"
          }))
        }
      });
      const onSubmit = vi.fn();
      render(<Harness action={action} order={free} onSubmit={onSubmit} />);
      expect(targets()).toEqual([]);
      expect((screen.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
        true
      );
      confirm();
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );

  it.each<[PaymentAction, AdminOrderDetail, PaymentStatus]>([
    ["receipt", order, "paid"],
    ["refund", refundable, "refunded"]
  ])("uses a fixed target for ordinary %s and trims note/reference", (action, current, target) => {
    const onSubmit = vi.fn();
    render(<Harness action={action} order={current} onSubmit={onSubmit} />);
    expect(targets()).toEqual([]);
    confirm();
    expect(onSubmit).toHaveBeenLastCalledWith({
      paymentStatus: target,
      action,
      expectedRevision: 4
    });
    fireEvent.change(note(), { target: { value: " đã đối chiếu " } });
    fireEvent.change(reference(), { target: { value: " REF-1 " } });
    confirm();
    expect(onSubmit).toHaveBeenLastCalledWith({
      paymentStatus: target,
      action,
      expectedRevision: 4,
      note: "đã đối chiếu",
      reference: "REF-1"
    });
  });

  it("offers only backend correction targets and requires target and reason", () => {
    const onSubmit = vi.fn();
    render(<Harness action='correction' order={refundable} onSubmit={onSubmit} />);
    expect(targets()).toEqual(["unpaid", "failed", "refunded"]);
    confirm();
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.click(screen.getByRole("radio", { name: "Thanh toán thất bại" }));
    fireEvent.change(note(), { target: { value: "   " } });
    confirm();
    expect(screen.getByText("Vui lòng nhập lý do")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(note(), { target: { value: "Ghi nhầm" } });
    confirm();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      paymentStatus: "failed",
      action: "correction",
      expectedRevision: 4,
      note: "Ghi nhầm"
    });
  });

  it("does not let a note alone submit a correction", () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        action='correction'
        order={refundable}
        initial={{ note: "Chỉ có ghi chú" }}
        onSubmit={onSubmit}
      />
    );
    confirm();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enforces 500/501 note and 100/101 reference limits", () => {
    const onSubmit = vi.fn();
    render(<Harness action='receipt' onSubmit={onSubmit} />);
    fireEvent.change(note(), { target: { value: "n".repeat(501) } });
    confirm();
    expect(screen.getByText("Ghi chú tối đa 500 ký tự")).toBeTruthy();
    fireEvent.change(note(), { target: { value: "n".repeat(500) } });
    fireEvent.change(reference(), { target: { value: ` ${"r".repeat(101)} ` } });
    confirm();
    expect(screen.getByText("Mã tham chiếu tối đa 100 ký tự")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(reference(), { target: { value: ` ${"r".repeat(100)} ` } });
    confirm();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      paymentStatus: "paid",
      action: "receipt",
      expectedRevision: 4,
      note: "n".repeat(500),
      reference: "r".repeat(100)
    });
  });

  it("states that receipt on a cancelled order leaves it cancelled with stock restored", () => {
    render(<Harness action='receipt' order={detail({ status: "cancelled" })} onSubmit={vi.fn()} />);
    expect(screen.getByText(/vẫn ở trạng thái đã hủy.*tồn kho đã được hoàn lại/i)).toBeTruthy();
  });

  it("says refund and correction do not move money or send a receipt email", () => {
    const { unmount } = render(<Harness action='refund' order={refundable} onSubmit={vi.fn()} />);
    expect(screen.getByText(/không chuyển tiền/i)).toBeTruthy();
    unmount();
    render(<Harness action='correction' order={refundable} onSubmit={vi.fn()} />);
    expect(screen.getByText(/không gửi email biên nhận/i)).toBeTruthy();
  });

  it("cannot submit a disabled action and shows its reason", () => {
    const onSubmit = vi.fn();
    render(<Harness action='refund' order={order} onSubmit={onSubmit} />);
    expect(screen.getByText("Chưa thanh toán")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
