import { useState, type FormEvent } from "react";
import { ConfigProvider, Button, Checkbox, Flex, Input, InputNumber } from "antd";
import {
  decideRefundAPI,
  type AdminRefundRequest,
  type RefundDecisionInput
} from "@/services/refunds";
import { formatOrderAmount, refundReasonLabels } from "./order-display";
import RefundEvidence from "./RefundEvidence";
import { isWholeNumber, useRefundCommand, type RefundContext } from "./useRefundCommand";

const REASON_MAX = 500;
const TEXT_MAX = 2000;

interface RowDraft {
  approvedQuantity: number | null;
  returnRequired: boolean;
  waived: boolean;
  reason: string;
}

export default function RefundReviewForm({
  ctx,
  request,
  labels,
  onClose
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  labels: Record<string, string>;
  onClose: () => void;
}) {
  const { view } = ctx;
  const command = useRefundCommand(ctx, "ORDER_REFUND_REVIEW");
  const [attempted, setAttempted] = useState(false);
  // Approving everything is only the starting point; every line still needs an explicit reason.
  const [rows, setRows] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(
      request.items.map(item => [
        item.allocationId,
        {
          approvedQuantity: item.quantity,
          returnRequired: item.reason !== "missing_item" && item.requestedReturn === "return",
          waived: false,
          reason: ""
        }
      ])
    )
  );
  // Shipping is never approved implicitly.
  const [shipping, setShipping] = useState<number | null>(0);
  const [customerMessage, setCustomerMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const edit = (patch: () => void) => {
    patch();
    command.edited();
  };
  const editRow = (allocationId: string, patch: Partial<RowDraft>) =>
    edit(() =>
      setRows(current => ({ ...current, [allocationId]: { ...current[allocationId], ...patch } }))
    );

  const maxShipping = view.remainingPaidShipping + request.shipping.reservedAmount;
  const errors: Record<string, string> = {};
  const decisions: RefundDecisionInput["items"] = [];
  for (const item of request.items) {
    const row = rows[item.allocationId];
    const reason = row.reason.trim();
    const quantity = row.approvedQuantity;
    const before = Object.keys(errors).length;
    if (!isWholeNumber(quantity) || quantity > item.quantity)
      errors[`quantity:${item.allocationId}`] = `Số lượng duyệt từ 0 đến ${item.quantity}`;
    if (!reason) errors[`reason:${item.allocationId}`] = "Cần nhập lý do quyết định";
    else if (reason.length > REASON_MAX)
      errors[`reason:${item.allocationId}`] = `Lý do tối đa ${REASON_MAX} ký tự`;
    if (item.reason === "missing_item" && (quantity ?? 0) > 0 && !row.waived)
      errors[`waiver:${item.allocationId}`] = "Cần xác nhận miễn trả hàng cho hàng bị thiếu";
    if (Object.keys(errors).length === before && isWholeNumber(quantity))
      decisions.push({
        allocationId: item.allocationId,
        approvedQuantity: quantity,
        returnRequired: item.reason !== "missing_item" && row.returnRequired,
        reason
      });
  }
  if (!isWholeNumber(shipping) || shipping > maxShipping)
    errors.shipping = `Phí vận chuyển hoàn từ 0 đến ${formatOrderAmount(maxShipping, "VND")}`;
  const message = customerMessage.trim();
  const note = internalNote.trim();
  if (message.length > TEXT_MAX) errors.message = `Tin nhắn tối đa ${TEXT_MAX} ký tự`;
  if (note.length > TEXT_MAX) errors.note = `Ghi chú tối đa ${TEXT_MAX} ký tự`;
  // Every line at zero and no shipping is a full rejection, which the customer must be told about.
  if (
    !errors.message &&
    !message &&
    decisions.length === request.items.length &&
    decisions.every(decision => decision.approvedQuantity === 0) &&
    shipping === 0
  )
    errors.message = "Cần nêu lý do gửi khách khi từ chối toàn bộ yêu cầu";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length || !isWholeNumber(shipping)) return;
    return command.submit(input =>
      decideRefundAPI(view.orderId, request.requestId, {
        ...input,
        items: decisions,
        shippingAmount: shipping,
        customerMessage: message,
        ...(note ? { internalNote: note } : {})
      })
    );
  };
  const error = (name: string) =>
    attempted && errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  return (
    <ConfigProvider componentDisabled={!command.canEdit}>
      <form aria-label='Duyệt yêu cầu hoàn tiền' onSubmit={submit} noValidate className='mt-4'>
        {request.items.map(item => {
          const label = labels[item.allocationId];
          const row = rows[item.allocationId];
          return (
            <fieldset key={item.allocationId} className='mb-4'>
              <legend className='font-semibold'>{label}</legend>
              {ctx.readable !== false && (
                <>
                  <p>
                    Khách yêu cầu {item.quantity} · {refundReasonLabels[item.reason]}
                  </p>
                  <p>Giải thích của khách: {item.explanation}</p>
                  <RefundEvidence
                    orderId={view.orderId}
                    evidenceIds={item.evidenceIds}
                    label={label}
                  />
                </>
              )}
              <div className='mt-2'>
                <InputNumber
                  aria-label={`Số lượng duyệt ${label}`}
                  precision={0}
                  value={row.approvedQuantity}
                  status={
                    attempted && errors[`quantity:${item.allocationId}`] ? "error" : undefined
                  }
                  onChange={value => editRow(item.allocationId, { approvedQuantity: value })}
                />
                {error(`quantity:${item.allocationId}`)}
              </div>
              {item.reason === "missing_item" ? (
                <Checkbox
                  className='mt-2'
                  checked={row.waived}
                  onChange={event => editRow(item.allocationId, { waived: event.target.checked })}
                >
                  {`Xác nhận miễn trả hàng cho hàng bị thiếu ${label}`}
                </Checkbox>
              ) : (
                <Checkbox
                  className='mt-2'
                  checked={row.returnRequired}
                  onChange={event =>
                    editRow(item.allocationId, { returnRequired: event.target.checked })
                  }
                >
                  {`Yêu cầu trả hàng ${label}`}
                </Checkbox>
              )}
              {error(`waiver:${item.allocationId}`)}
              <Input
                className='mt-2'
                aria-label={`Lý do quyết định ${label}`}
                placeholder='Lý do quyết định (nội bộ)'
                value={row.reason}
                status={attempted && errors[`reason:${item.allocationId}`] ? "error" : undefined}
                onChange={event => editRow(item.allocationId, { reason: event.target.value })}
              />
              {error(`reason:${item.allocationId}`)}
            </fieldset>
          );
        })}
        <div className='mb-3'>
          <div className='mb-1'>Phí vận chuyển hoàn</div>
          <InputNumber
            aria-label='Phí vận chuyển hoàn'
            precision={0}
            value={shipping}
            onChange={value => edit(() => setShipping(value))}
          />
          {error("shipping")}
        </div>
        <Input.TextArea
          aria-label='Tin nhắn gửi khách hàng'
          placeholder='Tin nhắn gửi khách hàng'
          rows={2}
          value={customerMessage}
          onChange={event => edit(() => setCustomerMessage(event.target.value))}
        />
        {error("message")}
        <Input.TextArea
          className='mt-3'
          aria-label='Ghi chú nội bộ'
          placeholder='Ghi chú nội bộ (khách không thấy)'
          rows={2}
          value={internalNote}
          onChange={event => edit(() => setInternalNote(event.target.value))}
        />
        {error("note")}
        {command.notices}
        <Flex gap={8} className='mt-4'>
          <Button
            type='primary'
            htmlType='submit'
            loading={command.busy}
            disabled={!command.canSubmit}
          >
            Xác nhận duyệt
          </Button>
          <Button onClick={onClose} disabled={command.busy}>
            Đóng
          </Button>
        </Flex>
      </form>
    </ConfigProvider>
  );
}
