import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/order-fixtures";
import * as api from "./refunds";

vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));
import { errorNotification } from "@/utils/notification";

const view: api.AdminRefundOrderView = {
  orderId: "o",
  orderNumber: "ORD-1",
  revision: 8,
  policy: { enabled: true, windowDays: 7 },
  deadline: null,
  eligibility: { eligible: false, reviewRequired: true, reason: "Thiếu lịch sử giao hàng" },
  allocations: [],
  remainingPaidShipping: 0,
  summary: {
    activeStages: [],
    paidAmount: 0,
    paidShippingAmount: 0,
    coverage: "none",
    requestCount: 0,
    reviewRequired: true
  },
  requests: [],
  canReview: true,
  canPay: false
};

describe("admin refund transport", () => {
  it("preserves the admin view envelope and read cancellation with encoded order IDs", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, view);
    };
    const signal = new AbortController().signal;
    expect(await api.getOrderRefundsAPI("id /?#", signal)).toEqual({
      data: view,
      message: "success"
    });
    expect(calls.map(c => [c.method, c.url, c.signal, c.toastError])).toEqual([
      ["get", "/orders/id%20%2F%3F%23/refunds", signal, false]
    ]);
    expect(calls[0].headers.Authorization).toBe("Bearer test-admin");
  });

  it("sends exact commands without changing revisions, keys or financial data", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { ...view, revision: 9 });
    };
    const command = { expectedRevision: 8, idempotencyKey: "a63cc256-d0a7-497c-93ad-598862ce0ffd" };
    const selection = {
      allocationId: "a1",
      quantity: 1,
      reason: "ordinary" as const,
      explanation: "Không phù hợp",
      requestedReturn: "return" as const,
      evidenceIds: ["e1"]
    };
    const create = {
      ...command,
      exceptionReason: "Ngoại lệ",
      items: [selection],
      shippingOnly: false
    };
    const legacy = {
      ...command,
      receivedAmount: 100000,
      allocations: [{ productInfoIndex: 0, netAmount: 80000 }],
      shippingAmount: 20000,
      reason: "Đã kiểm tra",
      deliveredAt: "2026-10-23T00:00:00.000Z"
    };
    const decision = {
      ...command,
      items: [
        { allocationId: "a1", approvedQuantity: 1, returnRequired: true, reason: "Chấp nhận" }
      ],
      shippingAmount: 20000,
      customerMessage: "Gửi hàng lại",
      internalNote: "Nội bộ"
    };
    const inspection = {
      ...command,
      items: [
        {
          allocationId: "a1",
          receivedQuantity: 1,
          sellableQuantity: 0,
          confirmedPurchasedVariant: true
        }
      ],
      note: "Đã nhận"
    };
    const release = {
      ...command,
      claimId: "claim-1",
      bankOutcome: "not_transferred" as const,
      reason: "Chưa chuyển"
    };
    const payout = {
      ...command,
      claimId: "claim-1",
      amount: 100000,
      paidAt: "2026-10-24T00:00:00.000Z",
      reference: "BANK-1"
    };
    const results = [
      await api.createAdminRefundAPI("id /?#", create),
      await api.reviewLegacyRefundAPI("id /?#", legacy),
      await api.decideRefundAPI("id /?#", "r /?#", decision),
      await api.inspectRefundAPI("id /?#", "r /?#", inspection),
      await api.claimRefundPayoutAPI("id /?#", "r /?#", command),
      await api.releaseRefundPayoutAPI("id /?#", "r /?#", release),
      await api.recordRefundPayoutAPI("id /?#", "r /?#", payout)
    ];
    expect(results).toEqual(Array(7).fill({ data: { ...view, revision: 9 }, message: "success" }));
    const root = "/orders/id%20%2F%3F%23";
    const request = `${root}/refunds/r%20%2F%3F%23`;
    expect(calls.map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      ["post", `${root}/refunds`, create, false],
      ["post", `${root}/refund-legacy-review`, legacy, false],
      ["post", `${request}/decision`, decision, false],
      ["post", `${request}/inspections`, inspection, false],
      ["post", `${request}/payout-claim`, command, false],
      ["post", `${request}/payout-release`, release, false],
      ["post", `${request}/payout`, payout, false]
    ]);
  });

  it.each([409, undefined])("leaves payout failure %s inline without replaying", async status => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      throw new AxiosError(
        "failed",
        status ? "ERR_BAD_REQUEST" : AxiosError.ERR_NETWORK,
        config,
        null,
        status
          ? {
              config,
              data: { message: "Đơn hàng đã thay đổi" },
              status,
              statusText: "Conflict",
              headers: {}
            }
          : undefined
      );
    };
    await expect(
      api.recordRefundPayoutAPI("o", "r", {
        expectedRevision: 8,
        idempotencyKey: "key",
        claimId: "claim",
        amount: 80000,
        paidAt: "2026-10-24T00:00:00.000Z",
        reference: "BANK-1"
      })
    ).rejects.toEqual(
      new ApiError(
        status ? "Đơn hàng đã thay đổi" : "Không thể kết nối đến máy chủ, vui lòng thử lại",
        status
      )
    );
    expect(calls).toHaveLength(1);
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
