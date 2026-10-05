import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AdminOrderDetail, OrderStatus, TransitionOrderInput } from "@/services/orders";
import { order } from "@/test/order-fixtures";
import FulfillmentForm from "./FulfillmentForm";
import type { ActionDraft } from "./order-action-input";

const withStatus = (status: OrderStatus, requiresNote: boolean, enabled = true) =>
  ({
    ...order,
    paymentStatus: requiresNote ? "paid" : order.paymentStatus,
    actions: {
      ...order.actions,
      orderStatuses: [{ status, enabled, reason: enabled ? null : "Không thể xử lý", requiresNote }]
    }
  }) as AdminOrderDetail;

function Harness({
  detail,
  status,
  onSubmit
}: {
  detail: AdminOrderDetail;
  status: OrderStatus;
  onSubmit: (input: TransitionOrderInput) => void;
}) {
  const [draft, setDraft] = useState<ActionDraft>({ note: "", reference: "" });
  return (
    <FulfillmentForm
      order={detail}
      status={status}
      draft={draft}
      onDraftChange={patch => setDraft(current => ({ ...current, ...patch }))}
      onSubmit={onSubmit}
    />
  );
}
const note = () => screen.getByRole("textbox", { name: /^Ghi chú/ });
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

describe("fulfillment form", () => {
  it("submits the reviewed revision and omits an empty optional note", () => {
    const onSubmit = vi.fn();
    render(
      <Harness detail={withStatus("cancelled", false)} status='cancelled' onSubmit={onSubmit} />
    );
    confirm();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ status: "cancelled", expectedRevision: 4 });
  });

  it("sends the trimmed note", () => {
    const onSubmit = vi.fn();
    render(
      <Harness detail={withStatus("cancelled", false)} status='cancelled' onSubmit={onSubmit} />
    );
    fireEvent.change(note(), { target: { value: "  Khách đổi ý  " } });
    confirm();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      status: "cancelled",
      expectedRevision: 4,
      note: "Khách đổi ý"
    });
  });

  it("rejects a blank reason when the backend requires one", () => {
    const onSubmit = vi.fn();
    render(
      <Harness detail={withStatus("cancelled", true)} status='cancelled' onSubmit={onSubmit} />
    );
    fireEvent.change(note(), { target: { value: "   " } });
    confirm();
    expect(screen.getByText("Vui lòng nhập lý do")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts 500 trimmed characters and rejects 501", () => {
    const onSubmit = vi.fn();
    render(
      <Harness detail={withStatus("cancelled", false)} status='cancelled' onSubmit={onSubmit} />
    );
    fireEvent.change(note(), { target: { value: ` ${"a".repeat(501)} ` } });
    confirm();
    expect(screen.getByText("Ghi chú tối đa 500 ký tự")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(note(), { target: { value: ` ${"a".repeat(500)} ` } });
    confirm();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      status: "cancelled",
      expectedRevision: 4,
      note: "a".repeat(500)
    });
  });

  it("explains stock restoration for return and unchanged payment for paid cancellation", () => {
    const { unmount } = render(
      <Harness detail={withStatus("returned", false)} status='returned' onSubmit={vi.fn()} />
    );
    expect(screen.getByText(/tồn kho sẽ được hoàn lại/i)).toBeTruthy();
    unmount();
    render(
      <Harness detail={withStatus("cancelled", true)} status='cancelled' onSubmit={vi.fn()} />
    );
    expect(screen.getByText(/không tự động hoàn tiền/i)).toBeTruthy();
  });

  it("cannot submit an action that is no longer valid and shows the reason", () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        detail={withStatus("confirmed", false, false)}
        status='confirmed'
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByText("Không thể xử lý")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("treats an action missing from the fresh eligibility as invalid", () => {
    render(<Harness detail={withStatus("cancelled", false)} status='shipped' onSubmit={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Xác nhận" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
