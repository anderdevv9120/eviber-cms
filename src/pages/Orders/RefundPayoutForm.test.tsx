import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import dayjs from "dayjs";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, response } from "@/test/order-fixtures";
import type {
  AdminRefundOrderView,
  AdminRefundRequest,
  AdminRefundRequestItem,
  RefundClaimView,
  RefundOrderAllocationView,
  RefundPayoutView
} from "@/services/refunds";
import RefundSection from "./RefundSection";

type Call = { method: string; url: string; body?: Record<string, unknown> };
type Handler = (config: InternalAxiosRequestConfig) => AxiosResponse | Promise<AxiosResponse>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUNDS = "/orders/order-id/refunds";
const calls: Call[] = [];
const serve = (handlers: Record<string, Handler>) => {
  calls.length = 0;
  axiosRequest.defaults.adapter = async config => {
    const call: Call = {
      method: config.method ?? "",
      url: config.url ?? "",
      body: config.data ? JSON.parse(config.data) : undefined
    };
    calls.push(call);
    const handler = handlers[`${call.method} ${call.url}`];
    if (!handler) throw new Error(`Unexpected request ${call.method} ${call.url}`);
    return handler(config);
  };
};
const fail = (config: InternalAxiosRequestConfig, status: number, message: string, code?: string) =>
  Promise.reject(
    new AxiosError(message, "ERR_BAD_REQUEST", config, null, {
      config,
      data: { message, errors: code ? { code } : undefined },
      status,
      statusText: "",
      headers: {}
    })
  );
const lostResponse = (config: InternalAxiosRequestConfig) =>
  Promise.reject(new AxiosError("Network Error", "ERR_NETWORK", config));
const writes = () => calls.filter(call => call.method === "post");

const allocation: RefundOrderAllocationView = {
  allocationId: "a1",
  productInfoIndex: 0,
  productName: "Áo tại thời điểm mua",
  variantLabel: "SKU-S",
  purchasedQuantity: 3,
  availableQuantity: 0,
  requestedQuantity: 3,
  refundedQuantity: 0,
  netAmount: 270000,
  availableAmount: 0,
  requestedAmount: 270000,
  refundedAmount: 0,
  productRefundEnabled: true
};
const item: AdminRefundRequestItem = {
  allocationId: "a1",
  productInfoIndex: 0,
  quantity: 3,
  reason: "ordinary",
  explanation: "Không vừa size",
  requestedReturn: "no_return",
  evidenceIds: [],
  approvedQuantity: 3,
  approvedAmount: 270000,
  returnRequired: false,
  receivedQuantity: 0,
  netAmount: 270000,
  decisionReason: null,
  sellableQuantity: 0,
  ranges: [{ allocationId: "a1", start: 0, quantity: 3 }]
};
const approval = {
  merchandiseAmount: 270000,
  shippingAmount: 0,
  amount: 270000,
  frozenAt: "2026-10-23T00:00:00.000Z"
};
const claim: RefundClaimView = {
  claimId: "c1",
  claimedAt: "2026-10-23T00:00:00.000Z",
  merchandiseAmount: 270000,
  shippingAmount: 0,
  amount: 270000
};
const payout: RefundPayoutView = {
  merchandiseAmount: 270000,
  shippingAmount: 0,
  amount: 270000,
  paidAt: "2026-10-24T05:00:00.000Z",
  recordedAt: "2026-10-24T06:00:00.000Z",
  reference: "FT-REAL-1"
};
const baseRequest: AdminRefundRequest = {
  requestId: "r1",
  stage: "awaiting_payout",
  submittedAt: "2026-10-22T03:00:00.000Z",
  items: [item],
  shipping: { reservedAmount: 0, approvedAmount: 0 },
  history: [{ event: "submitted", at: "2026-10-22T03:00:00.000Z", customerMessage: null }],
  payout: null,
  exceptionReason: null,
  reviewRequired: false,
  inspections: [],
  approval: null,
  claim: null
};
const makeView = (
  patch: Partial<AdminRefundRequest> = {},
  rest: Partial<AdminRefundOrderView> = {}
): AdminRefundOrderView => ({
  orderId: "order-id",
  orderNumber: "ORD-SNAPSHOT",
  revision: 4,
  policy: { enabled: true, windowDays: 7 },
  deadline: "2026-10-30T00:00:00.000Z",
  eligibility: { eligible: true, reviewRequired: false, reason: null },
  allocations: [allocation],
  remainingPaidShipping: 0,
  summary: {
    activeStages: ["awaiting_payout"],
    paidAmount: 0,
    paidShippingAmount: 0,
    coverage: "none",
    requestCount: 1,
    reviewRequired: false
  },
  requests: [{ ...baseRequest, ...patch }],
  canReview: false,
  canPay: true,
  ...rest
});
const awaitingPayout = makeView();
const claimed = (revision = 5) =>
  makeView({ stage: "payout_in_progress", approval, claim }, { revision });
const completed = makeView(
  { stage: "refunded", approval, payout, claim: null },
  {
    revision: 6,
    summary: {
      activeStages: [],
      paidAmount: 270000,
      paidShippingAmount: 0,
      coverage: "full",
      requestCount: 1,
      reviewRequired: false
    }
  }
);

const renderSection = () => {
  const onCommitted = vi.fn(async () => undefined);
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <RefundSection orderId='order-id' revision={4} onCommitted={onCommitted} />
      </ConfigProvider>
    </StrictMode>
  );
  return { onCommitted };
};
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const open = async (name: string) => fireEvent.click(await screen.findByRole("button", { name }));
const button = (name: string | RegExp) =>
  screen.queryByRole("button", { name }) as HTMLButtonElement | null;
const PAID_AT = "2026-10-24T12:00";
const selectTime = (label: string, time: string) => {
  const input = screen.getByRole("textbox", { name: label });
  fireEvent.change(input, { target: { value: dayjs(time).format("DD/MM/YYYY HH:mm") } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
};
const fillPayout = (
  values: { amount?: string; paidAt?: string; reference?: string } = {}
): void => {
  const { amount = "270000", paidAt = PAID_AT, reference = "FT-123" } = values;
  fireEvent.change(screen.getByRole("spinbutton", { name: "Số tiền đã hoàn" }), {
    target: { value: amount }
  });
  selectTime("Thời điểm đã chuyển tiền", paidAt);
  fireEvent.change(screen.getByRole("textbox", { name: "Mã tham chiếu giao dịch" }), {
    target: { value: reference }
  });
};
const notTransferred = "Ghi nhận hoàn tiền không thực hiện chuyển khoản.";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("refund payout claim and completion", () => {
  it("claim_before_transfer_then_record_completed_payout", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, awaitingPayout),
      [`post ${REFUNDS}/r1/payout-claim`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout`]: config => response(config, completed)
    });
    const { onCommitted } = renderSection();

    // Stage 1: nothing can be recorded before the amount is frozen by a claim.
    await screen.findByRole("button", { name: "Nhận xử lý hoàn tiền" });
    expect(screen.queryByRole("spinbutton", { name: "Số tiền đã hoàn" })).toBeNull();
    expect(
      screen.getByText(/Số tiền cần hoàn: 270\.000 ₫ \(hàng 270\.000 ₫, vận chuyển 0 ₫\)/)
    ).toBeTruthy();
    expect(screen.getByText(notTransferred)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    click("Nhận xử lý hoàn tiền");

    // Stage 2: the claim returns the frozen amount; only now can staff record the manual payout.
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID)
    });
    expect(screen.getByText(notTransferred)).toBeTruthy();
    fillPayout();
    click("Ghi nhận đã hoàn tiền");

    await screen.findByRole("region", { name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1" });
    expect(writes()).toHaveLength(2);
    expect(writes()[1].url).toBe(`${REFUNDS}/r1/payout`);
    expect(writes()[1].body).toEqual({
      expectedRevision: 5,
      idempotencyKey: expect.stringMatching(UUID),
      claimId: "c1",
      amount: 270000,
      paidAt: new Date(PAID_AT).toISOString(),
      reference: "FT-123"
    });
    expect(writes()[1].body?.idempotencyKey).not.toBe(writes()[0].body?.idempotencyKey);
    expect(button("Ghi nhận đã hoàn tiền")).toBeNull();
    expect(onCommitted).toHaveBeenCalledTimes(2);
    // The old PATCH path is never used.
    expect(calls.filter(call => call.method === "patch")).toHaveLength(0);
  });

  it("claim_by_other_admin_disables_actions", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, awaitingPayout),
      [`post ${REFUNDS}/r1/payout-claim`]: config =>
        fail(config, 409, "đang được xử lý", "refund00015")
    });
    renderSection();
    await screen.findByRole("button", { name: "Nhận xử lý hoàn tiền" });
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout-claim`]: config =>
        fail(config, 409, "đang được xử lý", "refund00015")
    });
    click("Nhận xử lý hoàn tiền");

    await screen.findByText("Yêu cầu đang được quản trị viên khác xử lý chi trả.");
    expect(button("Ghi nhận đã hoàn tiền")?.disabled).toBe(true);
    expect(button("Hủy nhận xử lý")?.disabled).toBe(true);
    expect(screen.queryByRole("spinbutton", { name: "Số tiền đã hoàn" })).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it("record_conflict_with_other_claimant_disables_actions", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout`]: config => fail(config, 409, "đang được xử lý", "refund00015")
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    expect(screen.queryByText("Yêu cầu đang được quản trị viên khác xử lý chi trả.")).toBeNull();
    fillPayout();
    click("Ghi nhận đã hoàn tiền");

    await screen.findByText("Yêu cầu đang được quản trị viên khác xử lý chi trả.");
    expect(button("Ghi nhận đã hoàn tiền")?.disabled).toBe(true);
    expect(button("Hủy nhận xử lý")?.disabled).toBe(true);
    expect(writes()).toHaveLength(1);
  });

  it("lost_response_reconciles_before_retry", async () => {
    let reads = 0;
    serve({
      [`get ${REFUNDS}`]: config => response(config, reads++ ? completed : claimed()),
      [`post ${REFUNDS}/r1/payout`]: config => lostResponse(config)
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    fillPayout();
    click("Ghi nhận đã hoàn tiền");

    // The transfer succeeded and was recorded, but its answer was lost: the GET shows the payout.
    const done = await screen.findByRole("region", {
      name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1"
    });
    expect(within(done).getByText(/FT-REAL-1/)).toBeTruthy();
    expect(button("Ghi nhận đã hoàn tiền")).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it("lost_response_retry_reuses_the_same_key_and_offers_a_status_check", async () => {
    let attempts = 0;
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout`]: config =>
        attempts++ ? response(config, completed) : lostResponse(config)
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    fillPayout();
    click("Ghi nhận đã hoàn tiền");
    await screen.findByText(/Chưa xác định được kết quả thao tác trước/);
    // Reconciliation read happened; the draft is kept and nothing tells staff to transfer again.
    expect(calls.filter(call => call.method === "get")).toHaveLength(2);
    expect(screen.queryByText(/chuyển lại|chuyển khoản lại/i)).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Mã tham chiếu giao dịch" }) as HTMLInputElement).value
    ).toBe("FT-123");
    click("Kiểm tra trạng thái");
    await waitFor(() => expect(calls.filter(call => call.method === "get")).toHaveLength(3));

    click("Ghi nhận đã hoàn tiền");
    await screen.findByRole("region", { name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1" });
    expect(writes()).toHaveLength(2);
    expect(writes()[1].body).toEqual(writes()[0].body);
  });

  it("release_requires_not_transferred_and_reason", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout-release`]: config =>
        response(config, makeView({ approval }, { revision: 6 }))
    });
    renderSection();
    await open("Hủy nhận xử lý");
    expect(screen.getByText(/Chỉ giải phóng khi đã đối chiếu ngân hàng/)).toBeTruthy();
    const reason = () => screen.getByRole("textbox", { name: "Lý do giải phóng" });
    const confirmed = () =>
      screen.getByRole("checkbox", {
        name: "Tôi đã đối chiếu ngân hàng và xác nhận chưa chuyển khoản"
      });

    click("Xác nhận giải phóng");
    expect(screen.getByText("Cần xác nhận chưa có khoản chuyển khoản nào")).toBeTruthy();
    expect(screen.getByText("Cần nhập lý do giải phóng")).toBeTruthy();
    fireEvent.click(confirmed());
    fireEvent.change(reason(), { target: { value: "   " } });
    click("Xác nhận giải phóng");
    expect(writes()).toHaveLength(0);
    fireEvent.click(confirmed());
    fireEvent.change(reason(), { target: { value: "Đã đối chiếu sao kê, chưa có giao dịch" } });
    click("Xác nhận giải phóng");
    expect(writes()).toHaveLength(0);
    fireEvent.click(confirmed());
    click("Xác nhận giải phóng");

    // Released: the same frozen contents can be claimed again; no timer or auto-release exists.
    await screen.findByRole("button", { name: "Nhận xử lý hoàn tiền" });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      expectedRevision: 5,
      idempotencyKey: expect.stringMatching(UUID),
      claimId: "c1",
      bankOutcome: "not_transferred",
      reason: "Đã đối chiếu sao kê, chưa có giao dịch"
    });
  });

  it("approval_never_displays_completed_refund", async () => {
    const completedRegion = { name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1" };
    for (const stage of [awaitingPayout, claimed()]) {
      serve({ [`get ${REFUNDS}`]: config => response(config, stage) });
      renderSection();
      await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
      expect(screen.queryByRole("region", completedRegion)).toBeNull();
      const summary = within(screen.getByRole("region", { name: "Hoàn tiền" }));
      expect(summary.getByText("Chưa hoàn")).toBeTruthy();
      cleanup();
    }
    // Even a reviewer who cannot pay sees an approval as pending, not as money returned.
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, makeView({ approval }, { canPay: false, canReview: true }))
    });
    renderSection();
    await screen.findByText(/Đã duyệt hoàn: 270\.000 ₫/);
    expect(screen.queryByRole("region", completedRegion)).toBeNull();
  });

  it("payer_without_review_permission_cannot_change_decisions", async () => {
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, makeView({ stage: "awaiting_review" }, { canReview: false, canPay: true }))
    });
    renderSection();
    await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
    expect(screen.queryAllByRole("button").map(entry => entry.textContent)).toEqual([]);
  });

  it("record_validates_amount_time_and_reference", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout`]: config => response(config, completed)
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");

    click("Ghi nhận đã hoàn tiền");
    for (const message of [
      "Nhập số tiền đã hoàn",
      "Nhập thời điểm đã chuyển tiền",
      "Nhập mã tham chiếu giao dịch"
    ])
      expect(screen.getByText(message)).toBeTruthy();
    fillPayout({ amount: "269999" });
    click("Ghi nhận đã hoàn tiền");
    expect(screen.getByText("Số tiền phải đúng bằng 270.000 ₫")).toBeTruthy();
    fillPayout({ paidAt: "2026-10-22T12:00" });
    click("Ghi nhận đã hoàn tiền");
    expect(screen.getByText("Thời điểm chuyển tiền không được trước lúc nhận xử lý")).toBeTruthy();
    fillPayout({ paidAt: "2026-10-26T12:00" });
    click("Ghi nhận đã hoàn tiền");
    expect(screen.getByText("Thời điểm chuyển tiền không được ở tương lai")).toBeTruthy();
    fillPayout({ reference: "r".repeat(101) });
    click("Ghi nhận đã hoàn tiền");
    expect(screen.getByText("Mã tham chiếu tối đa 100 ký tự")).toBeTruthy();
    fillPayout({ reference: "   " });
    click("Ghi nhận đã hoàn tiền");
    expect(writes()).toHaveLength(0);

    fillPayout({ reference: ` ${"r".repeat(100)} ` });
    click("Ghi nhận đã hoàn tiền");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.reference).toBe("r".repeat(100));
  }, 15000);

  it("double_click_sends_one_command", async () => {
    const pending = deferred<AxiosResponse>();
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed()),
      [`post ${REFUNDS}/r1/payout`]: () => pending.promise
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    fillPayout();
    const record = screen.getByRole("button", { name: "Ghi nhận đã hoàn tiền" });
    fireEvent.click(record);
    fireEvent.click(record);
    await waitFor(() => expect(writes()).toHaveLength(1));
    pending.resolve(response({} as InternalAxiosRequestConfig, completed));
    await screen.findByRole("region", { name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1" });
    expect(writes()).toHaveLength(1);
  });

  it("stale_revision_keeps_the_draft_until_the_new_view_is_reviewed", async () => {
    let reads = 0;
    serve({
      [`get ${REFUNDS}`]: config => response(config, claimed(reads++ ? 6 : 5)),
      [`post ${REFUNDS}/r1/payout`]: config =>
        fail(config, 409, "Đơn hàng đã thay đổi", "order00006")
    });
    renderSection();
    await screen.findByText("Số tiền đã cố định để hoàn: 270.000 ₫");
    fillPayout();
    click("Ghi nhận đã hoàn tiền");
    await screen.findByText(/Dữ liệu mới nhất đã được tải/);
    expect(screen.queryByText("Yêu cầu đang được quản trị viên khác xử lý chi trả.")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Mã tham chiếu giao dịch" }) as HTMLInputElement).value
    ).toBe("FT-123");
    expect(button("Ghi nhận đã hoàn tiền")?.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tôi đã xem lại dữ liệu mới nhất" }));
    expect(button("Ghi nhận đã hoàn tiền")?.disabled).toBe(false);
  });

  it("completed_payout_keeps_history_and_ends_the_form", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, completed) });
    renderSection();
    const done = within(
      await screen.findByRole("region", { name: "Khoản hoàn tiền đã hoàn tất của yêu cầu 1" })
    );
    expect(done.getByText(/Đã hoàn tiền: 270\.000 ₫/)).toBeTruthy();
    expect(done.getByText(/FT-REAL-1/)).toBeTruthy();
    expect(done.getByText(/24\/10\/2026|10\/24\/2026/)).toBeTruthy();
    for (const name of [
      "Nhận xử lý hoàn tiền",
      "Ghi nhận đã hoàn tiền",
      "Hủy nhận xử lý",
      "Kiểm tra trạng thái"
    ])
      expect(button(name)).toBeNull();
  });
});
