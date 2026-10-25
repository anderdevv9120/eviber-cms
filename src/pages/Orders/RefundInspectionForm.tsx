import { useState, type FormEvent } from "react";
import { ConfigProvider, Alert, Button, Checkbox, Flex, Input, InputNumber } from "antd";
import {
  inspectRefundAPI,
  type AdminRefundRequest,
  type RefundInspectionInput
} from "@/services/refunds";
import { isWholeNumber, useRefundCommand, type RefundContext } from "./useRefundCommand";

const NOTE_MAX = 2000;

interface RowDraft {
  received: number | null;
  sellable: number | null;
  confirmed: boolean;
}

export default function RefundInspectionForm({
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
  const command = useRefundCommand(ctx, "ORDER_REFUND_REVIEW");
  const [attempted, setAttempted] = useState(false);
  // Only approved returns that still have goods outstanding can be inspected.
  const pending = request.items.filter(
    item =>
      item.returnRequired &&
      item.reason !== "missing_item" &&
      item.approvedQuantity > item.receivedQuantity
  );
  // Received and sellable start at zero: nothing is restocked unless staff say so.
  const [rows, setRows] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(
      pending.map(item => [item.allocationId, { received: 0, sellable: 0, confirmed: false }])
    )
  );
  const [note, setNote] = useState("");

  const edit = (patch: () => void) => {
    patch();
    command.edited();
  };
  const editRow = (allocationId: string, patch: Partial<RowDraft>) =>
    edit(() =>
      setRows(current => ({ ...current, [allocationId]: { ...current[allocationId], ...patch } }))
    );

  const errors: Record<string, string> = {};
  const inspected: RefundInspectionInput["items"] = [];
  for (const item of pending) {
    const row = rows[item.allocationId];
    const outstanding = item.approvedQuantity - item.receivedQuantity;
    if (!isWholeNumber(row.received) || row.received > outstanding)
      errors[`received:${item.allocationId}`] = `Số lượng đã nhận từ 0 đến ${outstanding}`;
    else if (!isWholeNumber(row.sellable))
      errors[`sellable:${item.allocationId}`] =
        "Số lượng có thể bán lại phải là số nguyên không âm";
    else if (row.sellable > row.received)
      errors[`sellable:${item.allocationId}`] =
        "Số lượng có thể bán lại không được vượt số đã nhận";
    if (isWholeNumber(row.sellable) && row.sellable > 0 && !row.confirmed)
      errors[`confirmed:${item.allocationId}`] = "Cần xác nhận hàng nhận về đúng biến thể đã mua";
    if (
      isWholeNumber(row.received) &&
      isWholeNumber(row.sellable) &&
      row.received > 0 &&
      !errors[`received:${item.allocationId}`] &&
      !errors[`sellable:${item.allocationId}`] &&
      !errors[`confirmed:${item.allocationId}`]
    )
      inspected.push({
        allocationId: item.allocationId,
        receivedQuantity: row.received,
        sellableQuantity: row.sellable,
        confirmedPurchasedVariant: row.confirmed
      });
  }
  const trimmed = note.trim();
  if (!trimmed) errors.note = "Cần nhập ghi chú kiểm tra";
  else if (trimmed.length > NOTE_MAX) errors.note = `Ghi chú tối đa ${NOTE_MAX} ký tự`;
  if (!Object.keys(errors).length && !inspected.length)
    errors.items = "Cần nhập số lượng đã nhận cho ít nhất một sản phẩm";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    return command.submit(input =>
      inspectRefundAPI(ctx.view.orderId, request.requestId, {
        ...input,
        items: inspected,
        note: trimmed
      })
    );
  };
  const error = (name: string) =>
    attempted && errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  return (
    <ConfigProvider componentDisabled={!command.canEdit}>
      <form aria-label='Kiểm tra hàng trả' onSubmit={submit} noValidate className='mt-4'>
        <Alert
          type='info'
          showIcon
          className='mb-3'
          title='Nhận hàng không tự động nhập lại kho. Chỉ số lượng "có thể bán lại" đã xác nhận đúng biến thể mới được nhập kho.'
        />
        {pending.map(item => {
          const label = labels[item.allocationId];
          const row = rows[item.allocationId];
          return (
            <fieldset key={item.allocationId} className='mb-4'>
              <legend className='font-semibold'>{label}</legend>
              <p>
                Đã duyệt trả {item.approvedQuantity} · Đã nhận {item.receivedQuantity}
              </p>
              <div className='mt-2'>
                <InputNumber
                  aria-label={`Số lượng đã nhận ${label}`}
                  precision={0}
                  value={row.received}
                  onChange={value => editRow(item.allocationId, { received: value })}
                />
                {error(`received:${item.allocationId}`)}
              </div>
              <div className='mt-2'>
                <InputNumber
                  aria-label={`Số lượng có thể bán lại ${label}`}
                  precision={0}
                  value={row.sellable}
                  onChange={value => editRow(item.allocationId, { sellable: value })}
                />
                {error(`sellable:${item.allocationId}`)}
              </div>
              <Checkbox
                className='mt-2'
                checked={row.confirmed}
                onChange={event => editRow(item.allocationId, { confirmed: event.target.checked })}
              >
                {`Xác nhận hàng nhận về đúng biến thể đã mua ${label}`}
              </Checkbox>
              {error(`confirmed:${item.allocationId}`)}
            </fieldset>
          );
        })}
        {error("items")}
        <Input.TextArea
          aria-label='Ghi chú kiểm tra'
          placeholder='Ghi chú kiểm tra (nội bộ)'
          rows={2}
          value={note}
          onChange={event => edit(() => setNote(event.target.value))}
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
            Ghi nhận kiểm tra
          </Button>
          <Button onClick={onClose} disabled={command.busy}>
            Đóng
          </Button>
        </Flex>
      </form>
    </ConfigProvider>
  );
}
