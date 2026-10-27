import { useState, type FormEvent } from "react";
import {
  ConfigProvider,
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Flex,
  Input,
  InputNumber
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  claimRefundPayoutAPI,
  recordRefundPayoutAPI,
  releaseRefundPayoutAPI,
  type AdminRefundRequest,
  type RefundClaimView
} from "@/services/refunds";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderAmount, formatOrderDate } from "./order-display";
import { isWholeNumber, useRefundCommand, type RefundContext } from "./useRefundCommand";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

const REFERENCE_MAX = 100;
const REASON_MAX = 500;
const money = (value: number) => formatOrderAmount(value, "VND");
const notTransferredText = "Ghi nhận hoàn tiền không thực hiện chuyển khoản.";

type ClaimConflict = { onClaimConflict: () => void };

// The claim view names no claimant, so "another admin holds it" is learned only from the server's
// refusal. `claimId` is set when that claim is known; unset means whichever claim is seen next.
type Foreign = { claimId?: string };

export default function RefundPayoutForm({
  ctx,
  request,
  onDraftStarted
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  onDraftStarted?: () => void;
}) {
  const [foreign, setForeign] = useState<Foreign | null>(null);
  // Any command that commits means this admin holds, released or finished the claim.
  const own: RefundContext = {
    ...ctx,
    commit: async next => {
      setForeign(null);
      await ctx.commit(next);
    }
  };
  const { claim } = request;

  if (request.stage === "awaiting_payout")
    return <ClaimStep ctx={own} request={request} onClaimConflict={() => setForeign({})} />;
  if (request.stage === "payout_in_progress" && claim)
    return (
      <ClaimedStep
        ctx={own}
        request={request}
        claim={claim}
        heldByOther={foreign !== null && (!foreign.claimId || foreign.claimId === claim.claimId)}
        onClaimConflict={() => setForeign({ claimId: claim.claimId })}
        onDraftStarted={onDraftStarted}
      />
    );
  return null;
}

function ClaimStep({
  ctx,
  request,
  onClaimConflict
}: { ctx: RefundContext; request: AdminRefundRequest } & ClaimConflict) {
  const command = useRefundCommand(ctx, "ORDER_REFUND_PAY", { onClaimConflict });

  if (ctx.readable === false || !ctx.view.canPay) return null;
  return (
    <div className='mt-4'>
      <Alert
        type='info'
        showIcon
        className='mb-3'
        title='Nhận xử lý trước khi chuyển tiền. Sau khi nhận xử lý, số tiền được cố định và quản trị viên khác không thể ghi nhận hay giải phóng yêu cầu này.'
      />
      <p>{notTransferredText}</p>
      {command.notices}
      <Button
        type='primary'
        loading={command.busy}
        disabled={!command.canSubmit}
        onClick={() =>
          command.submit(input => claimRefundPayoutAPI(ctx.view.orderId, request.requestId, input))
        }
      >
        Nhận xử lý hoàn tiền
      </Button>
    </div>
  );
}

function ClaimedStep({
  ctx,
  request,
  claim,
  heldByOther,
  onClaimConflict,
  onDraftStarted
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  claim: RefundClaimView;
  heldByOther: boolean;
  onDraftStarted?: () => void;
} & ClaimConflict) {
  const [releasing, setReleasing] = useState(false);
  const [draftStarted, setDraftStarted] = useState(false);
  const readable = ctx.readable !== false && ctx.view.canPay;
  const profile = useAppStore(state => state.profile);
  const canPay =
    ctx.view.canPay && !!profile && canAccess(profile, { anyOf: ["ORDER_REFUND_PAY"] });
  const [check, setCheck] = useState<{ busy: boolean; error?: string }>({ busy: false });
  // A plain GET: if a lost response actually committed, this shows the completed payout.
  const checkStatus = async () => {
    setCheck({ busy: true });
    try {
      await ctx.reload();
      setCheck({ busy: false });
    } catch (cause) {
      setCheck({ busy: false, error: getErrorMessage(cause) });
    }
  };

  return (
    <div className='mt-4'>
      {readable && (
        <>
          <p>Nhận xử lý lúc {formatOrderDate(claim.claimedAt)}</p>
          <p>{notTransferredText}</p>
          <p>
            Chuyển khoản thủ công ngoài hệ thống, sau đó ghi nhận số tiền, thời điểm và mã tham
            chiếu của giao dịch.
          </p>
        </>
      )}
      {heldByOther ? (
        readable && (
          <>
            <Alert
              type='warning'
              showIcon
              className='mb-3'
              title='Yêu cầu đang được quản trị viên khác xử lý chi trả.'
            />
            <Flex gap={8}>
              <Button type='primary' disabled>
                Ghi nhận đã hoàn tiền
              </Button>
              <Button disabled>Hủy nhận xử lý</Button>
            </Flex>
          </>
        )
      ) : (
        <>
          <RecordStep
            ctx={ctx}
            request={request}
            claim={claim}
            onClaimConflict={onClaimConflict}
            draftStarted={draftStarted}
            onEdited={() => {
              setDraftStarted(true);
              onDraftStarted?.();
            }}
          />
          {releasing ? (
            <ReleaseStep
              ctx={ctx}
              request={request}
              claim={claim}
              onClaimConflict={onClaimConflict}
              onClose={() => setReleasing(false)}
            />
          ) : (
            readable && (
              <Button
                className='mt-3'
                disabled={!canPay}
                onClick={() => {
                  const current = useAppStore.getState().profile;
                  if (readable && current && canAccess(current, { anyOf: ["ORDER_REFUND_PAY"] })) {
                    setReleasing(true);
                    onDraftStarted?.();
                  }
                }}
              >
                Hủy nhận xử lý
              </Button>
            )
          )}
        </>
      )}
      {(readable || draftStarted || releasing) && (
        <Flex gap={8} align='center' className='mt-3'>
          <Button loading={check.busy} onClick={checkStatus}>
            Kiểm tra trạng thái
          </Button>
          {check.error && <span className='text-red-600'>{check.error}</span>}
        </Flex>
      )}
    </div>
  );
}

function RecordStep({
  ctx,
  request,
  claim,
  onClaimConflict,
  draftStarted,
  onEdited
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  claim: RefundClaimView;
  draftStarted: boolean;
  onEdited: () => void;
} & ClaimConflict) {
  const command = useRefundCommand(ctx, "ORDER_REFUND_PAY", { onClaimConflict });
  const [amount, setAmount] = useState<number | null>(claim.amount);
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  // Clock at the last submit attempt: errors show only after one, and render stays pure.
  const [checkedAt, setCheckedAt] = useState<number>();

  const edit = (patch: () => void) => {
    onEdited();
    patch();
    command.edited();
  };
  const validate = (now: number) => {
    const errors: Record<string, string> = {};
    if (!isWholeNumber(amount) || amount === 0) errors.amount = "Nhập số tiền đã hoàn";
    else if (amount !== claim.amount)
      errors.amount = `Số tiền phải đúng bằng ${money(claim.amount)}`;
    const paid = paidAt ? new Date(paidAt).getTime() : Number.NaN;
    if (Number.isNaN(paid)) errors.paidAt = "Nhập thời điểm đã chuyển tiền";
    else if (paid < new Date(claim.claimedAt).getTime())
      errors.paidAt = "Thời điểm chuyển tiền không được trước lúc nhận xử lý";
    else if (paid > now) errors.paidAt = "Thời điểm chuyển tiền không được ở tương lai";
    const trimmed = reference.trim();
    if (!trimmed) errors.reference = "Nhập mã tham chiếu giao dịch";
    else if (trimmed.length > REFERENCE_MAX)
      errors.reference = `Mã tham chiếu tối đa ${REFERENCE_MAX} ký tự`;
    return errors;
  };
  const errors = checkedAt === undefined ? {} : validate(checkedAt);
  const error = (name: string) =>
    errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  // The picker only offers the window [claim time, now]. Typed values bypass the panel, so
  // validate() still guards the same bounds at submit (e.g. a claim time with seconds).
  const claimedDate = dayjs(claim.claimedAt);
  const disableOutsideWindow = (current: Dayjs) =>
    current.isBefore(claimedDate, "day") || current.isAfter(dayjs(), "day");
  const disableTimeOutsideWindow = (current: Dayjs | null) => {
    if (!current) return {};
    const now = dayjs();
    const atClaimDay = current.isSame(claimedDate, "day");
    const atToday = current.isSame(now, "day");
    const minHour = atClaimDay ? claimedDate.hour() : 0;
    const maxHour = atToday ? now.hour() : 23;
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const minutes = Array.from({ length: 60 }, (_, minute) => minute);
    return {
      disabledHours: () => hours.filter(hour => hour < minHour || hour > maxHour),
      disabledMinutes: (hour: number) =>
        hour < minHour || hour > maxHour
          ? minutes
          : minutes.filter(
              minute =>
                (atClaimDay && hour === minHour && minute < claimedDate.minute()) ||
                (atToday && hour === maxHour && minute > now.minute())
            )
    };
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const now = Date.now();
    setCheckedAt(now);
    if (Object.keys(validate(now)).length) return;
    // The amount was validated equal to the frozen claim amount.
    return command.submit(input =>
      recordRefundPayoutAPI(ctx.view.orderId, request.requestId, {
        ...input,
        claimId: claim.claimId,
        amount: claim.amount,
        paidAt: new Date(paidAt).toISOString(),
        reference: reference.trim()
      })
    );
  };

  return (
    <ConfigProvider componentDisabled={!command.canEdit}>
      <form
        aria-label='Ghi nhận hoàn tiền đã chuyển'
        onSubmit={submit}
        noValidate
        className='mt-3'
        hidden={(ctx.readable === false || !ctx.view.canPay) && !draftStarted}
      >
        <div className='mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <div className='min-w-0'>
            <label htmlFor={`refund-paid-amount-${request.requestId}`} className='mb-1 block'>
              Số tiền đã hoàn
            </label>
            <InputNumber
              className='w-full'
              id={`refund-paid-amount-${request.requestId}`}
              aria-label='Số tiền đã hoàn'
              placeholder='Số tiền đã hoàn'
              precision={0}
              value={amount}
              onChange={value => edit(() => setAmount(value))}
            />
            {error("amount")}
          </div>
          <div className='min-w-0'>
            <label htmlFor={`refund-paid-at-${request.requestId}`} className='mb-1 block'>
              Thời điểm đã chuyển tiền
            </label>
            <DatePicker
              className='w-full'
              id={`refund-paid-at-${request.requestId}`}
              aria-label='Thời điểm đã chuyển tiền'
              format='DD/MM/YYYY HH:mm'
              showTime
              needConfirm={false}
              placeholder='Chọn thời điểm đã chuyển tiền'
              disabledDate={disableOutsideWindow}
              disabledTime={disableTimeOutsideWindow}
              value={paidAt ? dayjs(paidAt) : null}
              onChange={value => edit(() => setPaidAt(value?.format("YYYY-MM-DDTHH:mm") ?? ""))}
            />
            {error("paidAt")}
          </div>
          <div className='min-w-0'>
            <label htmlFor={`refund-paid-reference-${request.requestId}`} className='mb-1 block'>
              Mã tham chiếu giao dịch
            </label>
            <Input
              id={`refund-paid-reference-${request.requestId}`}
              aria-label='Mã tham chiếu giao dịch'
              placeholder='Mã tham chiếu giao dịch ngân hàng'
              value={reference}
              onChange={event => edit(() => setReference(event.target.value))}
            />
            {error("reference")}
          </div>
        </div>
        {command.notices}
        <Button
          type='primary'
          htmlType='submit'
          className='mt-3'
          loading={command.busy}
          disabled={!command.canSubmit}
        >
          Ghi nhận đã hoàn tiền
        </Button>
      </form>
    </ConfigProvider>
  );
}

function ReleaseStep({
  ctx,
  request,
  claim,
  onClaimConflict,
  onClose
}: {
  ctx: RefundContext;
  request: AdminRefundRequest;
  claim: RefundClaimView;
  onClose: () => void;
} & ClaimConflict) {
  const command = useRefundCommand(ctx, "ORDER_REFUND_PAY", { onClaimConflict });
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const trimmed = reason.trim();
  const errors: Record<string, string> = {};
  if (!confirmed) errors.confirmed = "Cần xác nhận chưa có khoản chuyển khoản nào";
  if (!trimmed) errors.reason = "Cần nhập lý do giải phóng";
  else if (trimmed.length > REASON_MAX) errors.reason = `Lý do tối đa ${REASON_MAX} ký tự`;
  const error = (name: string) =>
    attempted && errors[name] ? <div className='mt-1 text-red-600'>{errors[name]}</div> : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    return command.submit(input =>
      releaseRefundPayoutAPI(ctx.view.orderId, request.requestId, {
        ...input,
        claimId: claim.claimId,
        bankOutcome: "not_transferred",
        reason: trimmed
      })
    );
  };

  return (
    <ConfigProvider componentDisabled={!command.canEdit}>
      <form aria-label='Giải phóng nhận xử lý' onSubmit={submit} noValidate className='mt-3'>
        <Alert
          type='warning'
          showIcon
          className='mb-3'
          title='Chỉ giải phóng khi đã đối chiếu ngân hàng và xác nhận chưa có khoản chuyển nào được thực hiện. Nếu chưa chắc chắn, hãy giữ nhận xử lý và dùng "Kiểm tra trạng thái". Hệ thống không tự giải phóng theo thời gian.'
        />
        <Checkbox
          checked={confirmed}
          onChange={event => {
            setConfirmed(event.target.checked);
            command.edited();
          }}
        >
          Tôi đã đối chiếu ngân hàng và xác nhận chưa chuyển khoản
        </Checkbox>
        {error("confirmed")}
        <Input.TextArea
          aria-label='Lý do giải phóng'
          placeholder='Lý do giải phóng (nội bộ)'
          rows={2}
          className='mt-2'
          value={reason}
          onChange={event => {
            setReason(event.target.value);
            command.edited();
          }}
        />
        {error("reason")}
        {command.notices}
        <Flex gap={8} className='mt-3'>
          <Button htmlType='submit' loading={command.busy} disabled={!command.canSubmit}>
            Xác nhận giải phóng
          </Button>
          <Button onClick={onClose} disabled={command.busy}>
            Đóng
          </Button>
        </Flex>
      </form>
    </ConfigProvider>
  );
}
