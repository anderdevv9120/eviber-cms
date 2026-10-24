import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const reviewButtons = () => screen.queryAllByRole("button").map(button => button.textContent);

describe("admin refund section", () => {
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
    const received = () => field("spinbutton", `Số lượng đã nhận ${itemLabel}`);
    const sellable = () => field("spinbutton", `Số lượng có thể bán lại ${itemLabel}`);
    expect([received().value, sellable().value]).toEqual(["0", "0"]);
    type("spinbutton", `Số lượng đã nhận ${itemLabel}`, "2");
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
      within(screen.getByRole("list", { name: "Dòng hàng cần đối soát" })).getByText(/180\.000/)
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
    expect(field("spinbutton", quantity).value).toBe("0");
    click("Gửi yêu cầu ngoại lệ");
    expect(await screen.findByText("Cần nêu lý do ngoại lệ")).toBeTruthy();
    expect(
      await screen.findByText("Chọn ít nhất một sản phẩm hoặc chỉ hoàn phí vận chuyển")
    ).toBeTruthy();

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
        response(config, { ...view, orderId: "order-2", orderNumber: "ORD-2" })
    });
    const { rerender } = renderSection({ orderId: "order-1" });
    rerender({ orderId: "order-2" });
    expect(await screen.findByText(/ORD-2/)).toBeTruthy();
    first.resolve(
      response({ headers: {} } as InternalAxiosRequestConfig, {
        ...view,
        orderId: "order-1",
        orderNumber: "ORD-1"
      })
    );
    await Promise.resolve();
    expect(screen.queryByText(/ORD-1/)).toBeNull();
    expect(screen.getByText(/ORD-2/)).toBeTruthy();
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
