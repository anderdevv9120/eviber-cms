import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Flex,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography
} from "antd";
import dayjs from "dayjs";
import {
  getOrderRefundsAPI,
  type AdminRefundOrderView,
  type AdminRefundRequest,
  type RefundCoverage,
  type RefundOrderAllocationView,
  type RefundStage
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
const coverageColors: Record<RefundCoverage, string> = {
  none: "default",
  partial: "warning",
  full: "success"
};
const stageColors: Record<RefundStage, string> = {
  awaiting_review: "warning",
  awaiting_return: "processing",
  awaiting_payout: "warning",
  payout_in_progress: "processing",
  refunded: "success",
  rejected: "default"
};
// Stages where staff must act next; drives the "chờ xử lý" count next to the title.
const actionStages: RefundStage[] = ["awaiting_review", "awaiting_return", "awaiting_payout"];
const deadlineNote = (deadline: string) => {
  const left = dayjs(deadline).diff(dayjs(), "day", true);
  return left < 0 ? <Tag color='error'>Quá hạn</Tag> : <Tag>Còn {Math.ceil(left)} ngày</Tag>;
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
  const pending = view.requests.filter(request => actionStages.includes(request.stage)).length;
  const refundedTotal = view.summary.paidAmount + view.summary.paidShippingAmount;

  return (
    <section aria-label='Hoàn tiền' className='mt-6'>
      <Flex justify='space-between' align='center' className='mb-3'>
        <Flex gap={8} align='center'>
          <Typography.Title level={3} className='m-0!'>
            Hoàn tiền
          </Typography.Title>
          {pending > 0 && <Tag color='warning'>{pending} yêu cầu chờ xử lý</Tag>}
        </Flex>
        {view.canReview &&
          (eligibility.reviewRequired ? (
            <Button type='primary' onClick={() => setForm({ type: "legacy" })}>
              Đối soát đơn cũ
            </Button>
          ) : (
            <Button onClick={() => setForm({ type: "exception" })}>Tạo yêu cầu ngoại lệ</Button>
          ))}
      </Flex>
      {refreshError && (
        <Alert
          type='error'
          showIcon
          className='mb-3'
          title={`Không làm mới được thông tin đơn hàng: ${refreshError}`}
          action={<Button onClick={refreshOrder}>Tải lại đơn hàng</Button>}
        />
      )}
      {eligibility.reviewRequired ? (
        <Alert
          type='warning'
          showIcon
          className='mb-3'
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
            className='mb-3'
            title={`Khách chưa thể tự gửi yêu cầu: ${eligibility.reason}`}
          />
        )
      )}
      <Flex gap={48} align='flex-start' className='mb-4'>
        <Statistic
          title='Đã hoàn'
          value={refundedTotal}
          formatter={value => money(Number(value))}
        />
        <Statistic
          title='Phí vận chuyển còn có thể hoàn'
          value={view.remainingPaidShipping}
          formatter={value => money(Number(value))}
        />
        <Flex vertical gap={4} align='flex-start'>
          <Typography.Text type='secondary'>Mức hoàn</Typography.Text>
          <Tag color={coverageColors[view.summary.coverage]} className='m-0'>
            {coverageLabels[view.summary.coverage]}
          </Tag>
        </Flex>
      </Flex>
      <Descriptions
        bordered
        size='small'
        column={2}
        items={[
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
            children: view.deadline ? (
              <>
                {formatOrderDate(view.deadline)} {deadlineNote(view.deadline)}
              </>
            ) : (
              "Chưa xác định (chưa giao hoặc thiếu lịch sử giao hàng)"
            )
          }
        ]}
      />
      {form?.type === "legacy" && (
        <RefundExceptionForm mode='legacy' ctx={ctx} labels={labels} onClose={closeForm} />
      )}
      {form?.type === "exception" && (
        <RefundExceptionForm mode='request' ctx={ctx} labels={labels} onClose={closeForm} />
      )}
      {/* The legacy form lists these same lines with editable amounts. */}
      {form?.type !== "legacy" && (
        <Table<RefundOrderAllocationView>
          className='mt-4'
          size='small'
          pagination={false}
          rowKey='allocationId'
          dataSource={view.allocations}
          locale={{ emptyText: "Chưa có dữ liệu" }}
          columns={[
            { title: "Sản phẩm mua", key: "product", render: (_, row) => labels[row.allocationId] },
            { title: "Đã mua", dataIndex: "purchasedQuantity", key: "purchased", align: "right" },
            {
              title: "Còn có thể hoàn",
              dataIndex: "availableQuantity",
              key: "available",
              align: "right"
            },
            {
              title: "Đang yêu cầu",
              dataIndex: "requestedQuantity",
              key: "requested",
              align: "right"
            },
            { title: "Đã hoàn", dataIndex: "refundedQuantity", key: "refunded", align: "right" },
            {
              title: "Thành tiền",
              key: "net",
              align: "right",
              render: (_, row) => money(row.netAmount)
            }
          ]}
        />
      )}
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
  // One chronology for decisions and goods inspections; ISO strings sort lexicographically.
  const timeline = [
    ...request.history.map(entry => ({
      at: entry.at,
      content: (
        <>
          {formatOrderDate(entry.at)} · {entry.event}
          {entry.customerMessage && <> · Tin nhắn gửi khách: {entry.customerMessage}</>}
        </>
      )
    })),
    ...request.inspections.map(inspection => ({
      at: inspection.at,
      content: (
        <>
          {formatOrderDate(inspection.at)} · <Tag>Nội bộ</Tag>Ghi chú kiểm tra: {inspection.note}
        </>
      )
    }))
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section aria-label={`Yêu cầu hoàn tiền ${number}`} className='mt-6'>
      <Flex justify='space-between' align='center' className='mb-1'>
        <Flex gap={8} align='center'>
          <Typography.Title level={4} className='m-0!'>
            Yêu cầu {number}
          </Typography.Title>
          <Tag color={stageColors[request.stage]}>{refundStatusLabels[request.stage]}</Tag>
          {request.exceptionReason && <Tag color='orange'>Ngoại lệ</Tag>}
          <Typography.Text type='secondary'>
            Gửi lúc: {formatOrderDate(request.submittedAt)}
          </Typography.Text>
        </Flex>
        {view.canReview && request.stage === "awaiting_review" && !activeForm && (
          <Button
            type='primary'
            onClick={() => onOpen({ type: "review", requestId: request.requestId })}
          >
            Duyệt yêu cầu
          </Button>
        )}
        {view.canReview && request.stage === "awaiting_return" && !activeForm && (
          <Button
            type='primary'
            onClick={() => onOpen({ type: "inspect", requestId: request.requestId })}
          >
            Kiểm tra hàng trả
          </Button>
        )}
      </Flex>
      {request.exceptionReason && (
        <div>
          <Tag>Nội bộ</Tag>Lý do ngoại lệ: {request.exceptionReason}
        </div>
      )}
      <ul aria-label={`Sản phẩm của yêu cầu ${number}`} className='list-none p-0'>
        {request.items.map(item => {
          const label = labels[item.allocationId];
          return (
            <li key={item.allocationId} className='mt-3 mb-4'>
              <div className='mb-1 font-semibold'>{label}</div>
              <div className={decided ? "grid grid-cols-2 gap-x-8" : undefined}>
                <div>
                  {decided && <Typography.Text type='secondary'>Từ khách hàng</Typography.Text>}
                  <div>Khách yêu cầu: {item.quantity}</div>
                  <div>Lý do: {refundReasonLabels[item.reason]}</div>
                  <div>Giải thích của khách: {item.explanation}</div>
                  <div>
                    Khách chọn: {item.requestedReturn === "return" ? "Trả hàng" : "Không trả hàng"}
                  </div>
                </div>
                {decided && (
                  <div>
                    <Typography.Text type='secondary'>Quyết định</Typography.Text>
                    <div>Đã duyệt: {item.approvedQuantity}</div>
                    <div>Số lượng được giải phóng: {item.quantity - item.approvedQuantity}</div>
                    <div>Số tiền duyệt: {money(item.approvedAmount)}</div>
                    <div>Yêu cầu trả hàng: {item.returnRequired ? "Có" : "Không"}</div>
                    {item.decisionReason && (
                      <div>
                        <Tag>Nội bộ</Tag>Lý do quyết định: {item.decisionReason}
                      </div>
                    )}
                    {item.returnRequired && (
                      <div>
                        Đã nhận: {item.receivedQuantity} · Có thể bán lại: {item.sellableQuantity}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <RefundEvidence orderId={view.orderId} evidenceIds={item.evidenceIds} label={label} />
            </li>
          );
        })}
      </ul>
      {request.approval && (
        <div className='mb-2'>
          <Typography.Text strong>Đã duyệt hoàn: {money(request.approval.amount)}</Typography.Text>{" "}
          <Typography.Text type='secondary'>
            (hàng {money(request.approval.merchandiseAmount)}, vận chuyển{" "}
            {money(request.approval.shippingAmount)})
          </Typography.Text>
        </div>
      )}
      {request.payout && (
        <section aria-label={`Khoản hoàn tiền đã hoàn tất của yêu cầu ${number}`} className='mb-2'>
          <div>
            <Typography.Text strong>Đã hoàn tiền: {money(request.payout.amount)}</Typography.Text>{" "}
            <Typography.Text type='secondary'>
              (hàng {money(request.payout.merchandiseAmount)}, vận chuyển{" "}
              {money(request.payout.shippingAmount)})
            </Typography.Text>
          </div>
          <Typography.Text type='secondary'>
            Chuyển lúc {formatOrderDate(request.payout.paidAt)} · Ghi nhận lúc{" "}
            {formatOrderDate(request.payout.recordedAt)} · Mã tham chiếu: {request.payout.reference}
          </Typography.Text>
        </section>
      )}
      {timeline.length > 0 && (
        <div role='group' aria-label={`Lịch sử yêu cầu ${number}`} className='mt-4'>
          <Timeline items={timeline} />
        </div>
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
