import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import RefundReviewForm from "./RefundReviewForm";
import RefundInspectionForm from "./RefundInspectionForm";
import RefundExceptionForm from "./RefundExceptionForm";
import RefundPayoutForm from "./RefundPayoutForm";
import { ConfigProvider } from "antd";
import dayjs from "dayjs";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { deferred, order, response } from "@/test/order-fixtures";
import type {
  AdminRefundOrderView,
  AdminRefundRequest,
  AdminRefundRequestItem,
  RefundOrderAllocationView
} from "@/services/refunds";
import RefundSection from "./RefundSection";

type Call = { method: string; url: string; body?: Record<string, unknown>; responseType?: string };
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
      body: config.data ? JSON.parse(config.data) : undefined,
      responseType: config.responseType
    };
    calls.push(call);
    const handler = handlers[`${call.method} ${call.url}`];
    if (!handler) throw new Error(`Unexpected request ${call.method} ${call.url}`);
    return handler(config);
  };
};
const fail = (config: InternalAxiosRequestConfig, status: number, message: string) =>
  Promise.reject(
    new AxiosError(message, "ERR_BAD_REQUEST", config, null, {
      config,
      data: { message },
      status,
      statusText: "",
      headers: {}
    })
  );
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
const itemLabel = "Áo tại thời điểm mua (SKU-S)";
const item: AdminRefundRequestItem = {
  allocationId: "a1",
  productInfoIndex: 0,
  quantity: 3,
  reason: "ordinary",
  explanation: "Không vừa size",
  requestedReturn: "return",
  evidenceIds: [],
  approvedQuantity: 0,
  approvedAmount: 0,
  returnRequired: false,
  receivedQuantity: 0,
  netAmount: 270000,
  decisionReason: null,
  sellableQuantity: 0,
  ranges: [{ allocationId: "a1", start: 0, quantity: 3 }]
};
const request: AdminRefundRequest = {
  requestId: "r1",
  stage: "awaiting_review",
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
const view: AdminRefundOrderView = {
  orderId: "order-id",
  orderNumber: "ORD-SNAPSHOT",
  revision: 4,
  policy: { enabled: true, windowDays: 7 },
  deadline: "2026-10-30T00:00:00.000Z",
  eligibility: { eligible: true, reviewRequired: false, reason: null },
  allocations: [allocation],
  remainingPaidShipping: 30000,
  summary: {
    activeStages: ["awaiting_review"],
    paidAmount: 0,
    paidShippingAmount: 0,
    coverage: "none",
    requestCount: 1,
    reviewRequired: false
  },
  requests: [request],
  canReview: true,
  canPay: false
};
const withRequest = (
  patch: Partial<AdminRefundRequest>,
  itemPatch: Partial<AdminRefundRequestItem> = {}
) => ({
  ...view,
  requests: [{ ...request, ...patch, items: [{ ...item, ...itemPatch }] }]
});
const legacyView = (netAmount: number): AdminRefundOrderView => ({
  ...view,
  eligibility: {
    eligible: false,
    reviewRequired: true,
    reason: "Recorded delivery event is missing"
  },
  deadline: null,
  policy: null,
  allocations: [
    {
      ...allocation,
      allocationId: "legacy:0",
      purchasedQuantity: 2,
      requestedQuantity: 0,
      netAmount
    }
  ],
  remainingPaidShipping: 0,
  requests: [],
  summary: { ...view.summary, activeStages: [], requestCount: 0, reviewRequired: true }
});

const renderSection = (props: Partial<Parameters<typeof RefundSection>[0]> = {}) => {
  const onCommitted = vi.fn(async () => undefined);
  const ui = (next: Partial<Parameters<typeof RefundSection>[0]> = {}) => (
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <RefundSection
          orderId='order-id'
          revision={4}
          onCommitted={onCommitted}
          {...props}
          {...next}
        />
      </ConfigProvider>
    </StrictMode>
  );
  const utils = render(ui());
  return {
    onCommitted,
    rerender: (next: Partial<Parameters<typeof RefundSection>[0]>) => utils.rerender(ui(next))
  };
};
const field = (role: "spinbutton" | "textbox" | "checkbox", name: string | RegExp) =>
  screen.getByRole(role, { name }) as HTMLInputElement;
const type = (role: "spinbutton" | "textbox", name: string | RegExp, value: string) =>
  fireEvent.change(field(role, name), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const open = async (name: string) => fireEvent.click(await screen.findByRole("button", { name }));
const reviewButtons = () =>
  screen
    .queryAllByRole("button")
    .filter(button => button.tagName === "BUTTON")
    .map(button => button.textContent);

describe("admin refund section", () => {
  it("focuses only the requested refund after loading without opening a write form", async () => {
    const id = "000000000000000000000012";
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, {
          ...view,
          requests: [request, { ...request, requestId: id }]
        })
    });
    const { rerender } = renderSection({ requestId: id });
    const target = await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 2" });
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(document.querySelector("#refunds")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(writes()).toHaveLength(0);
    fireEvent.click(within(target).getByRole("button", { name: "Duyệt yêu cầu" }));
    type("textbox", `Lý do quyết định ${itemLabel}`, "Keep destination draft");
    rerender({ requestId: "000000000000000000000013" });
    expect(await screen.findByText("Yêu cầu hoàn tiền không còn khả dụng")).toBeTruthy();
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Keep destination draft");
  });

  it("opens a completed request when targeted by a notification", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, withRequest({ stage: "rejected" }))
    });
    const { rerender } = renderSection();
    const target = await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
    expect(within(target).queryByRole("list", { name: "Sản phẩm của yêu cầu 1" })).toBeNull();
    rerender({ requestId: request.requestId });
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(within(target).getByRole("list", { name: "Sản phẩm của yêu cầu 1" })).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("reports a missing refund request without focusing another request", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection({ requestId: "000000000000000000000012" });
    expect(await screen.findByText("Yêu cầu hoàn tiền không còn khả dụng")).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).not.toBe("Yêu cầu hoàn tiền 1");
  });
  beforeEach(() => useAppStore.getState().setProfile(ownerProfile));
  it("shows customer context once while reviewing and restores it when closed", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await open("Duyệt yêu cầu");
    expect(screen.getAllByText("Giải thích của khách: Không vừa size")).toHaveLength(1);
    expect(screen.getAllByText("Khách yêu cầu: 3")).toHaveLength(1);
    expect(screen.getByText("Khách chọn: Trả hàng")).toBeTruthy();
    const form = screen.getByRole("form", { name: "Duyệt yêu cầu hoàn tiền" });
    expect(within(form).getByText("Giải thích của khách: Không vừa size")).toBeTruthy();
    type("textbox", `Lý do quyết định ${itemLabel}`, "Giữ bản nháp");
    click(/Yêu cầu 1/);
    expect(screen.queryByRole("form", { name: "Duyệt yêu cầu hoàn tiền" })).toBeNull();
    click(/Yêu cầu 1/);
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Giữ bản nháp");
    click("Đóng");
    expect(screen.getAllByText("Giải thích của khách: Không vừa size")).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Sản phẩm của yêu cầu 1" })).toBeTruthy();
  });
  it("keeps balances and history collapsed until staff open them", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    const balances = await screen.findByRole("button", { name: "Chi tiết số lượng có thể hoàn" });
    expect(balances.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(balances);
    expect(screen.getByRole("table").textContent).toContain(itemLabel);
    expect(screen.queryByRole("group", { name: "Lịch sử yêu cầu 1" })).toBeNull();
    click("Lịch sử xử lý");
    expect(screen.getByRole("group", { name: "Lịch sử yêu cầu 1" })).toBeTruthy();
  });
  it("summarizes completed requests and keeps their earlier amounts in history", async () => {
    const completed = withRequest(
      {
        stage: "refunded",
        approval: {
          amount: 90000,
          merchandiseAmount: 90000,
          shippingAmount: 0,
          frozenAt: request.submittedAt
        },
        payout: {
          amount: 90000,
          merchandiseAmount: 90000,
          shippingAmount: 0,
          paidAt: request.submittedAt,
          recordedAt: request.submittedAt,
          reference: "BANK-1"
        }
      },
      { approvedQuantity: 1, approvedAmount: 90000 }
    );
    serve({ [`get ${REFUNDS}`]: config => response(config, completed) });
    renderSection();
    expect(await screen.findByText("Đã hoàn tiền: 90.000 ₫")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sản phẩm của yêu cầu 1" })).toBeNull();
    click(/Yêu cầu 1/);
    expect(screen.getByRole("list", { name: "Sản phẩm của yêu cầu 1" })).toBeTruthy();
    expect(screen.queryByText("Đã duyệt hoàn: 90.000 ₫")).toBeNull();
    click("Lịch sử xử lý");
    expect(screen.getByText(/^Đã duyệt hoàn: 90\.000 ₫/)).toBeTruthy();
  });
  it("labels every refund history event in Vietnamese", async () => {
    const events = [
      ["submitted", "Đã gửi yêu cầu"],
      ["decided", "Đã duyệt yêu cầu"],
      ["rejected", "Đã từ chối yêu cầu"],
      ["inspection", "Đã kiểm tra hàng trả"],
      ["return_received", "Đã nhận đủ hàng trả"],
      ["payout_claimed", "Đã nhận xử lý hoàn tiền"],
      ["payout_released", "Đã hủy nhận xử lý hoàn tiền"],
      ["payout_recorded", "Đã ghi nhận hoàn tiền"],
      ["future_refund_event", "Đã cập nhật yêu cầu"]
    ];
    serve({
      [`get ${REFUNDS}`]: config =>
        response(
          config,
          withRequest({
            history: events.map(([event]) => ({
              event,
              at: request.submittedAt,
              customerMessage: event === "decided" ? "Đồng ý hoàn tiền" : null
            }))
          })
        )
    });
    renderSection();
    await open("Lịch sử xử lý");
    const history = await screen.findByRole("group", { name: "Lịch sử yêu cầu 1" });
    for (const [event, label] of events) {
      expect(history.textContent).toContain(label);
      expect(history.textContent).not.toContain(event);
    }
    expect(history.textContent).toContain("Tin nhắn gửi khách: Đồng ý hoàn tiền");
  });
  it("hides loaded refund reads on revocation while retaining a closable review draft", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Keep revoked draft");
    const draft = field("textbox", `Lý do quyết định ${itemLabel}`);
    const reads = calls.length;

    await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
    expect(screen.queryByText("Chính sách khi mua")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("group", { name: "Lịch sử yêu cầu 1" })).toBeNull();
    expect(screen.queryByLabelText("Đang tải dữ liệu hoàn tiền")).toBeNull();
    expect(draft.value).toBe("Keep revoked draft");
    expect(draft.disabled).toBe(true);
    expect(draft.isConnected).toBe(true);
    expect(calls).toHaveLength(reads);

    click("Đóng");
    expect(screen.queryByRole("form", { name: "Duyệt yêu cầu hoàn tiền" })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("ends pending refund loading on revocation and ignores the late response", async () => {
    const pending = deferred<AxiosResponse>();
    let config: InternalAxiosRequestConfig | undefined;
    serve({
      [`get ${REFUNDS}`]: next => {
        config = next;
        return pending.promise;
      }
    });
    renderSection();
    await waitFor(() => expect(config).toBeDefined());
    expect(screen.getByLabelText("Đang tải dữ liệu hoàn tiền")).toBeTruthy();
    const reads = calls.length;
    await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
    expect(config!.signal!.aborted).toBe(true);
    expect(screen.queryByLabelText("Đang tải dữ liệu hoàn tiền")).toBeNull();
    await act(async () => pending.resolve(response(config!, view)));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Chính sách khi mua")).toBeNull();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
    expect(calls).toHaveLength(reads);
  });
  it.each(["ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"] as const)(
    "hides old capabilities and amounts until the %s-only reload resolves",
    async remaining => {
      useAppStore
        .getState()
        .setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"]));
      const pending = deferred<AxiosResponse>();
      let reloadConfig: InternalAxiosRequestConfig | undefined;
      let reloading = false;
      serve({
        [`get ${REFUNDS}`]: config => {
          if (!reloading) return response(config, { ...view, canPay: true });
          reloadConfig = config;
          return pending.promise;
        }
      });
      renderSection();
      await open("Duyệt yêu cầu");
      type("textbox", `Lý do quyết định ${itemLabel}`, "Keep partial draft");
      const draft = field("textbox", `Lý do quyết định ${itemLabel}`);
      reloading = true;
      await act(async () =>
        useAppStore.getState().setProfile(staffProfile(["ORDER_READ", remaining]))
      );
      await waitFor(() => expect(reloadConfig).toBeDefined());
      expect(screen.queryByText("Chính sách khi mua")).toBeNull();
      expect(screen.queryByText(/30\.000/)).toBeNull();
      expect(screen.queryByText("Giải thích của khách: Không vừa size")).toBeNull();
      expect(screen.queryByRole("button", { name: "Tạo yêu cầu ngoại lệ" })).toBeNull();
      expect(draft.value).toBe("Keep partial draft");
      expect(draft.disabled).toBe(true);
      fireEvent.submit(screen.getByRole("form", { name: "Duyệt yêu cầu hoàn tiền" }));
      expect(writes()).toHaveLength(0);
      await act(async () =>
        pending.resolve(
          response(reloadConfig!, {
            ...view,
            canReview: remaining === "ORDER_REFUND_REVIEW",
            canPay: remaining === "ORDER_REFUND_PAY",
            remainingPaidShipping: 12000
          })
        )
      );
      await open("Chi tiết số lượng có thể hoàn");
      expect(await screen.findByText(/^Phí vận chuyển còn có thể hoàn: 12\.000/)).toBeTruthy();
      expect(screen.queryByText(/30\.000/)).toBeNull();
      expect(draft.isConnected).toBe(true);
      expect(draft.value).toBe("Keep partial draft");
      expect(draft.disabled).toBe(remaining !== "ORDER_REFUND_REVIEW");
    }
  );
  it("shows a failed authority refresh and retries without discarding the draft", async () => {
    let failed = false;
    serve({
      [`get ${REFUNDS}`]: config =>
        failed ? fail(config, 503, "Refresh unavailable") : response(config, view)
    });
    renderSection();
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Keep failed-refresh draft");
    const draft = field("textbox", `Lý do quyết định ${itemLabel}`);
    failed = true;
    await act(async () =>
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_PAY"]))
    );
    expect(await screen.findByText("Refresh unavailable")).toBeTruthy();
    expect(screen.queryByText("Chính sách khi mua")).toBeNull();
    expect(draft.isConnected).toBe(true);
    failed = false;
    click("Thử lại");
    expect(await screen.findByText("Chính sách khi mua")).toBeTruthy();
    expect(draft.value).toBe("Keep failed-refresh draft");
    expect(draft.isConnected).toBe(true);
  });
  it("does not display an untouched automatic payout form after read revocation", async () => {
    const claimedView: AdminRefundOrderView = {
      ...view,
      canPay: true,
      requests: [
        {
          ...request,
          stage: "payout_in_progress",
          claim: {
            claimId: "c1",
            claimedAt: "2026-10-23T00:00:00.000Z",
            merchandiseAmount: 270000,
            shippingAmount: 0,
            amount: 270000
          }
        }
      ]
    };
    serve({ [`get ${REFUNDS}`]: config => response(config, claimedView) });
    renderSection();
    await screen.findByRole("form", { name: "Ghi nhận hoàn tiền đã chuyển" });
    await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
    expect(screen.queryByRole("form", { name: "Ghi nhận hoàn tiền đã chuyển" })).toBeNull();
    expect(screen.queryByText(/Số tiền đã cố định/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Hủy nhận xử lý" })).toBeNull();
  });
  it("never mounts payout forms for an initial review-only view", async () => {
    useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW"]));
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, {
          ...view,
          canPay: false,
          requests: [
            {
              ...request,
              stage: "payout_in_progress",
              claim: {
                claimId: "c1",
                claimedAt: "2026-10-23T00:00:00.000Z",
                merchandiseAmount: 270000,
                shippingAmount: 0,
                amount: 270000
              }
            }
          ]
        })
    });
    renderSection();
    await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
    expect(screen.queryByLabelText("Ghi nhận hoàn tiền đã chuyển")).toBeNull();
  });
  it.each(["record", "release"])(
    "retains an edited %s draft when the fresh view removes pay capability",
    async mode => {
      useAppStore
        .getState()
        .setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"]));
      const pending = deferred<AxiosResponse>();
      let pendingConfig: InternalAxiosRequestConfig | undefined;
      let refreshing = false;
      const claimedView: AdminRefundOrderView = {
        ...view,
        canPay: true,
        requests: [
          {
            ...request,
            stage: "payout_in_progress",
            claim: {
              claimId: "c1",
              claimedAt: "2026-10-23T00:00:00.000Z",
              merchandiseAmount: 270000,
              shippingAmount: 0,
              amount: 270000
            }
          }
        ]
      };
      serve({
        [`get ${REFUNDS}`]: config => {
          if (!refreshing) return response(config, claimedView);
          pendingConfig = config;
          return pending.promise;
        }
      });
      renderSection();
      await screen.findByRole("form", { name: "Ghi nhận hoàn tiền đã chuyển" });
      if (mode === "release") click("Hủy nhận xử lý");
      const label = mode === "record" ? "Mã tham chiếu giao dịch" : "Lý do giải phóng";
      type("textbox", label, "Keep payout draft");
      const draft = field("textbox", label);
      refreshing = true;
      await act(async () =>
        useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW"]))
      );
      expect(screen.queryByText(/Số tiền đã cố định/)).toBeNull();
      expect(draft.isConnected).toBe(true);
      expect(draft.disabled).toBe(true);
      await waitFor(() => expect(pendingConfig).toBeDefined());
      await act(async () =>
        pending.resolve(response(pendingConfig!, { ...claimedView, canPay: false }))
      );
      expect(draft.isConnected).toBe(true);
      expect(draft.value).toBe("Keep payout draft");
      expect(field("textbox", label)).toBe(draft);
      expect(draft.disabled).toBe(true);
      expect(writes()).toHaveLength(0);
      if (mode === "release") {
        click("Đóng");
        expect(screen.queryByRole("form", { name: "Giải phóng nhận xử lý" })).toBeNull();
      }
    }
  );
  it("rejects an explicit reload result if read authority changed while it was pending", async () => {
    useAppStore
      .getState()
      .setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"]));
    const pending = deferred<AxiosResponse>();
    let pendingConfig: InternalAxiosRequestConfig | undefined;
    let reads = 0;
    const claimedView: AdminRefundOrderView = {
      ...view,
      canPay: true,
      requests: [
        {
          ...request,
          stage: "payout_in_progress",
          claim: {
            claimId: "c1",
            claimedAt: "2026-10-23T00:00:00.000Z",
            merchandiseAmount: 270000,
            shippingAmount: 0,
            amount: 270000
          }
        }
      ]
    };
    serve({
      [`get ${REFUNDS}`]: config => {
        reads += 1;
        if (reads === 2) {
          pendingConfig = config;
          return pending.promise;
        }
        return response(
          config,
          reads === 1 ? claimedView : { ...view, remainingPaidShipping: 12000 }
        );
      }
    });
    const { onCommitted } = renderSection();
    await open("Kiểm tra trạng thái");
    await waitFor(() => expect(pendingConfig).toBeDefined());
    await act(async () =>
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_REVIEW"]))
    );
    await open("Chi tiết số lượng có thể hoàn");
    await screen.findByText(/^Phí vận chuyển còn có thể hoàn: 12\.000/);
    await act(async () =>
      pending.resolve(response(pendingConfig!, { ...claimedView, remainingPaidShipping: 99000 }))
    );
    expect(screen.queryByText(/99\.000/)).toBeNull();
    expect(screen.getByText(/12\.000/)).toBeTruthy();
    expect(onCommitted).not.toHaveBeenCalled();
  });
  it.each(["review", "inspect", "exception", "legacy", "record", "release"])(
    "%s keeps reload and its close/status escape usable after write revocation",
    async mode => {
      const reload = vi
        .fn()
        .mockRejectedValueOnce(new Error("Read unavailable"))
        .mockResolvedValue(undefined);
      const onClose = vi.fn();
      const ctx = { view: { ...view, canPay: true }, reload, commit: vi.fn() };
      const props = { ctx, labels: { a1: itemLabel }, onClose };
      const claim = {
        claimId: "c1",
        claimedAt: dayjs().subtract(2, "hour").toISOString(),
        merchandiseAmount: 270000,
        shippingAmount: 0,
        amount: 270000
      };
      serve({
        [`post ${REFUNDS}/r1/decision`]: config => fail(config, 409, "Stale revision"),
        [`post ${REFUNDS}/r1/inspections`]: config => fail(config, 409, "Stale revision"),
        [`post ${REFUNDS}`]: config => fail(config, 409, "Stale revision"),
        "post /orders/order-id/refund-legacy-review": config => fail(config, 409, "Stale revision"),
        [`post ${REFUNDS}/r1/payout`]: config => fail(config, 409, "Stale revision"),
        [`post ${REFUNDS}/r1/payout-release`]: config => fail(config, 409, "Stale revision")
      });
      render(
        mode === "review" ? (
          <RefundReviewForm {...props} request={request} />
        ) : mode === "inspect" ? (
          <RefundInspectionForm
            {...props}
            request={{
              ...request,
              stage: "awaiting_return",
              items: [{ ...item, approvedQuantity: 3, returnRequired: true }]
            }}
          />
        ) : mode === "exception" || mode === "legacy" ? (
          <RefundExceptionForm {...props} mode={mode === "legacy" ? "legacy" : "request"} />
        ) : (
          <RefundPayoutForm
            ctx={ctx}
            request={{ ...request, stage: "payout_in_progress", claim }}
          />
        )
      );
      let draft: HTMLInputElement;
      if (mode === "review") {
        type("textbox", `Lý do quyết định ${itemLabel}`, "Keep escape draft");
        draft = field("textbox", `Lý do quyết định ${itemLabel}`);
      } else if (mode === "inspect") {
        type("spinbutton", `Số lượng nhận trong lần này ${itemLabel}`, "1");
        type("textbox", "Ghi chú kiểm tra", "Keep escape draft");
        draft = field("textbox", "Ghi chú kiểm tra");
      } else if (mode === "exception") {
        fireEvent.click(field("checkbox", "Chỉ hoàn phí vận chuyển"));
        type("textbox", "Lý do ngoại lệ", "Keep escape draft");
        draft = field("textbox", "Lý do ngoại lệ");
      } else if (mode === "legacy") {
        type("spinbutton", "Số tiền đã thu", "270000");
        type("textbox", "Lý do đối soát", "Keep escape draft");
        fireEvent.click(field("checkbox", /Tôi xác nhận đã đối soát chứng từ/));
        draft = field("textbox", "Lý do đối soát");
      } else if (mode === "record") {
        type("spinbutton", "Số tiền đã hoàn", "270000");
        type(
          "textbox",
          "Thời điểm đã chuyển tiền",
          dayjs().subtract(1, "hour").format("DD/MM/YYYY HH:mm")
        );
        fireEvent.keyDown(field("textbox", "Thời điểm đã chuyển tiền"), {
          key: "Enter",
          code: "Enter"
        });
        type("textbox", "Mã tham chiếu giao dịch", "Keep escape draft");
        draft = field("textbox", "Mã tham chiếu giao dịch");
      } else {
        click("Hủy nhận xử lý");
        fireEvent.click(
          field("checkbox", "Tôi đã đối chiếu ngân hàng và xác nhận chưa chuyển khoản")
        );
        type("textbox", "Lý do giải phóng", "Keep escape draft");
        draft = field("textbox", "Lý do giải phóng");
      }
      const form = draft.closest("form")!;
      fireEvent.submit(form);
      const reloadButton = await screen.findByRole("button", { name: "Tải lại dữ liệu" });
      expect(writes()).toHaveLength(1);
      await act(async () =>
        useAppStore
          .getState()
          .setProfile(
            staffProfile([
              "ORDER_READ",
              mode === "record" || mode === "release" ? "ORDER_REFUND_REVIEW" : "ORDER_REFUND_PAY"
            ])
          )
      );
      expect(draft.value).toBe("Keep escape draft");
      expect(draft.disabled).toBe(true);
      expect(reloadButton).toHaveProperty("disabled", false);
      fireEvent.click(reloadButton);
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
      fireEvent.submit(form);
      expect(writes()).toHaveLength(1);
      if (mode === "record") {
        click("Kiểm tra trạng thái");
        await waitFor(() => expect(reload).toHaveBeenCalledTimes(3));
      } else {
        click("Đóng");
        if (mode === "release")
          expect(screen.queryByRole("form", { name: "Giải phóng nhận xử lý" })).toBeNull();
        else expect(onClose).toHaveBeenCalledOnce();
      }
    }
  );
  it("keeps refund reload usable after write revocation without allowing a write", async () => {
    let conflict = false;
    serve({
      [`get ${REFUNDS}`]: config => {
        return conflict ? fail(config, 503, "Read unavailable") : response(config, view);
      },
      [`post ${REFUNDS}/r1/decision`]: config => {
        conflict = true;
        return fail(config, 409, "Stale revision");
      }
    });
    renderSection();
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Keep reload draft");
    click("Xác nhận duyệt");
    const reload = (await screen.findByRole("button", {
      name: "Tải lại dữ liệu"
    })) as HTMLButtonElement;
    await act(async () =>
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_PAY"]))
    );
    expect(reload.disabled).toBe(false);
    const before = calls.length;
    fireEvent.click(reload);
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Keep reload draft");
    fireEvent.submit(screen.getByRole("form", { name: "Duyệt yêu cầu hoàn tiền" }));
    expect(writes()).toHaveLength(1);
    click("Đóng");
    expect(screen.queryByRole("form", { name: "Duyệt yêu cầu hoàn tiền" })).toBeNull();
  });
  it.each(["review", "pay", "restore"])(
    "RBAC review refreshes server capabilities at unchanged revision after %s grant changes",
    async initial => {
      const review = initial !== "pay";
      useAppStore
        .getState()
        .setProfile(
          staffProfile(["ORDER_READ", review ? "ORDER_REFUND_REVIEW" : "ORDER_REFUND_PAY"])
        );
      let server = { ...view, canReview: review, canPay: !review };
      serve({ [`get ${REFUNDS}`]: config => response(config, server) });
      renderSection();
      await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
      if (review) {
        await open("Duyệt yêu cầu");
        type("textbox", `Lý do quyết định ${itemLabel}`, "Keep capability draft");
      }
      const reads = calls.length;
      if (initial === "restore")
        await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
      server = { ...view, canReview: true, canPay: true };
      await act(async () =>
        useAppStore
          .getState()
          .setProfile(
            staffProfile([
              "ORDER_READ",
              "ORDER_REFUND_REVIEW",
              ...(initial === "restore" ? [] : ["ORDER_REFUND_PAY" as const])
            ])
          )
      );
      await waitFor(() => expect(calls.length).toBeGreaterThan(reads));
      await screen.findByRole("button", { name: "Tạo yêu cầu ngoại lệ" });
      if (review)
        expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe(
          "Keep capability draft"
        );
      else expect(screen.getByRole("button", { name: "Duyệt yêu cầu" })).toBeTruthy();
    }
  );
  it.each(["review", "inspect", "exception", "legacy"])(
    "RBAC review makes all %s fields read-only on revocation and restores the same draft",
    async mode => {
      const ctx = { view, reload: vi.fn(), commit: vi.fn() };
      const onClose = vi.fn();
      const props = { ctx, labels: { a1: itemLabel }, onClose };
      const ui =
        mode === "review" ? (
          <RefundReviewForm {...props} request={request} />
        ) : mode === "inspect" ? (
          <RefundInspectionForm
            {...props}
            request={{
              ...request,
              stage: "awaiting_return",
              items: [{ ...item, approvedQuantity: 3, returnRequired: true }]
            }}
          />
        ) : (
          <RefundExceptionForm {...props} mode={mode === "legacy" ? "legacy" : "request"} />
        );
      const { container } = render(ui);
      const fields = Array.from(
        container.querySelectorAll<HTMLInputElement>("input:not([type=hidden]),textarea,select")
      );
      expect(fields.length).toBeGreaterThan(0);
      await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
      expect(fields.every(input => input.disabled)).toBe(true);
      expect((screen.getByRole("button", { name: "Đóng" }) as HTMLButtonElement).disabled).toBe(
        false
      );
      click("Đóng");
      expect(onClose).toHaveBeenCalledOnce();
      await act(async () => useAppStore.getState().setProfile(ownerProfile));
      expect(fields.some(input => !input.disabled)).toBe(true);
      expect(fields.every(input => input.isConnected)).toBe(true);
    }
  );
  it("RBAC no refund grant never fetches even if the section is mounted directly", async () => {
    useAppStore.getState().setProfile(staffProfile(["ORDER_READ"]));
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });
  it("RBAC intersects stale review capability with the current profile", async () => {
    useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_PAY"]));
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await screen.findByRole("region", { name: "Yêu cầu hoàn tiền 1" });
    expect(screen.queryByRole("button", { name: "Duyệt yêu cầu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo yêu cầu ngoại lệ" })).toBeNull();
  });
  it("RBAC preserves the open review draft and rejects forced submission after permission refresh", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Keep my decision");
    await act(async () =>
      useAppStore.getState().setProfile(staffProfile(["ORDER_READ", "ORDER_REFUND_PAY"]))
    );
    const confirm = screen.getByRole("button", { name: "Xác nhận duyệt" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Keep my decision");
    fireEvent.submit(confirm.closest("form")!);
    expect(calls.filter(call => call.method === "post")).toHaveLength(0);
  });
  it("RBAC child review also denies a server capability removed while the profile still permits it", () => {
    const denied = { ...view, canReview: false };
    render(
      <RefundReviewForm
        ctx={{ view: denied, reload: vi.fn(), commit: vi.fn() }}
        request={request}
        labels={{ a1: itemLabel }}
        onClose={() => {}}
      />
    );
    expect(
      (screen.getByRole("button", { name: "Xác nhận duyệt" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
  it("partial_approval_preserves_customer_request_and_releases_remainder", async () => {
    const committed = withRequest(
      {
        stage: "awaiting_return",
        approval: {
          merchandiseAmount: 90000,
          shippingAmount: 0,
          amount: 90000,
          frozenAt: "2026-10-23T01:00:00.000Z"
        },
        history: [
          ...request.history,
          { event: "decided", at: "2026-10-23T01:00:00.000Z", customerMessage: "Duyệt 1 sản phẩm" }
        ]
      },
      {
        approvedQuantity: 1,
        approvedAmount: 90000,
        returnRequired: true,
        decisionReason: "Chỉ một cái lỗi"
      }
    );
    committed.revision = 5;
    committed.allocations = [
      { ...allocation, availableQuantity: 2, requestedQuantity: 1, availableAmount: 180000 }
    ];
    serve({
      [`get ${REFUNDS}`]: config => response(config, view),
      [`post ${REFUNDS}/r1/decision`]: config => response(config, committed)
    });
    const { onCommitted } = renderSection();

    await open("Duyệt yêu cầu");
    expect(field("spinbutton", "Phí vận chuyển hoàn").value).toBe("0");
    type("spinbutton", `Số lượng duyệt ${itemLabel}`, "1");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Chỉ một cái lỗi");
    type("textbox", "Tin nhắn gửi khách hàng", "Duyệt 1 sản phẩm");
    type("textbox", "Ghi chú nội bộ", "Hai cái còn lại dùng bình thường");
    click("Xác nhận duyệt");

    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
    const { body } = writes()[0];
    expect(body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID),
      items: [
        { allocationId: "a1", approvedQuantity: 1, returnRequired: true, reason: "Chỉ một cái lỗi" }
      ],
      shippingAmount: 0,
      customerMessage: "Duyệt 1 sản phẩm",
      internalNote: "Hai cái còn lại dùng bình thường"
    });
    const items = within(await screen.findByRole("list", { name: "Sản phẩm của yêu cầu 1" }));
    expect(items.getByText("Khách yêu cầu: 3")).toBeTruthy();
    expect(items.getByText("Đã duyệt: 1")).toBeTruthy();
    expect(items.getByText("Số lượng được giải phóng: 2")).toBeTruthy();
    expect(items.getByText("Giải thích của khách: Không vừa size")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Duyệt yêu cầu hoàn tiền" })).toBeNull();
  });

  it("missing_item_requires_explicit_waiver", async () => {
    serve({
      [`get ${REFUNDS}`]: config =>
        response(
          config,
          withRequest({}, { reason: "missing_item", requestedReturn: "no_return", evidenceIds: [] })
        ),
      [`post ${REFUNDS}/r1/decision`]: config => response(config, view)
    });
    renderSection();
    await open("Duyệt yêu cầu");
    expect(screen.queryByRole("checkbox", { name: `Yêu cầu trả hàng ${itemLabel}` })).toBeNull();
    type("textbox", `Lý do quyết định ${itemLabel}`, "Đã kiểm tra kho");

    click("Xác nhận duyệt");
    expect(await screen.findByText("Cần xác nhận miễn trả hàng cho hàng bị thiếu")).toBeTruthy();
    expect(writes()).toHaveLength(0);

    fireEvent.click(field("checkbox", `Xác nhận miễn trả hàng cho hàng bị thiếu ${itemLabel}`));
    click("Xác nhận duyệt");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.items).toEqual([
      { allocationId: "a1", approvedQuantity: 3, returnRequired: false, reason: "Đã kiểm tra kho" }
    ]);
  });

  it("rejecting_every_line_needs_a_customer_message", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await open("Duyệt yêu cầu");
    type("spinbutton", `Số lượng duyệt ${itemLabel}`, "0");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Quá hạn");
    click("Xác nhận duyệt");
    expect(
      await screen.findByText("Cần nêu lý do gửi khách khi từ chối toàn bộ yêu cầu")
    ).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("rejects every requested item with a predefined customer reason and no shipping refund", async () => {
    const pending = withRequest({ shipping: { reservedAmount: 30000, approvedAmount: 0 } });
    pending.requests[0].items.push({
      ...item,
      allocationId: "a2",
      reason: "missing_item",
      requestedReturn: "no_return"
    });
    const rejected = {
      ...pending,
      revision: 5,
      requests: [{ ...pending.requests[0], stage: "rejected" as const }]
    };
    serve({
      [`get ${REFUNDS}`]: config => response(config, pending),
      [`post ${REFUNDS}/r1/decision`]: config => response(config, rejected)
    });
    renderSection();
    await open("Từ chối yêu cầu");
    click("Xác nhận từ chối");
    expect(await screen.findByText("Chọn lý do từ chối gửi khách")).toBeTruthy();
    expect(writes()).toHaveLength(0);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lý do từ chối gửi khách" }));
    fireEvent.click(await screen.findByTitle("Minh chứng chưa đủ để xác nhận vấn đề"));
    click("Xác nhận từ chối");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID),
      items: ["a1", "a2"].map(allocationId => ({
        allocationId,
        approvedQuantity: 0,
        returnRequired: false,
        reason: "Minh chứng chưa đủ để xác nhận vấn đề"
      })),
      shippingAmount: 0,
      customerMessage: "Minh chứng chưa đủ để xác nhận vấn đề"
    });
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Từ chối yêu cầu hoàn tiền" })).toBeNull()
    );
  });

  it("requires a custom rejection reason and enforces the per-item 500 character limit", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, view),
      [`post ${REFUNDS}/r1/decision`]: config =>
        response(config, withRequest({ stage: "rejected" }))
    });
    renderSection();
    await open("Từ chối yêu cầu");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lý do từ chối gửi khách" }));
    fireEvent.click(await screen.findByText("Lý do khác"));
    type("textbox", "Lý do từ chối khác", "   ");
    click("Xác nhận từ chối");
    expect(await screen.findByText("Nhập lý do từ chối gửi khách")).toBeTruthy();
    type("textbox", "Lý do từ chối khác", "x".repeat(501));
    click("Xác nhận từ chối");
    expect(await screen.findByText("Lý do tối đa 500 ký tự")).toBeTruthy();
    expect(writes()).toHaveLength(0);
    type("textbox", "Lý do từ chối khác", "  Đã đối chiếu minh chứng và trao đổi với khách  ");
    click("Xác nhận từ chối");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.customerMessage).toBe("Đã đối chiếu minh chứng và trao đổi với khách");
  });

  it("keeps rejection closable and blocks forced submission after review permission is revoked", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection();
    await open("Từ chối yêu cầu");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Lý do từ chối gửi khách" }));
    fireEvent.click(await screen.findByTitle("Minh chứng chưa đủ để xác nhận vấn đề"));
    await act(async () => useAppStore.getState().setProfile(staffProfile(["ORDER_READ"])));
    expect(
      (screen.getByRole("button", { name: "Xác nhận từ chối" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.submit(screen.getByRole("form", { name: "Từ chối yêu cầu hoàn tiền" }));
    expect(writes()).toHaveLength(0);
    click("Đóng");
    expect(screen.queryByRole("form", { name: "Từ chối yêu cầu hoàn tiền" })).toBeNull();
  });

  it("inspection_has_separate_received_and_sellable_inputs", async () => {
    const awaitingReturn = withRequest(
      { stage: "awaiting_return" },
      { approvedQuantity: 2, approvedAmount: 180000, returnRequired: true }
    );
    serve({
      [`get ${REFUNDS}`]: config => response(config, awaitingReturn),
      [`post ${REFUNDS}/r1/inspections`]: config => response(config, view)
    });
    renderSection();
    await open("Kiểm tra hàng trả");
    const received = () => field("spinbutton", `Số lượng nhận trong lần này ${itemLabel}`);
    const sellable = () => field("spinbutton", `Số lượng có thể bán lại ${itemLabel}`);
    expect([received().value, sellable().value]).toEqual(["0", "0"]);
    type("spinbutton", `Số lượng nhận trong lần này ${itemLabel}`, "2");
    expect([received().value, sellable().value]).toEqual(["2", "0"]);
    type("textbox", "Ghi chú kiểm tra", "Hộp rách");

    type("spinbutton", `Số lượng có thể bán lại ${itemLabel}`, "1");
    click("Ghi nhận kiểm tra");
    expect(await screen.findByText("Cần xác nhận hàng nhận về đúng biến thể đã mua")).toBeTruthy();
    type("spinbutton", `Số lượng có thể bán lại ${itemLabel}`, "3");
    click("Ghi nhận kiểm tra");
    expect(
      await screen.findByText("Số lượng có thể bán lại không được vượt số đã nhận")
    ).toBeTruthy();
    expect(writes()).toHaveLength(0);

    type("spinbutton", `Số lượng có thể bán lại ${itemLabel}`, "1");
    fireEvent.click(field("checkbox", `Xác nhận hàng nhận về đúng biến thể đã mua ${itemLabel}`));
    click("Ghi nhận kiểm tra");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url).toBe(`${REFUNDS}/r1/inspections`);
    expect(writes()[0].body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID),
      items: [
        {
          allocationId: "a1",
          receivedQuantity: 2,
          sellableQuantity: 1,
          confirmedPurchasedVariant: true
        }
      ],
      note: "Hộp rách"
    });
    // Receiving goods is never the whole-order return transition.
    expect(calls.filter(call => call.url.endsWith("/status"))).toEqual([]);
  });

  it("bounds inspection quantities by outstanding returns and keeps invalid drafts on blur", async () => {
    const awaitingReturn = withRequest(
      { stage: "awaiting_return" },
      { approvedQuantity: 3, receivedQuantity: 1, returnRequired: true }
    );
    serve({
      [`get ${REFUNDS}`]: config => response(config, awaitingReturn),
      [`post ${REFUNDS}/r1/inspections`]: config => response(config, view)
    });
    renderSection();
    await open("Kiểm tra hàng trả");
    const received = field("spinbutton", `Số lượng nhận trong lần này ${itemLabel}`);
    const sellable = field("spinbutton", `Số lượng có thể bán lại ${itemLabel}`);
    expect(screen.getByLabelText("Số lượng nhận trong lần này")).toBe(received);
    expect(received.getAttribute("aria-valuemin")).toBe("0");
    expect(received.getAttribute("aria-valuemax")).toBe("2");
    expect(sellable.getAttribute("aria-valuemin")).toBe("0");
    expect(sellable.getAttribute("aria-valuemax")).toBe("0");
    fireEvent.change(received, { target: { value: "2" } });
    expect(sellable.getAttribute("aria-valuemax")).toBe("2");
    fireEvent.change(sellable, { target: { value: "2" } });
    fireEvent.change(received, { target: { value: "1" } });
    fireEvent.blur(sellable);
    expect(sellable.value).toBe("2");
    expect(sellable.getAttribute("aria-valuemax")).toBe("1");
    type("textbox", "Ghi chú kiểm tra", "Nhận thêm một sản phẩm");
    fireEvent.click(field("checkbox", `Xác nhận hàng nhận về đúng biến thể đã mua ${itemLabel}`));
    click("Ghi nhận kiểm tra");
    expect(writes()).toHaveLength(0);
    expect(sellable.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(sellable.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Số lượng có thể bán lại không được vượt số đã nhận"
    );
    fireEvent.change(received, { target: { value: "3" } });
    fireEvent.blur(received);
    expect(received.value).toBe("3");
    click("Ghi nhận kiểm tra");
    expect(received.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(received.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Số lượng nhận trong lần này không được vượt số còn cần nhận (2 sản phẩm)"
    );
    expect(writes()).toHaveLength(0);
    fireEvent.change(received, { target: { value: "1" } });
    fireEvent.change(sellable, { target: { value: "1" } });
    click("Ghi nhận kiểm tra");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.items).toEqual([
      {
        allocationId: "a1",
        receivedQuantity: 1,
        sellableQuantity: 1,
        confirmedPurchasedVariant: true
      }
    ]);
  });
  it("validates both inspection inputs independently and rejects negative, fractional and empty quantities", async () => {
    serve({
      [`get ${REFUNDS}`]: config =>
        response(
          config,
          withRequest({ stage: "awaiting_return" }, { approvedQuantity: 3, returnRequired: true })
        )
    });
    renderSection();
    await open("Kiểm tra hàng trả");
    const received = field("spinbutton", `Số lượng nhận trong lần này ${itemLabel}`);
    const sellable = field("spinbutton", `Số lượng có thể bán lại ${itemLabel}`);
    type("textbox", "Ghi chú kiểm tra", "Kiểm tra số lượng");
    for (const value of ["-1", "0.5", ""]) {
      fireEvent.change(received, { target: { value } });
      fireEvent.change(sellable, { target: { value } });
      click("Ghi nhận kiểm tra");
      expect(received.getAttribute("aria-invalid")).toBe("true");
      expect(sellable.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById(received.getAttribute("aria-describedby")!)?.textContent).toBe(
        "Số lượng nhận trong lần này phải là số nguyên không âm"
      );
      expect(writes()).toHaveLength(0);
    }
  });
  it("legacy_unknowns_require_reason_and_attestation", async () => {
    serve({
      [`get ${REFUNDS}`]: config => response(config, legacyView(0)),
      "post /orders/order-id/refund-legacy-review": config => response(config, view)
    });
    renderSection();
    expect(await screen.findByText(/Cần đối soát đơn cũ/)).toBeTruthy();
    await open("Đối soát đơn cũ");
    expect(field("spinbutton", "Phí vận chuyển").value).toBe("0");

    click("Xác nhận đối soát");
    for (const message of [
      "Cần kê khai thời điểm giao hàng",
      "Cần nhập số tiền thực tế của từng dòng",
      "Cần nhập số tiền đã thu",
      "Cần nhập lý do đối soát",
      "Cần xác nhận đã đối soát chứng từ"
    ])
      expect(await screen.findByText(message)).toBeTruthy();
    expect(writes()).toHaveLength(0);

    const delivery = screen.getByRole("textbox", { name: "Thời điểm giao hàng (kê khai)" });
    fireEvent.change(delivery, {
      target: { value: dayjs("2026-10-20T09:00").format("DD/MM/YYYY HH:mm") }
    });
    fireEvent.keyDown(delivery, { key: "Enter", code: "Enter" });
    type("spinbutton", `Số tiền thực tế ${itemLabel}`, "180000");
    type("spinbutton", "Phí vận chuyển", "30000");
    type("spinbutton", "Số tiền đã thu", "200000");
    type("textbox", "Lý do đối soát", "Đã đối chiếu sao kê");
    fireEvent.click(field("checkbox", /Tôi xác nhận đã đối soát chứng từ/));
    click("Xác nhận đối soát");
    expect(
      await screen.findByText("Số tiền đã thu phải bằng tổng các dòng cộng phí vận chuyển")
    ).toBeTruthy();
    expect(writes()).toHaveLength(0);

    type("spinbutton", "Số tiền đã thu", "210000");
    click("Xác nhận đối soát");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url).toBe("/orders/order-id/refund-legacy-review");
    expect(writes()[0].body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID),
      deliveredAt: new Date("2026-10-20T09:00").toISOString(),
      receivedAmount: 210000,
      allocations: [{ productInfoIndex: 0, netAmount: 180000 }],
      shippingAmount: 30000,
      reason: "Đã đối chiếu sao kê"
    });
  });

  it("legacy_known_allocation_amounts_are_not_editable", async () => {
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, { ...legacyView(180000), deadline: "2026-10-30T00:00:00.000Z" }),
      "post /orders/order-id/refund-legacy-review": config => response(config, view)
    });
    renderSection();
    await open("Đối soát đơn cũ");
    expect(screen.queryByRole("spinbutton", { name: `Số tiền thực tế ${itemLabel}` })).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Dòng hàng cần đối soát" })).getByText(/180\.000/)
    ).toBeTruthy();
    expect(screen.queryByLabelText("Thời điểm giao hàng (kê khai)")).toBeNull();
    type("spinbutton", "Số tiền đã thu", "180000");
    type("textbox", "Lý do đối soát", "Đã đối chiếu sao kê");
    fireEvent.click(field("checkbox", /Tôi xác nhận đã đối soát chứng từ/));
    click("Xác nhận đối soát");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toMatchObject({
      allocations: [{ productInfoIndex: 0, netAmount: 180000 }],
      shippingAmount: 0,
      receivedAmount: 180000
    });
    expect(writes()[0].body).not.toHaveProperty("deliveredAt");
  });

  it("exception_request_is_bounded_by_server_availability_and_defaults_shipping_off", async () => {
    const withAvailable = {
      ...view,
      allocations: [{ ...allocation, availableQuantity: 2, requestedQuantity: 1 }],
      requests: []
    };
    serve({
      [`get ${REFUNDS}`]: config => response(config, withAvailable),
      [`post ${REFUNDS}`]: config => response(config, view)
    });
    renderSection();
    await open("Tạo yêu cầu ngoại lệ");
    const quantity = `Số lượng hoàn ${itemLabel}`;
    expect(screen.queryByRole("spinbutton", { name: quantity })).toBeNull();
    click("Gửi yêu cầu ngoại lệ");
    expect(await screen.findByText("Cần nêu lý do ngoại lệ")).toBeTruthy();
    expect(
      await screen.findByText("Chọn ít nhất một sản phẩm hoặc chỉ hoàn phí vận chuyển")
    ).toBeTruthy();

    fireEvent.click(field("checkbox", `Chọn ${itemLabel}`));
    expect(field("spinbutton", quantity).value).toBe("1");
    type("spinbutton", quantity, "3");
    type("textbox", "Lý do ngoại lệ", "Quá hạn do lỗi giao hàng");
    type("textbox", `Giải thích ${itemLabel}`, "Giao trễ 10 ngày");
    click("Gửi yêu cầu ngoại lệ");
    expect(await screen.findByText("Tối đa 2 sản phẩm có thể hoàn")).toBeTruthy();
    expect(writes()).toHaveLength(0);

    type("spinbutton", quantity, "1");
    click("Gửi yêu cầu ngoại lệ");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({
      expectedRevision: 4,
      idempotencyKey: expect.stringMatching(UUID),
      exceptionReason: "Quá hạn do lỗi giao hàng",
      items: [
        {
          allocationId: "a1",
          quantity: 1,
          reason: "ordinary",
          explanation: "Giao trễ 10 ngày",
          requestedReturn: "return",
          evidenceIds: []
        }
      ],
      shippingOnly: false
    });
  });

  it("omits deselected exception products even when they retain a draft", async () => {
    const secondLabel = "Sản phẩm thứ hai (SKU-S)";
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, {
          ...view,
          requests: [],
          allocations: [
            { ...allocation, availableQuantity: 2 },
            {
              ...allocation,
              allocationId: "a2",
              productInfoIndex: 1,
              productName: "Sản phẩm thứ hai",
              availableQuantity: 1
            }
          ]
        }),
      [`post ${REFUNDS}`]: config => response(config, view)
    });
    renderSection();
    await open("Tạo yêu cầu ngoại lệ");
    fireEvent.click(field("checkbox", `Chọn ${itemLabel}`));
    type("textbox", `Giải thích ${itemLabel}`, "Bản nháp không gửi");
    fireEvent.click(field("checkbox", `Chọn ${itemLabel}`));
    expect(screen.queryByRole("textbox", { name: `Giải thích ${itemLabel}` })).toBeNull();
    fireEvent.click(field("checkbox", `Chọn ${secondLabel}`));
    type("textbox", `Giải thích ${secondLabel}`, "Chỉ hoàn sản phẩm thứ hai");
    type("textbox", "Lý do ngoại lệ", "Chấp nhận ngoài thời hạn");
    click("Gửi yêu cầu ngoại lệ");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.items).toEqual([
      {
        allocationId: "a2",
        quantity: 1,
        reason: "ordinary",
        explanation: "Chỉ hoàn sản phẩm thứ hai",
        requestedReturn: "return",
        evidenceIds: []
      }
    ]);
  });
  it("shipping_only_exception_sends_no_items", async () => {
    const withAvailable = {
      ...view,
      allocations: [{ ...allocation, availableQuantity: 2 }],
      requests: []
    };
    serve({
      [`get ${REFUNDS}`]: config => response(config, withAvailable),
      [`post ${REFUNDS}`]: config => response(config, view)
    });
    renderSection();
    await open("Tạo yêu cầu ngoại lệ");
    fireEvent.click(field("checkbox", "Chỉ hoàn phí vận chuyển"));
    expect(screen.queryByRole("spinbutton", { name: `Số lượng hoàn ${itemLabel}` })).toBeNull();
    type("textbox", "Lý do ngoại lệ", "Giao hàng thất bại");
    click("Gửi yêu cầu ngoại lệ");
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toMatchObject({
      items: [],
      shippingOnly: true,
      exceptionReason: "Giao hàng thất bại"
    });
  });

  it("reviewer_cannot_see_enabled_payout_controls", async () => {
    const approval = {
      merchandiseAmount: 270000,
      shippingAmount: 0,
      amount: 270000,
      frozenAt: "2026-10-23T01:00:00.000Z"
    };
    const awaitingPayout = withRequest(
      { stage: "awaiting_payout", approval },
      { approvedQuantity: 3, approvedAmount: 270000 }
    );
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, { ...awaitingPayout, canReview: true, canPay: false })
    });
    renderSection();
    expect(await screen.findByText("Cần quyền thanh toán để xử lý khoản hoàn tiền")).toBeTruthy();
    expect(reviewButtons()).toEqual(["Tạo yêu cầu ngoại lệ"]);
    cleanup();

    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, { ...awaitingPayout, canReview: false, canPay: true })
    });
    renderSection();
    await screen.findByRole("region", { name: "Hoàn tiền" });
    // Task 14: a payer gets the payout claim control, and still no review/inspection controls.
    expect(reviewButtons()).toEqual(["Nhận xử lý hoàn tiền"]);
    expect(screen.queryByText("Cần quyền thanh toán để xử lý khoản hoàn tiền")).toBeNull();
  });

  it("conflict_keeps_the_draft_and_blocks_submit_until_the_new_view_is_reviewed", async () => {
    let attempts = 0;
    const newer = { ...view, revision: 5 };
    serve({
      [`get ${REFUNDS}`]: config => response(config, attempts ? newer : view),
      [`post ${REFUNDS}/r1/decision`]: config => {
        attempts += 1;
        return attempts === 1 ? fail(config, 409, "Đơn hàng đã thay đổi") : response(config, newer);
      }
    });
    renderSection();
    const reads = () => calls.filter(call => call.method === "get").length;
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Hàng lỗi");
    type("textbox", "Tin nhắn gửi khách hàng", "Đã duyệt");
    const readsBefore = reads();
    click("Xác nhận duyệt");

    expect(await screen.findByText(/đã được thay đổi bởi thao tác khác/)).toBeTruthy();
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Hàng lỗi");
    expect(field("textbox", "Tin nhắn gửi khách hàng").value).toBe("Đã duyệt");
    const submit = screen.getByRole("button", { name: "Xác nhận duyệt" }) as HTMLButtonElement;
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
    expect(submit.disabled).toBe(true);

    const review = field("checkbox", "Tôi đã xem lại dữ liệu mới nhất");
    await waitFor(() => expect(review.disabled).toBe(false));
    fireEvent.click(review);
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1].body).toMatchObject({ expectedRevision: 5 });
    expect(writes()[1].body?.idempotencyKey).toBe(writes()[0].body?.idempotencyKey);
  });

  it("command_key_survives_network_retries_and_changes_only_when_the_command_is_edited", async () => {
    let attempts = 0;
    serve({
      [`get ${REFUNDS}`]: config => response(config, view),
      [`post ${REFUNDS}/r1/decision`]: config => {
        attempts += 1;
        if (attempts === 1)
          return Promise.reject(new AxiosError("timeout", AxiosError.ECONNABORTED, config));
        if (attempts === 2) return fail(config, 403, "Bạn không có quyền duyệt hoàn tiền");
        return response(config, view);
      }
    });
    renderSection();
    await open("Duyệt yêu cầu");
    type("textbox", `Lý do quyết định ${itemLabel}`, "Hàng lỗi");
    click("Xác nhận duyệt");
    expect(await screen.findByText(/Chưa xác định được kết quả thao tác trước/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Xác nhận duyệt" })).toHaveProperty(
        "disabled",
        false
      )
    );
    click("Xác nhận duyệt");
    expect(await screen.findByText("Bạn không có quyền duyệt hoàn tiền")).toBeTruthy();
    expect(field("textbox", `Lý do quyết định ${itemLabel}`).value).toBe("Hàng lỗi");

    type("textbox", `Lý do quyết định ${itemLabel}`, "Hàng lỗi nặng");
    click("Xác nhận duyệt");
    await waitFor(() => expect(writes()).toHaveLength(3));
    const keys = writes().map(call => call.body?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("shows_authorization_failure_without_any_controls", async () => {
    serve({ [`get ${REFUNDS}`]: config => fail(config, 403, "Bạn không có quyền xem hoàn tiền") });
    renderSection();
    expect(await screen.findByText("Bạn không có quyền xem hoàn tiền")).toBeTruthy();
    expect(reviewButtons()).toEqual(["Thử lại"]);
  });

  it("fetches_evidence_through_the_admin_api_and_revokes_object_urls", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => {
          const url = `blob:evidence-${created.length + 1}`;
          created.push(url);
          return url;
        }),
        revokeObjectURL: vi.fn((url: string) => revoked.push(url))
      })
    );
    serve({
      [`get ${REFUNDS}`]: config =>
        response(config, withRequest({}, { reason: "incorrect_item", evidenceIds: ["e1", "e2"] })),
      "get /orders/order-id/refund-evidence/e1": config => ({
        ...response(config, null),
        data: new Blob(["a"], { type: "image/png" })
      }),
      "get /orders/order-id/refund-evidence/e2": config => fail(config, 404, "Không tìm thấy")
    });
    const { rerender } = renderSection();
    const first = await screen.findByRole("img", { name: `Ảnh bằng chứng 1/2 — ${itemLabel}` });
    expect(first.getAttribute("src")).toBe("blob:evidence-1");
    const evidenceCalls = calls.filter(call => call.url.includes("refund-evidence"));
    expect(new Set(evidenceCalls.map(call => call.url))).toEqual(
      new Set(["/orders/order-id/refund-evidence/e1", "/orders/order-id/refund-evidence/e2"])
    );
    expect(evidenceCalls.every(call => call.responseType === "blob")).toBe(true);
    fireEvent.click(first);
    const preview = await screen.findByRole("dialog");
    expect(
      within(preview)
        .getByRole("img", { name: `Ảnh bằng chứng 1/2 — ${itemLabel}` })
        .getAttribute("src")
    ).toBe("blob:evidence-1");
    expect(calls.filter(call => call.url.includes("refund-evidence"))).toHaveLength(
      evidenceCalls.length
    );
    fireEvent.keyDown(preview, { key: "Escape", code: "Escape", keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Không tải được ảnh bằng chứng 2/2")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /2\/2/ })).toBeNull();
    rerender({ orderId: "order-id", revision: 4 });
    cleanup();
    expect(revoked).toEqual(["blob:evidence-1"]);
  });

  it("ignores_a_late_response_from_the_previous_order", async () => {
    const first = deferred<AxiosResponse>();
    serve({
      "get /orders/order-1/refunds": () => first.promise,
      "get /orders/order-2/refunds": config =>
        response(config, { ...view, orderId: "order-2", remainingPaidShipping: 22000 })
    });
    const { rerender } = renderSection({ orderId: "order-1" });
    rerender({ orderId: "order-2" });
    await open("Chi tiết số lượng có thể hoàn");
    expect(await screen.findByText(/22\.000/)).toBeTruthy();
    first.resolve(
      response({ headers: {} } as InternalAxiosRequestConfig, {
        ...view,
        orderId: "order-1",
        remainingPaidShipping: 11000
      })
    );
    await Promise.resolve();
    expect(screen.queryByText(/11\.000/)).toBeNull();
    expect(screen.getByText(/22\.000/)).toBeTruthy();
  });

  it("labels_combo_pieces_from_the_purchase_snapshot", async () => {
    serve({ [`get ${REFUNDS}`]: config => response(config, view) });
    renderSection({
      order: {
        ...order,
        productInfo: [{ ...order.productInfo[0], comboGroupId: "g1" }],
        combos: [
          {
            comboGroupId: "g1",
            comboId: "combo-id",
            nameAtOrder: "Combo mùa hè",
            quantity: 1,
            pricingModeAtOrder: "FIXED",
            pricingValueAtOrder: 270000,
            totalAtOrder: 270000
          }
        ]
      }
    });
    expect(
      (await screen.findAllByText(`${itemLabel} — Combo: Combo mùa hè`)).length
    ).toBeGreaterThan(0);
  });
});
