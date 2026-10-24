import { useState, type FormEvent } from "react";
import { Alert, Button, Checkbox, DatePicker, Flex, Input, InputNumber, Radio, Select } from "antd";
import dayjs from "dayjs";
import {
  createAdminRefundAPI,
  reviewLegacyRefundAPI,
  type CreateAdminRefundInput,
  type RefundLegacyReviewInput,
  type RefundReason,
  type RefundSelection
} from "@/services/refunds";
import { formatOrderAmount, refundReasonLabels } from "./order-display";
import { isWholeNumber, useRefundCommand, type RefundContext } from "./useRefundCommand";

const REASON_MAX = 500;
const EXPLANATION_MAX = 2000;

interface Props {
  ctx: RefundContext;
  labels: Record<string, string>;
  onClose: () => void;
}

// Admin exception requests and the one-time legacy ledger review are the only ways to act outside
// the customer flow; both are audited server-side and need an explicit staff reason.
export default function RefundExceptionForm({
  mode,
  ...props
}: Props & { mode: "request" | "legacy" }) {
  return mode === "legacy" ? <LegacyReview {...props} /> : <ExceptionRequest {...props} />;
}

interface LineDraft {
  quantity: number | null;
  reason: RefundReason;
  explanation: string;
  requestedReturn: RefundSelection["requestedReturn"];
}

function ExceptionRequest({ ctx, labels, onClose }: Props) {
  const { view } = ctx;
  const command = useRefundCommand(ctx);
  const [attempted, setAttempted] = useState(false);
  // Only what the server says can still be refunded is offered; history is never editable here.
  const open = view.allocations.filter(allocation => allocation.availableQuantity > 0);
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      open.map(allocation => [
        allocation.allocationId,
        { quantity: 0, reason: "ordinary", explanation: "", requestedReturn: "return" }
      ])
    )
  );
  const [shippingOnly, setShippingOnly] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");

  const edit = (patch: () => void) => {
    patch();
    command.edited();
  };
  const editLine = (allocationId: string, patch: Partial<LineDraft>) =>
    edit(() =>
      setLines(current => ({ ...current, [allocationId]: { ...current[allocationId], ...patch } }))
    );

  const errors: Record<string, string> = {};
  const items: RefundSelection[] = [];
  const reason = exceptionReason.trim();
  if (!reason) errors.reason = "Cần nêu lý do ngoại lệ";
  else if (reason.length > REASON_MAX) errors.reason = `Lý do tối đa ${REASON_MAX} ký tự`;
  if (!shippingOnly) {
    for (const allocation of open) {
      const line = lines[allocation.allocationId];
      if (line.quantity === 0) continue;
      const explanation = line.explanation.trim();
      const before = Object.keys(errors).length;
      if (!isWholeNumber(line.quantity) || line.quantity > allocation.availableQuantity)
        errors[`quantity:${allocation.allocationId}`] =
          `Tối đa ${allocation.availableQuantity} sản phẩm có thể hoàn`;
      if (!explanation) errors[`explanation:${allocation.allocationId}`] = "Cần nhập giải thích";
      else if (explanation.length > EXPLANATION_MAX)
        errors[`explanation:${allocation.allocationId}`] =
          `Giải thích tối đa ${EXPLANATION_MAX} ký tự`;
      if (Object.keys(errors).length === before && isWholeNumber(line.quantity))
        items.push({
          allocationId: allocation.allocationId,
          quantity: line.quantity,
          reason: line.reason,
          explanation,
          requestedReturn: line.requestedReturn,
          evidenceIds: []
        });
    }
    if (!Object.keys(errors).some(name => name.includes(":")) && !items.length)
      errors.items = "Chọn ít nhất một sản phẩm hoặc chỉ hoàn phí vận chuyển";
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    return command.submit(input => {
      const body: CreateAdminRefundInput = {
        ...input,
        exceptionReason: reason,
        items,
        shippingOnly
      };
      return createAdminRefundAPI(view.orderId, body);
    });
  };
  const error = (name: string) =>
    attempted && errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  return (
    <form aria-label='Tạo yêu cầu ngoại lệ' onSubmit={submit} noValidate className='mt-4'>
      <Alert
        type='info'
        showIcon
        className='mb-3'
        title='Dùng cho yêu cầu quá hạn, chưa rõ thời điểm giao, đơn đã hủy hoặc chỉ hoàn phí vận chuyển. Yêu cầu được ghi lại cùng lý do ngoại lệ.'
      />
      <Checkbox
        checked={shippingOnly}
        onChange={event => edit(() => setShippingOnly(event.target.checked))}
      >
        Chỉ hoàn phí vận chuyển
      </Checkbox>
      {!shippingOnly &&
        open.map(allocation => {
          const label = labels[allocation.allocationId];
          const line = lines[allocation.allocationId];
          return (
            <fieldset key={allocation.allocationId} className='my-3'>
              <legend className='font-semibold'>{label}</legend>
              <p>Còn có thể hoàn: {allocation.availableQuantity}</p>
              <InputNumber
                aria-label={`Số lượng hoàn ${label}`}
                precision={0}
                value={line.quantity}
                onChange={value => editLine(allocation.allocationId, { quantity: value })}
              />
              {error(`quantity:${allocation.allocationId}`)}
              <Select<RefundReason>
                className='mt-2 block w-60'
                aria-label={`Lý do hoàn ${label}`}
                value={line.reason}
                options={Object.entries(refundReasonLabels).map(([value, text]) => ({
                  value: value as RefundReason,
                  label: text
                }))}
                onChange={value => editLine(allocation.allocationId, { reason: value })}
              />
              <Input.TextArea
                className='mt-2'
                aria-label={`Giải thích ${label}`}
                placeholder='Giải thích'
                rows={2}
                value={line.explanation}
                onChange={event =>
                  editLine(allocation.allocationId, { explanation: event.target.value })
                }
              />
              {error(`explanation:${allocation.allocationId}`)}
              <Radio.Group
                className='mt-2'
                aria-label={`Hình thức hoàn ${label}`}
                value={line.requestedReturn}
                onChange={event =>
                  editLine(allocation.allocationId, { requestedReturn: event.target.value })
                }
              >
                <Radio value='return'>Trả hàng</Radio>
                <Radio value='no_return'>Không trả hàng</Radio>
              </Radio.Group>
            </fieldset>
          );
        })}
      {error("items")}
      <Input
        className='mt-3'
        aria-label='Lý do ngoại lệ'
        placeholder='Lý do ngoại lệ (nội bộ)'
        value={exceptionReason}
        onChange={event => edit(() => setExceptionReason(event.target.value))}
      />
      {error("reason")}
      {command.notices}
      <Flex gap={8} className='mt-4'>
        <Button
          type='primary'
          htmlType='submit'
          loading={command.busy}
          disabled={!command.canSubmit}
        >
          Gửi yêu cầu ngoại lệ
        </Button>
        <Button onClick={onClose} disabled={command.busy}>
          Đóng
        </Button>
      </Flex>
    </form>
  );
}

function LegacyReview({ ctx, labels, onClose }: Props) {
  const { view } = ctx;
  const command = useRefundCommand(ctx);
  const [attempted, setAttempted] = useState(false);
  // A line amount the server could already establish is shown, never re-typed.
  const known = (netAmount: number) => netAmount > 0;
  const [amounts, setAmounts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(view.allocations.map(allocation => [allocation.allocationId, null]))
  );
  const [shipping, setShipping] = useState<number | null>(0);
  const [received, setReceived] = useState<number | null>(null);
  const [deliveredAt, setDeliveredAt] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const needsDelivery = view.deadline === null;

  const edit = (patch: () => void) => {
    patch();
    command.edited();
  };

  const errors: Record<string, string> = {};
  const lineAmounts: RefundLegacyReviewInput["allocations"] = [];
  let lineTotal = 0;
  for (const allocation of view.allocations) {
    const amount = known(allocation.netAmount)
      ? allocation.netAmount
      : amounts[allocation.allocationId];
    if (!isWholeNumber(amount)) errors.lines = "Cần nhập số tiền thực tế của từng dòng";
    else {
      lineAmounts.push({ productInfoIndex: allocation.productInfoIndex, netAmount: amount });
      lineTotal += amount;
    }
  }
  if (!isWholeNumber(shipping)) errors.shipping = "Phí vận chuyển phải là số nguyên không âm";
  if (!isWholeNumber(received)) errors.received = "Cần nhập số tiền đã thu";
  else if (!errors.lines && isWholeNumber(shipping) && received !== lineTotal + shipping)
    errors.received = "Số tiền đã thu phải bằng tổng các dòng cộng phí vận chuyển";
  let deliveredIso: string | undefined;
  if (needsDelivery) {
    if (!deliveredAt) errors.deliveredAt = "Cần kê khai thời điểm giao hàng";
    else if (Number.isNaN(new Date(deliveredAt).getTime()))
      errors.deliveredAt = "Thời điểm giao hàng không hợp lệ";
    else deliveredIso = new Date(deliveredAt).toISOString();
  }
  const trimmed = reason.trim();
  if (!trimmed) errors.reason = "Cần nhập lý do đối soát";
  else if (trimmed.length > REASON_MAX) errors.reason = `Lý do tối đa ${REASON_MAX} ký tự`;
  if (!attested) errors.attested = "Cần xác nhận đã đối soát chứng từ";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length || !isWholeNumber(received) || !isWholeNumber(shipping)) return;
    return command.submit(input =>
      reviewLegacyRefundAPI(view.orderId, {
        ...input,
        ...(deliveredIso ? { deliveredAt: deliveredIso } : {}),
        receivedAmount: received,
        allocations: lineAmounts,
        shippingAmount: shipping,
        reason: trimmed
      })
    );
  };
  const error = (name: string) =>
    attempted && errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  return (
    <form aria-label='Đối soát đơn cũ' onSubmit={submit} noValidate className='mt-4'>
      <Alert
        type='warning'
        showIcon
        className='mb-3'
        title='Đối soát chỉ thực hiện một lần cho mỗi đơn cũ. Số liệu bạn kê khai trở thành sổ hoàn tiền và được ghi vào lịch sử kiểm toán.'
      />
      <ul aria-label='Dòng hàng cần đối soát' className='list-none p-0'>
        {view.allocations.map(allocation => {
          const label = labels[allocation.allocationId];
          return (
            <li key={allocation.allocationId} className='mb-3'>
              <div className='font-semibold'>{label}</div>
              <div>Số lượng đã mua: {allocation.purchasedQuantity}</div>
              {known(allocation.netAmount) ? (
                <div>Thành tiền đã xác định: {formatOrderAmount(allocation.netAmount, "VND")}</div>
              ) : (
                <InputNumber
                  aria-label={`Số tiền thực tế ${label}`}
                  precision={0}
                  value={amounts[allocation.allocationId]}
                  onChange={value =>
                    edit(() =>
                      setAmounts(current => ({ ...current, [allocation.allocationId]: value }))
                    )
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
      {error("lines")}
      <div className='mt-3'>
        <div className='mb-1'>Phí vận chuyển</div>
        <InputNumber
          aria-label='Phí vận chuyển'
          precision={0}
          value={shipping}
          onChange={value => edit(() => setShipping(value))}
        />
        {error("shipping")}
      </div>
      <div className='mt-3'>
        <div className='mb-1'>Số tiền đã thu</div>
        <InputNumber
          aria-label='Số tiền đã thu'
          precision={0}
          value={received}
          onChange={value => edit(() => setReceived(value))}
        />
        {error("received")}
      </div>
      {needsDelivery && (
        <div className='mt-3'>
          <label htmlFor='refund-legacy-delivered-at' className='mb-1 block'>
            Thời điểm giao hàng (kê khai)
          </label>
          <DatePicker
            id='refund-legacy-delivered-at'
            format='DD/MM/YYYY HH:mm'
            showTime
            needConfirm={false}
            placeholder='Chọn thời điểm giao hàng'
            value={deliveredAt ? dayjs(deliveredAt) : null}
            onChange={value => edit(() => setDeliveredAt(value?.format("YYYY-MM-DDTHH:mm") ?? ""))}
          />
          {error("deliveredAt")}
        </div>
      )}
      <Input
        className='mt-3'
        aria-label='Lý do đối soát'
        placeholder='Lý do đối soát (nội bộ)'
        value={reason}
        onChange={event => edit(() => setReason(event.target.value))}
      />
      {error("reason")}
      <Checkbox
        className='mt-3'
        checked={attested}
        onChange={event => edit(() => setAttested(event.target.checked))}
      >
        Tôi xác nhận đã đối soát chứng từ: đơn đã giao và khách đã thanh toán đủ số tiền trên
      </Checkbox>
      {error("attested")}
      {command.notices}
      <Flex gap={8} className='mt-4'>
        <Button
          type='primary'
          htmlType='submit'
          loading={command.busy}
          disabled={!command.canSubmit}
        >
          Xác nhận đối soát
        </Button>
        <Button onClick={onClose} disabled={command.busy}>
          Đóng
        </Button>
      </Flex>
    </form>
  );
}
