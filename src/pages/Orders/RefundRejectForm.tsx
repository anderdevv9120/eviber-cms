import { useState, type FormEvent } from "react";
import { Button, ConfigProvider, Flex, Input, Select } from "antd";
import { decideRefundAPI, type AdminRefundRequest } from "@/services/refunds";
import { useRefundCommand, type RefundContext } from "./useRefundCommand";

const REASON_MAX = 500;
const reasons = [
  "Minh chứng chưa đủ để xác nhận vấn đề",
  "Sản phẩm không có lỗi như mô tả",
  "Sản phẩm gửi trả không đúng với đơn hàng",
  "Sản phẩm không đáp ứng điều kiện hoàn tiền"
];

export default function RefundRejectForm({
  ctx,
  request,
  onClose
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  onClose: () => void;
}) {
  const command = useRefundCommand(ctx, "ORDER_REFUND_REVIEW");
  const [selected, setSelected] = useState<string>();
  const [customReason, setCustomReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reason = selected === "other" ? customReason.trim() : (selected ?? "");
  const error = !selected
    ? "Chọn lý do từ chối gửi khách"
    : !reason
      ? "Nhập lý do từ chối gửi khách"
      : reason.length > REASON_MAX
        ? `Lý do tối đa ${REASON_MAX} ký tự`
        : undefined;
  const id = `refund-reject-${request.requestId}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (error) return;
    return command.submit(input =>
      decideRefundAPI(ctx.view.orderId, request.requestId, {
        ...input,
        items: request.items.map(item => ({
          allocationId: item.allocationId,
          approvedQuantity: 0,
          returnRequired: false,
          reason
        })),
        shippingAmount: 0,
        customerMessage: reason
      })
    );
  };

  return (
    <ConfigProvider componentDisabled={!command.canEdit}>
      <form aria-label='Từ chối yêu cầu hoàn tiền' onSubmit={submit} noValidate className='mt-4'>
        <p className='mb-3'>Toàn bộ yêu cầu sẽ bị từ chối. Lý do này sẽ được gửi cho khách hàng.</p>
        <label htmlFor={id} className='mb-1 block'>
          Lý do từ chối gửi khách *
        </label>
        <Select
          id={id}
          className='w-full'
          aria-label='Lý do từ chối gửi khách'
          aria-required
          aria-describedby={attempted && error ? `${id}-error` : undefined}
          placeholder='Chọn lý do từ chối'
          value={selected}
          options={[
            ...reasons.map(value => ({ value, label: value })),
            { value: "other", label: "Lý do khác" }
          ]}
          status={attempted && error ? "error" : undefined}
          onChange={value => {
            setSelected(value);
            command.edited();
          }}
        />
        {selected === "other" && (
          <label className='mt-3 block'>
            Lý do từ chối khác *
            <Input.TextArea
              aria-label='Lý do từ chối khác'
              required
              rows={3}
              maxLength={REASON_MAX}
              showCount
              value={customReason}
              onChange={event => {
                setCustomReason(event.target.value);
                command.edited();
              }}
            />
          </label>
        )}
        {attempted && error && (
          <div id={`${id}-error`} role='alert' className='mt-1 text-red-600'>
            {error}
          </div>
        )}
        {command.notices}
        <Flex gap={8} className='mt-4'>
          <Button
            danger
            type='primary'
            htmlType='submit'
            loading={command.busy}
            disabled={!command.canSubmit}
          >
            Xác nhận từ chối
          </Button>
          <Button onClick={onClose} disabled={command.busy}>
            Đóng
          </Button>
        </Flex>
      </form>
    </ConfigProvider>
  );
}
