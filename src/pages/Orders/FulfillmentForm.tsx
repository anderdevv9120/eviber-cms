import { useId, useState, type FormEvent } from "react";
import { ConfigProvider, Alert, Button, Input } from "antd";
import type { AdminOrderDetail, OrderStatus, TransitionOrderInput } from "@/services/orders";
import { validateNote, type ActionDraft } from "./order-action-input";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

export interface FulfillmentFormProps {
  order: AdminOrderDetail;
  status: OrderStatus;
  draft: ActionDraft;
  onDraftChange: (patch: Partial<ActionDraft>) => void;
  onSubmit: (input: TransitionOrderInput) => void;
  disabled?: boolean;
  submitting?: boolean;
}

export default function FulfillmentForm({
  order,
  status,
  draft,
  onDraftChange,
  onSubmit,
  disabled,
  submitting
}: FulfillmentFormProps) {
  const profile = useAppStore(state => state.profile);
  const allowed = !!profile && canAccess(profile, { anyOf: ["ORDER_UPDATE"] });
  const noteId = useId();
  const [attempted, setAttempted] = useState(false);
  const eligibility = order.actions.orderStatuses.find(item => item.status === status);
  const blocked = !eligibility?.enabled;
  const noteError = validateNote(draft.note, Boolean(eligibility?.requiresNote));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: ["ORDER_UPDATE"] }) ||
      disabled ||
      submitting ||
      blocked ||
      noteError
    )
      return;
    const note = draft.note.trim();
    onSubmit({ status, expectedRevision: order.revision, ...(note ? { note } : {}) });
  };

  return (
    <ConfigProvider componentDisabled={!allowed || disabled || submitting}>
      <form onSubmit={submit} noValidate className='mt-4'>
        {blocked ? (
          <Alert
            type='warning'
            showIcon
            title={eligibility?.reason ?? "Thao tác này không còn khả dụng"}
          />
        ) : (
          <>
            {status === "returned" && (
              <Alert
                type='info'
                showIcon
                className='mb-3'
                title='Xác nhận hàng đã được trả về: tồn kho sẽ được hoàn lại theo số lượng của đơn hàng.'
              />
            )}
            {status === "cancelled" && (
              <Alert
                type='info'
                showIcon
                className='mb-3'
                title={
                  order.paymentStatus === "paid"
                    ? "Hủy đơn hàng sẽ hoàn lại tồn kho. Đơn đã thanh toán: hệ thống không tự động hoàn tiền, trạng thái thanh toán giữ nguyên; hãy ghi nhận hoàn tiền riêng nếu cần."
                    : "Hủy đơn hàng sẽ hoàn lại tồn kho."
                }
              />
            )}
          </>
        )}
        <label htmlFor={noteId} className='mb-1 block'>
          {eligibility?.requiresNote ? "Ghi chú (bắt buộc)" : "Ghi chú"}
        </label>
        <Input.TextArea
          id={noteId}
          rows={3}
          value={draft.note}
          status={attempted && noteError ? "error" : undefined}
          onChange={event => onDraftChange({ note: event.target.value })}
        />
        {attempted && noteError && <div className='mt-1 text-red-600'>{noteError}</div>}
        <Button
          type='primary'
          htmlType='submit'
          className='mt-4'
          loading={submitting}
          disabled={!allowed || blocked || disabled || submitting}
        >
          Xác nhận
        </Button>
      </form>
    </ConfigProvider>
  );
}
