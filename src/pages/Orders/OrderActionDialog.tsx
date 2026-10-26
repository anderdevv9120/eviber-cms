import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Flex, Modal, Spin } from "antd";
import {
  getOrderAPI,
  transitionOrderAPI,
  updatePaymentAPI,
  type AdminOrderDetail,
  type OrderStatus,
  type PaymentAction
} from "@/services/orders";
import type { ApiResponse } from "@/services/auth";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import FulfillmentForm from "./FulfillmentForm";
import PaymentForm from "./PaymentForm";
import type { ActionDraft } from "./order-action-input";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import {
  displayOrderText,
  formatOrderAmount,
  formatOrderDate,
  missingOrderData,
  orderActionLabels,
  orderStatusLabels,
  paymentActionLabels,
  paymentStatusLabels
} from "./order-display";

export type OrderActionIntent =
  { type: "fulfillment"; status: OrderStatus } | { type: "payment"; action: PaymentAction };

export interface OrderActionDialogProps {
  orderId: string;
  intent: OrderActionIntent;
  onClose: () => void;
  onOrderChanged: (order: AdminOrderDetail) => Promise<void>;
}

type ReloadKind = "initial" | "conflict" | "uncertain" | "validation";
interface Reload {
  id: number;
  kind: ReloadKind;
  message?: string;
  previous?: AdminOrderDetail;
}
interface Notice {
  type: "conflict" | "uncertain" | "validation" | "loadError";
  text: string;
  changes?: string[];
}
interface View {
  stage: "loading" | "reviewing" | "submitting" | "committed" | "error";
  order?: AdminOrderDetail; // the reviewed snapshot; its revision is what a submission carries
  committed?: AdminOrderDetail;
  notice?: Notice;
  needsAck?: boolean;
  acknowledged?: boolean;
  refreshError?: string;
}

const conflictText =
  "Đơn hàng đã được thay đổi bởi thao tác khác. Dữ liệu mới nhất đã được tải, vui lòng xem lại trước khi xác nhận lại.";
const uncertainText =
  "Chưa xác định được kết quả thao tác trước. Hãy kiểm tra trạng thái và lịch sử hiện tại trước khi thực hiện lại; hệ thống không tự gửi lại.";

const describeChanges = (before: AdminOrderDetail, after: AdminOrderDetail): string[] => {
  const changes: string[] = [];
  if (before.revision !== after.revision)
    changes.push(`Phiên bản: ${before.revision} → ${after.revision}`);
  if (before.status !== after.status)
    changes.push(
      `Trạng thái đơn hàng: ${orderStatusLabels[before.status]} → ${orderStatusLabels[after.status]}`
    );
  if (before.paymentStatus !== after.paymentStatus) {
    const label = (value: AdminOrderDetail["paymentStatus"]) =>
      value ? paymentStatusLabels[value] : missingOrderData;
    changes.push(
      `Trạng thái thanh toán: ${label(before.paymentStatus)} → ${label(after.paymentStatus)}`
    );
  }
  return changes.length ? changes : ["Không thấy thay đổi ở phiên bản hoặc trạng thái."];
};
const latestHistory = (order: AdminOrderDetail): string[] => {
  const status = order.statusHistory?.[order.statusHistory.length - 1];
  const payment = order.paymentHistory?.[order.paymentHistory.length - 1];
  return [
    status &&
      `Lịch sử đơn hàng gần nhất: ${orderStatusLabels[status.status]} (${formatOrderDate(status.changedAt)})`,
    payment &&
      `Lịch sử thanh toán gần nhất: ${paymentStatusLabels[payment.status]} (${formatOrderDate(payment.changedAt)})`
  ].filter((line): line is string => Boolean(line));
};

export default function OrderActionDialog({
  orderId,
  intent,
  onClose,
  onOrderChanged
}: OrderActionDialogProps) {
  const profile = useAppStore(state => state.profile);
  const permission = intent.type === "payment" ? "ORDER_PAYMENT_UPDATE" : "ORDER_UPDATE";
  const allowed = !!profile && canAccess(profile, { anyOf: [permission] });
  const [reload, setReload] = useState<Reload>({ id: 0, kind: "initial" });
  const [view, setView] = useState<View>({ stage: "loading" });
  const [draft, setDraft] = useState<ActionDraft>({ note: "", reference: "" });
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const latest = useRef(onOrderChanged);
  const paymentAction = intent.type === "payment" ? intent.action : undefined;

  useEffect(() => {
    latest.current = onOrderChanged;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Every open (and every conflict/uncertain recovery) reads the order fresh; the revision a
  // submission carries comes only from this read, never from the row or page that opened us.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const { kind, message, previous } = reload;
    getOrderAPI(orderId, controller.signal)
      .then(({ data }) => {
        if (!active) return;
        if (!data?._id) throw new Error("Không tải được dữ liệu đơn hàng");
        const revisionChanged = Boolean(previous) && previous?.revision !== data.revision;
        const needsAck =
          kind === "conflict" || kind === "uncertain" || (kind === "validation" && revisionChanged);
        const changes =
          kind === "initial" || !previous || (kind === "validation" && !revisionChanged)
            ? undefined
            : [
                ...describeChanges(previous, data),
                ...(kind === "uncertain" ? latestHistory(data) : [])
              ];
        setView({
          stage: "reviewing",
          order: data,
          notice:
            message && kind !== "initial" ? { type: kind, text: message, changes } : undefined,
          needsAck,
          acknowledged: false
        });
        // The parent catches up to what we just read; a failure there blocks further writes.
        if (needsAck)
          latest.current(data).catch(cause => {
            if (mounted.current)
              setView(current => ({ ...current, refreshError: getErrorMessage(cause) }));
          });
      })
      .catch(cause => {
        if (!active) return;
        const reason = getErrorMessage(cause);
        setView({
          stage: "error",
          notice: {
            type: "loadError",
            text: message ? `Không tải được trạng thái hiện tại: ${reason}` : reason
          }
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId, reload]);

  const startReload = (kind: ReloadKind, message: string, previous: AdminOrderDetail) => {
    setView({ stage: "loading" });
    setReload(current => ({ id: current.id + 1, kind, message, previous }));
  };
  const retryRead = () => {
    setView({ stage: "loading" });
    setReload(current => ({ ...current, id: current.id + 1 }));
  };

  const send = async (
    request: () => Promise<ApiResponse<AdminOrderDetail>>,
    reviewed: AdminOrderDetail
  ) => {
    const current = useAppStore.getState().profile;
    if (!current || !canAccess(current, { anyOf: [permission] }) || inFlight.current) return;
    inFlight.current = true;
    setView(current => ({ ...current, stage: "submitting", notice: undefined }));
    let committed: AdminOrderDetail;
    try {
      const { data } = await request();
      if (!data?._id) throw new ApiError("Phản hồi không hợp lệ");
      committed = data;
    } catch (cause) {
      if (!mounted.current) return;
      inFlight.current = false;
      const status = cause instanceof ApiError ? cause.status : undefined;
      if (status === 409) startReload("conflict", conflictText, reviewed);
      else if (status && status < 500) startReload("validation", getErrorMessage(cause), reviewed);
      else startReload("uncertain", uncertainText, reviewed);
      return;
    }
    if (!mounted.current) return;
    setView({ stage: "committed", committed });
    try {
      await latest.current(committed);
    } catch (cause) {
      if (mounted.current)
        setView(current => ({ ...current, refreshError: getErrorMessage(cause) }));
    }
  };
  const retryRefresh = () => {
    const target = view.committed ?? view.order;
    if (!target) return;
    latest
      .current(target)
      .then(() => {
        if (mounted.current) setView(current => ({ ...current, refreshError: undefined }));
      })
      .catch(cause => {
        if (mounted.current)
          setView(current => ({ ...current, refreshError: getErrorMessage(cause) }));
      });
  };

  const { stage, order } = view;
  const submitting = stage === "submitting";
  const formDisabled =
    !allowed || Boolean(view.refreshError) || Boolean(view.needsAck && !view.acknowledged);
  const targetGone =
    paymentAction === "correction" &&
    order &&
    draft.target &&
    !order.actions.paymentActions
      .find(item => item.action === "correction")
      ?.targets.includes(draft.target);
  const close = () => {
    if (!submitting) onClose();
  };
  const refreshAlert = view.refreshError && (
    <Alert
      type='error'
      showIcon
      className='mt-3'
      title={`Không làm mới được dữ liệu: ${view.refreshError}`}
      action={<Button onClick={retryRefresh}>Tải lại dữ liệu</Button>}
    />
  );

  return (
    <Modal
      open
      title={
        intent.type === "fulfillment"
          ? orderActionLabels[intent.status]
          : paymentActionLabels[intent.action]
      }
      onCancel={close}
      keyboard={!submitting}
      closable={!submitting}
      footer={
        <Button onClick={close} disabled={submitting}>
          Đóng
        </Button>
      }
    >
      {stage === "loading" && (
        <Flex justify='center' className='py-6'>
          <Spin aria-label='Đang tải đơn hàng' />
        </Flex>
      )}
      {stage === "error" && view.notice && (
        <Alert
          type='error'
          showIcon
          title={view.notice.text}
          action={<Button onClick={retryRead}>Thử lại</Button>}
        />
      )}
      {stage === "committed" && view.committed && (
        <>
          <Alert
            type='success'
            showIcon
            title='Đã ghi nhận thao tác.'
            description={`Đơn hàng ${displayOrderText(view.committed.orderNumber)}: ${
              orderStatusLabels[view.committed.status]
            }, ${
              view.committed.paymentStatus
                ? paymentStatusLabels[view.committed.paymentStatus]
                : missingOrderData
            }.`}
          />
          {refreshAlert}
        </>
      )}
      {order && (stage === "reviewing" || submitting) && (
        <>
          <Descriptions
            bordered
            size='small'
            column={1}
            items={[
              { key: "number", label: "Đơn hàng", children: displayOrderText(order.orderNumber) },
              {
                key: "total",
                label: "Tổng tiền",
                children: formatOrderAmount(
                  order.checkoutInfo.totalPrice,
                  order.checkoutInfo.currency
                )
              },
              {
                key: "status",
                label: "Trạng thái đơn hàng",
                children: orderStatusLabels[order.status]
              },
              {
                key: "payment",
                label: "Trạng thái thanh toán",
                children: order.paymentStatus
                  ? paymentStatusLabels[order.paymentStatus]
                  : missingOrderData
              }
            ]}
          />
          {view.notice && (
            <Alert
              type={view.notice.type === "validation" ? "error" : "warning"}
              showIcon
              className='mt-3'
              title={view.notice.text}
              description={
                view.notice.changes && (
                  <ul className='list-disc pl-5'>
                    {view.notice.changes.map(change => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                )
              }
            />
          )}
          {targetGone && (
            <Alert
              type='warning'
              showIcon
              className='mt-3'
              title='Trạng thái đích không còn hợp lệ, vui lòng chọn lại.'
            />
          )}
          {refreshAlert}
          {view.needsAck && (
            <Checkbox
              className='mt-3'
              checked={view.acknowledged}
              disabled={submitting}
              onChange={event =>
                setView(current => ({ ...current, acknowledged: event.target.checked }))
              }
            >
              Tôi đã xem lại dữ liệu mới nhất
            </Checkbox>
          )}
          {intent.type === "fulfillment" ? (
            <FulfillmentForm
              order={order}
              status={intent.status}
              draft={draft}
              onDraftChange={patch => setDraft(current => ({ ...current, ...patch }))}
              disabled={formDisabled}
              submitting={submitting}
              onSubmit={input => send(() => transitionOrderAPI(orderId, input), order)}
            />
          ) : (
            <PaymentForm
              order={order}
              action={intent.action}
              draft={draft}
              onDraftChange={patch => setDraft(current => ({ ...current, ...patch }))}
              disabled={formDisabled}
              submitting={submitting}
              onSubmit={input => send(() => updatePaymentAPI(orderId, input), order)}
            />
          )}
        </>
      )}
    </Modal>
  );
}
