import { useId, useState, type FormEvent } from "react";
import { ConfigProvider, Alert, Button, Flex, Input, Radio } from "antd";
import type {
  AdminOrderDetail,
  PaymentAction,
  WritablePaymentStatus,
  UpdatePaymentInput
} from "@/services/orders";
import { validateNote, validateReference, type ActionDraft } from "./order-action-input";
import { paymentStatusLabels } from "./order-display";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

export interface PaymentFormProps {
  order: AdminOrderDetail;
  action: PaymentAction;
  draft: ActionDraft;
  onDraftChange: (patch: Partial<ActionDraft>) => void;
  onSubmit: (input: UpdatePaymentInput) => void;
  onClose?: () => void;
  disabled?: boolean;
  submitting?: boolean;
}

export default function PaymentForm({
  order,
  action,
  draft,
  onDraftChange,
  onSubmit,
  onClose,
  disabled,
  submitting
}: PaymentFormProps) {
  const profile = useAppStore(state => state.profile);
  const allowed = !!profile && canAccess(profile, { anyOf: ["ORDER_PAYMENT_UPDATE"] });
  const noteId = useId();
  const referenceId = useId();
  const [attempted, setAttempted] = useState(false);
  const eligibility = order.actions.paymentActions.find(item => item.action === action);
  // Refunds only exist in the refund ledger; "refunded" is never a target this form can send.
  const targets: WritablePaymentStatus[] = (eligibility?.targets ?? []).filter(
    item => item !== "refunded"
  );
  // Ordinary receipt never offers a free status choice; only correction does.
  const fixed: WritablePaymentStatus | undefined = action === "receipt" ? "paid" : undefined;
  const target =
    fixed ?? (draft.target && targets.includes(draft.target) ? draft.target : undefined);
  const blocked = !eligibility?.enabled || !target || !targets.includes(target);
  const noteError = validateNote(draft.note, Boolean(eligibility?.requiresNote));
  const referenceError = validateReference(draft.reference);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: ["ORDER_PAYMENT_UPDATE"] }) ||
      disabled ||
      submitting ||
      blocked ||
      !target ||
      noteError ||
      referenceError
    )
      return;
    const note = draft.note.trim();
    const reference = draft.reference.trim();
    onSubmit({
      paymentStatus: target,
      action,
      expectedRevision: order.revision,
      ...(note ? { note } : {}),
      ...(reference ? { reference } : {})
    });
  };

  if (action === "refund")
    return (
      <Alert
        type='info'
        showIcon
        className='mt-4'
        title='Hoàn tiền được xử lý trong mục Hoàn tiền của đơn hàng, không ghi nhận qua thanh toán.'
      />
    );

  return (
    <ConfigProvider componentDisabled={!allowed || disabled || submitting}>
      <form onSubmit={submit} noValidate className='mt-4'>
        {eligibility && !eligibility.enabled ? (
          <Alert
            type='warning'
            showIcon
            title={eligibility.reason ?? "Thao tác này không còn khả dụng"}
          />
        ) : (
          <Alert
            type='info'
            showIcon
            className='mb-3'
            title={
              action === "correction"
                ? "Điều chỉnh trạng thái thanh toán không gửi email biên nhận và bắt buộc có lý do."
                : "Ghi nhận khách đã thanh toán cho toàn bộ đơn hàng."
            }
          />
        )}
        {action === "receipt" && order.status === "cancelled" && (
          <Alert
            type='warning'
            showIcon
            className='mb-3'
            title='Đơn hàng vẫn ở trạng thái đã hủy và tồn kho đã được hoàn lại trước đó. Thao tác này chỉ ghi nhận khoản thanh toán muộn.'
          />
        )}
        {action === "correction" && (
          <Radio.Group
            className='mb-3 flex flex-col gap-1'
            value={target}
            onChange={event =>
              onDraftChange({ target: event.target.value as WritablePaymentStatus })
            }
          >
            {targets.map(item => (
              <Radio key={item} value={item}>
                {paymentStatusLabels[item]}
              </Radio>
            ))}
          </Radio.Group>
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
        <label htmlFor={referenceId} className='mt-3 mb-1 block'>
          Mã tham chiếu
        </label>
        <Input
          id={referenceId}
          value={draft.reference}
          status={attempted && referenceError ? "error" : undefined}
          onChange={event => onDraftChange({ reference: event.target.value })}
        />
        {attempted && referenceError && <div className='mt-1 text-red-600'>{referenceError}</div>}
        <Flex justify='end' gap={8} className='mt-4'>
          {onClose && (
            <Button onClick={onClose} disabled={submitting}>
              Đóng
            </Button>
          )}
          <Button
            type='primary'
            htmlType='submit'
            loading={submitting}
            disabled={!allowed || blocked || disabled || submitting}
          >
            Xác nhận
          </Button>
        </Flex>
      </form>
    </ConfigProvider>
  );
}
