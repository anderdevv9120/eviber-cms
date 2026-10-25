import { useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  ConfigProvider,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Flex,
  Input,
  InputNumber,
  Radio,
  Select,
  Tag,
  Typography
} from "antd";
import dayjs from "dayjs";
import DataTable from "@/components/DataTable";
import {
  createAdminRefundAPI,
  reviewLegacyRefundAPI,
  type CreateAdminRefundInput,
  type RefundLegacyReviewInput,
  type RefundOrderAllocationView,
  type RefundReason,
  type RefundSelection
} from "@/services/refunds";
import { formatOrderAmount, refundReasonLabels } from "./order-display";
import { isWholeNumber, useRefundCommand, type RefundContext } from "./useRefundCommand";

const REASON_MAX = 500;
const EXPLANATION_MAX = 2000;

// vi-VN groups thousands with "."; the parser strips it so typed digits reach state unchanged.
// The cast is the documented antd recipe: parser must return the input's value type.
const moneyFormatter = (value: number | string | undefined) =>
  `${value ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const moneyParser = (value: string | undefined) => value?.replace(/\./g, "") as unknown as number;
const money = (value: number) => formatOrderAmount(value, "VND");
// Error state for inputs: red border plus a pointer to the message below the field.
const invalidProps = (shown: boolean, id: string) =>
  shown ? { status: "error" as const, "aria-invalid": true, "aria-describedby": id } : {};

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Typography.Text id={id} type='danger' className='mt-1 block'>
      {children}
    </Typography.Text>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className='mt-5 first:mt-0'>
      <Typography.Text strong className='mb-2 block'>
        {n}. {title}
      </Typography.Text>
      {children}
    </div>
  );
}

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
  const command = useRefundCommand(ctx, "ORDER_REFUND_REVIEW");
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
  const shown = (name: string) => attempted && !!errors[name];
  const error = (name: string) =>
    shown(name) ? <FieldError id={`exception-error-${name}`}>{errors[name]}</FieldError> : null;
  const invalid = (name: string) => invalidProps(shown(name), `exception-error-${name}`);

  return (
    <Card size='small' title='Tạo yêu cầu ngoại lệ' className='mt-4'>
      <ConfigProvider componentDisabled={!command.canEdit}>
        <form aria-label='Tạo yêu cầu ngoại lệ' onSubmit={submit} noValidate>
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
                <fieldset key={allocation.allocationId} className='my-4'>
                  <legend className='font-semibold'>{label}</legend>
                  {ctx.readable !== false && (
                    <Typography.Text type='secondary'>
                      Còn có thể hoàn: {allocation.availableQuantity}
                    </Typography.Text>
                  )}
                  <Flex gap={12} wrap align='center' className='mt-2'>
                    <InputNumber
                      aria-label={`Số lượng hoàn ${label}`}
                      precision={0}
                      min={0}
                      value={line.quantity}
                      onChange={value => editLine(allocation.allocationId, { quantity: value })}
                      {...invalid(`quantity:${allocation.allocationId}`)}
                    />
                    <Select<RefundReason>
                      className='w-60'
                      aria-label={`Lý do hoàn ${label}`}
                      value={line.reason}
                      options={Object.entries(refundReasonLabels).map(([value, text]) => ({
                        value: value as RefundReason,
                        label: text
                      }))}
                      onChange={value => editLine(allocation.allocationId, { reason: value })}
                    />
                    <Radio.Group
                      aria-label={`Hình thức hoàn ${label}`}
                      value={line.requestedReturn}
                      onChange={event =>
                        editLine(allocation.allocationId, { requestedReturn: event.target.value })
                      }
                    >
                      <Radio value='return'>Trả hàng</Radio>
                      <Radio value='no_return'>Không trả hàng</Radio>
                    </Radio.Group>
                  </Flex>
                  {error(`quantity:${allocation.allocationId}`)}
                  <Input.TextArea
                    className='mt-2'
                    aria-label={`Giải thích ${label}`}
                    placeholder='Giải thích'
                    rows={2}
                    value={line.explanation}
                    onChange={event =>
                      editLine(allocation.allocationId, { explanation: event.target.value })
                    }
                    {...invalid(`explanation:${allocation.allocationId}`)}
                  />
                  {error(`explanation:${allocation.allocationId}`)}
                </fieldset>
              );
            })}
          {error("items")}
          <div className='mt-4'>
            <label htmlFor='refund-exception-reason' className='mb-1 block'>
              Lý do ngoại lệ <Tag>Nội bộ</Tag>
            </label>
            <Input.TextArea
              id='refund-exception-reason'
              aria-label='Lý do ngoại lệ'
              rows={2}
              showCount
              value={exceptionReason}
              onChange={event => edit(() => setExceptionReason(event.target.value))}
              {...invalid("reason")}
            />
            {error("reason")}
          </div>
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
      </ConfigProvider>
    </Card>
  );
}

function LegacyReview({ ctx, labels, onClose }: Props) {
  const { view } = ctx;
  const command = useRefundCommand(ctx, "ORDER_REFUND_REVIEW");
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
  const shown = (name: string) => attempted && !!errors[name];
  const error = (name: string) =>
    shown(name) ? <FieldError id={`legacy-error-${name}`}>{errors[name]}</FieldError> : null;
  const invalid = (name: string) => invalidProps(shown(name), `legacy-error-${name}`);
  // Staff see the rule the server enforces while typing, not only after a failed submit.
  const expected = !errors.lines && isWholeNumber(shipping) ? lineTotal + shipping : null;

  return (
    <Card size='small' title='Đối soát đơn cũ' className='mt-4'>
      <ConfigProvider componentDisabled={!command.canEdit}>
        <form aria-label='Đối soát đơn cũ' onSubmit={submit} noValidate>
          <Typography.Paragraph type='secondary'>
            Tất cả các trường đều bắt buộc.
          </Typography.Paragraph>
          <Step n={1} title='Dòng hàng'>
            <div role='group' aria-label='Dòng hàng cần đối soát'>
              <DataTable<RefundOrderAllocationView>
                size='small'
                pagination={false}
                rowKey='allocationId'
                dataSource={view.allocations}
                columns={[
                  {
                    title: "Sản phẩm mua",
                    key: "product",
                    render: (_, row) => labels[row.allocationId]
                  },
                  {
                    title: "Đã mua",
                    dataIndex: "purchasedQuantity",
                    render: value => (ctx.readable !== false ? value : null),
                    key: "purchased",
                    align: "right"
                  },
                  {
                    title: "Thành tiền thực tế",
                    key: "net",
                    align: "right",
                    render: (_, row) =>
                      known(row.netAmount) ? (
                        <>
                          {ctx.readable !== false && (
                            <>
                              {money(row.netAmount)} <Tag className='m-0'>Đã xác định</Tag>
                            </>
                          )}
                        </>
                      ) : (
                        <InputNumber
                          className='w-44'
                          aria-label={`Số tiền thực tế ${labels[row.allocationId]}`}
                          precision={0}
                          min={0}
                          suffix='₫'
                          formatter={moneyFormatter}
                          parser={moneyParser}
                          value={amounts[row.allocationId]}
                          onChange={value =>
                            edit(() =>
                              setAmounts(current => ({ ...current, [row.allocationId]: value }))
                            )
                          }
                          {...invalid("lines")}
                        />
                      )
                  }
                ]}
              />
            </div>
            {error("lines")}
          </Step>
          <Step n={2} title='Thanh toán và giao hàng'>
            <Flex gap={24} wrap>
              <div>
                <label htmlFor='refund-legacy-shipping' className='mb-1 block'>
                  Phí vận chuyển
                </label>
                <InputNumber
                  id='refund-legacy-shipping'
                  className='w-56'
                  aria-label='Phí vận chuyển'
                  precision={0}
                  min={0}
                  suffix='₫'
                  formatter={moneyFormatter}
                  parser={moneyParser}
                  value={shipping}
                  onChange={value => edit(() => setShipping(value))}
                  {...invalid("shipping")}
                />
                {error("shipping")}
              </div>
              <div>
                <label htmlFor='refund-legacy-received' className='mb-1 block'>
                  Số tiền đã thu
                </label>
                <InputNumber
                  id='refund-legacy-received'
                  className='w-56'
                  aria-label='Số tiền đã thu'
                  precision={0}
                  min={0}
                  suffix='₫'
                  formatter={moneyFormatter}
                  parser={moneyParser}
                  value={received}
                  onChange={value => edit(() => setReceived(value))}
                  {...invalid("received")}
                />
                {error("received")}
              </div>
            </Flex>
            {ctx.readable !== false && expected !== null && (
              <Flex gap={8} wrap align='center' className='mt-2'>
                <Typography.Text type='secondary'>
                  Cần thu: {money(lineTotal)} (các dòng) + {money(shipping as number)} (vận chuyển)
                  = {money(expected)}
                </Typography.Text>
                {isWholeNumber(received) &&
                  (received === expected ? (
                    <Tag color='success'>Khớp</Tag>
                  ) : (
                    <Tag color='error'>Lệch {money(Math.abs(received - expected))}</Tag>
                  ))}
              </Flex>
            )}
            {needsDelivery && (
              <div className='mt-4'>
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
                  onChange={value =>
                    edit(() => setDeliveredAt(value?.format("YYYY-MM-DDTHH:mm") ?? ""))
                  }
                  status={shown("deliveredAt") ? "error" : undefined}
                />
                <Typography.Text type='secondary' className='mt-1 block'>
                  Đơn thiếu lịch sử giao hàng nên cần kê khai.
                </Typography.Text>
                {error("deliveredAt")}
              </div>
            )}
          </Step>
          <Step n={3} title='Lý do và xác nhận'>
            <label htmlFor='refund-legacy-reason' className='mb-1 block'>
              Lý do đối soát <Tag>Nội bộ</Tag>
            </label>
            <Input.TextArea
              id='refund-legacy-reason'
              aria-label='Lý do đối soát'
              rows={2}
              showCount
              value={reason}
              onChange={event => edit(() => setReason(event.target.value))}
              {...invalid("reason")}
            />
            {error("reason")}
            <Alert
              type='warning'
              showIcon
              className='my-3'
              title='Đối soát chỉ thực hiện một lần cho mỗi đơn cũ. Số liệu bạn kê khai trở thành sổ hoàn tiền và được ghi vào lịch sử kiểm toán.'
            />
            <Checkbox
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
          </Step>
        </form>
      </ConfigProvider>
    </Card>
  );
}
