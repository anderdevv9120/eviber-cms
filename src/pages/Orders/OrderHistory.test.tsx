import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { order } from "@/test/order-fixtures";
import OrderHistory from "./OrderHistory";

describe("order histories", () => {
  it("keeps recorded event order, actors, notes and classified payment references", () => {
    render(
      <OrderHistory
        order={{
          ...order,
          statusHistory: [
            {
              status: "shipped",
              changedAt: "2026-10-04T08:00:00Z",
              changedBy: {
                actorType: "admin",
                actorName: "staff@example.test",
                actorId: "staff-id"
              },
              note: "Đã bàn giao"
            },
            {
              status: "confirmed",
              changedAt: "2026-10-03T08:00:00Z",
              changedBy: { actorType: "system" },
              note: "Tự động"
            }
          ],
          paymentHistory: [
            {
              status: "paid",
              action: "receipt",
              changedAt: "2026-10-03T08:00:00Z",
              changedBy: { actorType: "admin", actorName: "Thu ngân" },
              note: "Nhận đủ",
              reference: "REF-1"
            },
            { status: "refunded", action: "refund", note: "Hoàn đủ", reference: "REF-2" },
            { status: "paid", action: "correction", note: "Ghi nhầm hoàn tiền", reference: "REF-3" }
          ]
        }}
      />
    );
    const fulfillment = within(screen.getByRole("region", { name: "Lịch sử đơn hàng" }));
    const rows = fulfillment.getAllByRole("row");
    expect(rows[1].textContent).toContain("Đang giao hàng");
    expect(rows[2].textContent).toContain("Đã xác nhận");
    expect(fulfillment.getByText("staff@example.test")).toBeTruthy();
    expect(fulfillment.getByText("Quản trị viên")).toBeTruthy();
    expect(fulfillment.getByText("Hệ thống")).toBeTruthy();
    expect(fulfillment.getByText("Đã bàn giao")).toBeTruthy();
    expect(fulfillment.getByText(/4\/10\/2026/)).toBeTruthy();
    const payment = within(screen.getByRole("region", { name: "Lịch sử thanh toán" }));
    for (const text of [
      "Ghi nhận thanh toán",
      "Ghi nhận hoàn tiền",
      "Điều chỉnh trạng thái thanh toán",
      "Thu ngân",
      "Nhận đủ",
      "Ghi nhầm hoàn tiền",
      "REF-1",
      "REF-2",
      "REF-3"
    ])
      expect(payment.getByText(text)).toBeTruthy();
  });

  it("shows unclassified legacy events without inventing actors or timestamps", () => {
    render(
      <OrderHistory
        order={{
          ...order,
          statusHistory: [{ status: "pending" }],
          paymentHistory: [{ status: "paid" }]
        }}
      />
    );
    expect(screen.getByText("Thay đổi cũ (chưa phân loại)")).toBeTruthy();
    expect(screen.getAllByText("Chưa có dữ liệu").length).toBeGreaterThan(3);
    expect(screen.queryByText("Ghi nhận thanh toán")).toBeNull();
    expect(screen.queryByText("Quản trị viên")).toBeNull();
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it("labels the system free-order entry as no payment required, not a legacy change", () => {
    render(
      <OrderHistory
        order={{
          ...order,
          paymentStatus: "not_required",
          paymentHistory: [
            {
              status: "not_required",
              changedAt: "2026-10-08T01:00:00Z",
              changedBy: { actorType: "system" },
              note: "Không cần thanh toán: tổng đơn hàng bằng 0 VND."
            }
          ]
        }}
      />
    );
    const payment = within(screen.getByRole("region", { name: "Lịch sử thanh toán" }));
    const row = payment.getAllByRole("row")[1];
    expect(within(row).getAllByText("Không cần thanh toán")).toHaveLength(2);
    expect(within(row).getByText("Hệ thống")).toBeTruthy();
    expect(payment.queryByText("Thay đổi cũ (chưa phân loại)")).toBeNull();
  });

  it.each([undefined, []])("handles absent and empty histories (%s)", histories => {
    render(
      <OrderHistory order={{ ...order, statusHistory: histories, paymentHistory: histories }} />
    );
    expect(
      within(screen.getByRole("region", { name: "Lịch sử đơn hàng" })).getByText(
        "Chưa ghi nhận lịch sử"
      )
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Lịch sử thanh toán" })).getByText(
        "Chưa ghi nhận lịch sử"
      )
    ).toBeTruthy();
    expect(screen.queryByRole("row")).toBeNull();
  });
});
