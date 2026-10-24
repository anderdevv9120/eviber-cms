import { useEffect, useRef, useState } from "react";
import { Alert, Button, Descriptions, Flex, Spin, Table, Tag, Typography } from "antd";
import {
  getOrderRefundsAPI,
  type AdminRefundOrderView,
  type AdminRefundRequest,
  type RefundCoverage,
  type RefundOrderAllocationView
} from "@/services/refunds";
import type { AdminOrderDetail } from "@/services/orders";
import { getErrorMessage } from "@/utils/getErrorMessage";
import {
  displayOrderText,
  formatOrderAmount,
  formatOrderDate,
  refundReasonLabels,
  refundStatusLabels
} from "./order-display";
import RefundEvidence from "./RefundEvidence";
import RefundExceptionForm from "./RefundExceptionForm";
import RefundInspectionForm from "./RefundInspectionForm";
import RefundPayoutForm from "./RefundPayoutForm";
import RefundReviewForm from "./RefundReviewForm";
import type { RefundContext } from "./useRefundCommand";

export interface RefundSectionProps {
  orderId: string;
  revision: number;
  onCommitted: () => Promise<unknown>;
  /** Purchase snapshot, only used to label combo pieces. */
  order?: Pick<AdminOrderDetail, "productInfo" | "combos">;
}

type ActiveForm =
  { type: "review" | "inspect"; requestId: string } | { type: "exception" | "legacy" };

const coverageLabels: Record<RefundCoverage, string> = {
  none: "Chưa hoàn",
  partial: "Đã hoàn một phần",
  full: "Đã hoàn toàn bộ"
};
// The legacy resolver reports its reason in English; staff read these in Vietnamese.
const legacyReasons: Record<string, string> = {
  "Recorded delivery event is missing": "Thiếu sự kiện giao hàng đã ghi nhận",
  "Verified payment receipt is missing": "Thiếu biên nhận thanh toán đã xác minh",
  "Historical coupon eligibility cannot be established":
    "Không xác định được điều kiện mã giảm giá lúc mua",
  "Historical checkout totals do not reconcile": "Tổng tiền lúc mua không khớp",
  "Historical purchase amounts cannot be verified": "Không xác minh được số tiền lúc mua",
  "Historical purchase line amounts cannot be verified":
    "Không xác minh được số tiền từng dòng hàng lúc mua"
};
const payoutPermissionText = "Cần quyền thanh toán để xử lý khoản hoàn tiền";
const readRefunds = async (orderId: string, signal?: AbortSignal) => {
  const { data } = await getOrderRefundsAPI(orderId, signal);
  if (!data?.orderId || !Array.isArray(data.requests))
    throw new Error("Không tải được dữ liệu hoàn tiền");
  return data;
};
const money = (value: number) => formatOrderAmount(value, "VND");

export default function RefundSection({
  orderId,
  revision,
  onCommitted,
  order
}: RefundSectionProps) {
  const [state, setState] = useState<{ view?: AdminRefundOrderView; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<ActiveForm | null>(null);
  const [refreshError, setRefreshError] = useState<string>();
  const latestOrderId = useRef(orderId);
  const seen = useRef<{ orderId: string; revision: number } | undefined>(undefined);

  // Results are only adopted for the order currently on screen.
  const view = state.view?.orderId === orderId ? state.view : undefined;

  useEffect(() => {
    latestOrderId.current = orderId;
    // Skip when the committed view already matches the order revision the page reports.
    if (seen.current?.orderId === orderId && seen.current.revision === revision) return;
    const controller = new AbortController();
    let active = true;
    readRefunds(orderId, controller.signal)
      .then(data => {
        if (!active) return;
        seen.current = { orderId, revision: data.revision };
        setState({ view: data });
      })
      .catch(cause => {
        if (active) setState({ error: getErrorMessage(cause) });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId, revision, attempt]);

  const adopt = (next: AdminRefundOrderView) => {
    seen.current = { orderId: next.orderId, revision: next.revision };
    setState({ view: next });
  };
  const refreshOrder = async () => {
    try {
      await onCommitted();
      setRefreshError(undefined);
    } catch (cause) {
      setRefreshError(getErrorMessage(cause));
    }
  };

  if (!view) {
    return (
      <section aria-label='Hoàn tiền' className='mt-6'>
        <Typography.Title level={3}>Hoàn tiền</Typography.Title>
        {state.error ? (
          <Alert
            type='error'
            showIcon
            title={state.error}
            action={
              <Button
                onClick={() => {
                  setState({});
                  setAttempt(value => value + 1);
                }}
              >
                Thử lại
              </Button>
            }
          />
        ) : (
          <Flex justify='center' className='py-4'>
            <Spin aria-label='Đang tải dữ liệu hoàn tiền' />
          </Flex>
        )}
      </section>
    );
  }

  const ctx: RefundContext = {
    view,
    reload: async () => {
      const next = await readRefunds(orderId);
      if (latestOrderId.current !== next.orderId) return;
      adopt(next);
      await onCommitted();
    },
    commit: async next => {
      if (latestOrderId.current !== next.orderId) return;
      adopt(next);
      setForm(null);
      await refreshOrder();
    }
  };
  const labels = Object.fromEntries(
    view.allocations.map(allocation => [
      allocation.allocationId,
      allocationLabel(allocation, order)
    ])
  );
  const { eligibility } = view;
  const closeForm = () => setForm(null);

  return (
    <section aria-label='Hoàn tiền' className='mt-6'>
      <Typography.Title level={3}>Hoàn tiền</Typography.Title>
      <Descriptions
        bordered
        column={2}
        items={[
          { key: "order", label: "Đơn hàng", children: displayOrderText(view.orderNumber) },
          {
            key: "policy",
            label: "Chính sách khi mua",
            children: view.policy
              ? `${view.policy.enabled ? "Có hỗ trợ" : "Không hỗ trợ"} hoàn tiền thông thường trong ${view.policy.windowDays} ngày sau khi giao`
              : "Chưa có chính sách (đơn cũ)"
          },
          {
            key: "deadline",
            label: "Hạn gửi yêu cầu",
            children: view.deadline
              ? formatOrderDate(view.deadline)
              : "Chưa xác định (chưa giao hoặc thiếu lịch sử giao hàng)"
          },
          { key: "coverage", label: "Mức hoàn", children: coverageLabels[view.summary.coverage] },
          {
            key: "refunded",
            label: "Đã hoàn",
            children: money(view.summary.paidAmount + view.summary.paidShippingAmount)
          },
          {
            key: "shipping",
            label: "Phí vận chuyển còn có thể hoàn",
            children: money(view.remainingPaidShipping)
          }
        ]}
      />
      {eligibility.reviewRequired ? (
        <Alert
          type='warning'
          showIcon
          className='mt-3'
          title={`Cần đối soát đơn cũ trước khi xử lý hoàn tiền: ${
            legacyReasons[eligibility.reason ?? ""] ?? displayOrderText(eligibility.reason)
          }`}
        />
      ) : (
        !eligibility.eligible &&
        eligibility.reason && (
          <Alert
            type='info'
            showIcon
            className='mt-3'
            title={`Khách chưa thể tự gửi yêu cầu: ${eligibility.reason}`}
          />
        )
      )}
      {refreshError && (
        <Alert
          type='error'
          showIcon
          className='mt-3'
          title={`Không làm mới được thông tin đơn hàng: ${refreshError}`}
          action={<Button onClick={refreshOrder}>Tải lại đơn hàng</Button>}
        />
      )}
      {view.canReview && (
        <Flex gap={8} className='mt-3'>
          {eligibility.reviewRequired ? (
            <Button onClick={() => setForm({ type: "legacy" })}>Đối soát đơn cũ</Button>
          ) : (
            <Button onClick={() => setForm({ type: "exception" })}>Tạo yêu cầu ngoại lệ</Button>
          )}
        </Flex>
      )}
      {form?.type === "legacy" && (
        <RefundExceptionForm mode='legacy' ctx={ctx} labels={labels} onClose={closeForm} />
      )}
      {form?.type === "exception" && (
        <RefundExceptionForm mode='request' ctx={ctx} labels={labels} onClose={closeForm} />
      )}
      <Table<RefundOrderAllocationView>
        className='mt-4'
        size='small'
        pagination={false}
        rowKey='allocationId'
        dataSource={view.allocations}
        locale={{ emptyText: "Chưa có dữ liệu" }}
        columns={[
          { title: "Sản phẩm mua", key: "product", render: (_, row) => labels[row.allocationId] },
          { title: "Đã mua", dataIndex: "purchasedQuantity", key: "purchased" },
          { title: "Còn có thể hoàn", dataIndex: "availableQuantity", key: "available" },
          { title: "Đang yêu cầu", dataIndex: "requestedQuantity", key: "requested" },
          { title: "Đã hoàn", dataIndex: "refundedQuantity", key: "refunded" },
          { title: "Thành tiền", key: "net", render: (_, row) => money(row.netAmount) }
        ]}
      />
      {view.requests.map((request, index) => (
        <RequestCard
          key={request.requestId}
          index={index}
          request={request}
          view={view}
          labels={labels}
          form={form}
          ctx={ctx}
          onOpen={setForm}
          onClose={closeForm}
        />
      ))}
    </section>
  );
}

function allocationLabel(
  allocation: RefundOrderAllocationView,
  order: RefundSectionProps["order"]
): string {
  const line = order?.productInfo[allocation.productInfoIndex];
  const combo = line?.comboGroupId
    ? order?.combos?.find(item => item.comboGroupId === line.comboGroupId)
    : undefined;
  return `${displayOrderText(allocation.productName)}${
    allocation.variantLabel ? ` (${allocation.variantLabel})` : ""
  }${combo ? ` — Combo: ${combo.nameAtOrder}` : ""}`;
}

function RequestCard({
  index,
  request,
  view,
  labels,
  form,
  ctx,
  onOpen,
  onClose
}: {
  index: number;
  request: AdminRefundRequest;
  view: AdminRefundOrderView;
  labels: Record<string, string>;
  form: ActiveForm | null;
  ctx: RefundContext;
  onOpen: (form: ActiveForm) => void;
  onClose: () => void;
}) {
  const number = index + 1;
  const decided = request.stage !== "awaiting_review";
  const activeForm =
    form && "requestId" in form && form.requestId === request.requestId ? form : null;
  const awaitingPayout =
    request.stage === "awaiting_payout" || request.stage === "payout_in_progress";

  return (
    <section aria-label={`Yêu cầu hoàn tiền ${number}`} className='mt-6'>
      <Flex gap={8} align='center'>
        <Typography.Title level={4} className='m-0!'>
          Yêu cầu {number}
        </Typography.Title>
        <Tag>{refundStatusLabels[request.stage]}</Tag>
        {request.exceptionReason && <Tag color='orange'>Ngoại lệ</Tag>}
      </Flex>
      <p>Gửi lúc: {formatOrderDate(request.submittedAt)}</p>
      {request.exceptionReason && <p>Lý do ngoại lệ (nội bộ): {request.exceptionReason}</p>}
      <ul aria-label={`Sản phẩm của yêu cầu ${number}`} className='list-none p-0'>
        {request.items.map(item => {
          const label = labels[item.allocationId];
          return (
            <li key={item.allocationId} className='mb-3'>
              <div className='font-semibold'>{label}</div>
              <div>Khách yêu cầu: {item.quantity}</div>
              <div>Lý do: {refundReasonLabels[item.reason]}</div>
              <div>Giải thích của khách: {item.explanation}</div>
              <div>
                Khách chọn: {item.requestedReturn === "return" ? "Trả hàng" : "Không trả hàng"}
              </div>
              {decided && (
                <>
                  <div>Đã duyệt: {item.approvedQuantity}</div>
                  <div>Số lượng được giải phóng: {item.quantity - item.approvedQuantity}</div>
                  <div>Số tiền duyệt: {money(item.approvedAmount)}</div>
                  <div>Yêu cầu trả hàng: {item.returnRequired ? "Có" : "Không"}</div>
                  {item.decisionReason && (
                    <div>Lý do quyết định (nội bộ): {item.decisionReason}</div>
                  )}
                  {item.returnRequired && (
                    <div>
                      Đã nhận: {item.receivedQuantity} · Có thể bán lại: {item.sellableQuantity}
                    </div>
                  )}
                </>
              )}
              <RefundEvidence orderId={view.orderId} evidenceIds={item.evidenceIds} label={label} />
            </li>
          );
        })}
      </ul>
      {request.approval && (
        <p>
          Đã duyệt hoàn: {money(request.approval.amount)} (hàng{" "}
          {money(request.approval.merchandiseAmount)}, vận chuyển{" "}
          {money(request.approval.shippingAmount)})
        </p>
      )}
      {request.payout && (
        <section aria-label={`Khoản hoàn tiền đã hoàn tất của yêu cầu ${number}`}>
          <p>
            Đã hoàn tiền: {money(request.payout.amount)} (hàng{" "}
            {money(request.payout.merchandiseAmount)}, vận chuyển{" "}
            {money(request.payout.shippingAmount)})
          </p>
          <p>
            Chuyển lúc {formatOrderDate(request.payout.paidAt)} · Ghi nhận lúc{" "}
            {formatOrderDate(request.payout.recordedAt)} · Mã tham chiếu: {request.payout.reference}
          </p>
        </section>
      )}
      {request.history.length > 0 && (
        <ul aria-label={`Lịch sử yêu cầu ${number}`} className='list-disc pl-5'>
          {request.history.map((entry, position) => (
            <li key={position}>
              {formatOrderDate(entry.at)} · {entry.event}
              {entry.customerMessage && <> · Tin nhắn gửi khách: {entry.customerMessage}</>}
            </li>
          ))}
        </ul>
      )}
      {request.inspections.length > 0 && (
        <ul aria-label={`Kiểm tra hàng trả của yêu cầu ${number}`} className='list-disc pl-5'>
          {request.inspections.map((inspection, position) => (
            <li key={position}>
              {formatOrderDate(inspection.at)} · Ghi chú kiểm tra (nội bộ): {inspection.note}
            </li>
          ))}
        </ul>
      )}
      {view.canReview && request.stage === "awaiting_review" && !activeForm && (
        <Button onClick={() => onOpen({ type: "review", requestId: request.requestId })}>
          Duyệt yêu cầu
        </Button>
      )}
      {view.canReview && request.stage === "awaiting_return" && !activeForm && (
        <Button onClick={() => onOpen({ type: "inspect", requestId: request.requestId })}>
          Kiểm tra hàng trả
        </Button>
      )}
      {awaitingPayout && !view.canPay && (
        <Alert type='info' showIcon title={payoutPermissionText} />
      )}
      {awaitingPayout && view.canPay && <RefundPayoutForm ctx={ctx} request={request} />}
      {activeForm &&
        (activeForm.type === "review" && request.stage === "awaiting_review" ? (
          <RefundReviewForm ctx={ctx} request={request} labels={labels} onClose={onClose} />
        ) : activeForm.type === "inspect" && request.stage === "awaiting_return" ? (
          <RefundInspectionForm ctx={ctx} request={request} labels={labels} onClose={onClose} />
        ) : (
          <Alert
            type='warning'
            showIcon
            title='Yêu cầu đã chuyển sang trạng thái khác. Dữ liệu mới nhất đã được tải, vui lòng xem lại.'
            action={<Button onClick={onClose}>Đóng</Button>}
          />
        ))}
    </section>
  );
}
