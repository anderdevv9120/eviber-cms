import { useRef, useState } from "react";
import { Alert, Button, Checkbox } from "antd";
import type { ApiResponse } from "@/services/auth";
import type { AdminRefundOrderView, RefundCommand } from "@/services/refunds";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";

export interface RefundContext {
  view: AdminRefundOrderView;
  /** Re-reads the refund view (and the order); rejects when the newest state cannot be read. */
  reload: () => Promise<void>;
  /** Adopts the committed view and refreshes the order actions. Never rejects. */
  commit: (view: AdminRefundOrderView) => Promise<void>;
}

interface Notice {
  type: "conflict" | "uncertain" | "error";
  text: string;
}

const conflictText =
  "Đơn hàng hoặc yêu cầu đã được thay đổi bởi thao tác khác. Dữ liệu mới nhất đã được tải, vui lòng xem lại trước khi xác nhận lại.";
const uncertainText =
  "Chưa xác định được kết quả thao tác trước. Dữ liệu hiện tại đã được tải lại; hãy kiểm tra trước khi gửi lại. Gửi lại dùng cùng mã lệnh nên không bị ghi nhận hai lần.";

// One command = one idempotency key. The key only changes when the staff member edits the command,
// never because a network call failed, so a lost response can be replayed safely.
export function useRefundCommand(ctx: RefundContext) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [needsAck, setNeedsAck] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reloadError, setReloadError] = useState<string>();
  const inFlight = useRef(false);

  const refresh = () =>
    ctx.reload().then(
      () => setReloadError(undefined),
      cause => setReloadError(getErrorMessage(cause))
    );

  const submit = async (
    call: (command: RefundCommand) => Promise<ApiResponse<AdminRefundOrderView>>
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(undefined);
    let committed: AdminRefundOrderView;
    try {
      const { data } = await call({
        expectedRevision: ctx.view.revision,
        idempotencyKey: key
      });
      if (!data?.orderId || !Array.isArray(data.requests))
        throw new ApiError("Phản hồi không hợp lệ");
      committed = data;
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : undefined;
      if (status && status < 500 && status !== 409) {
        setNotice({ type: "error", text: getErrorMessage(cause) });
      } else {
        const conflict = status === 409;
        setNotice({
          type: conflict ? "conflict" : "uncertain",
          text: conflict ? conflictText : uncertainText
        });
        setNeedsAck(conflict);
        setAcknowledged(false);
        await refresh();
      }
      inFlight.current = false;
      setBusy(false);
      return;
    }
    await ctx.commit(committed);
    inFlight.current = false;
    setBusy(false);
  };

  const notices = (
    <>
      {notice && (
        <Alert
          type={notice.type === "error" ? "error" : "warning"}
          showIcon
          className='mt-3'
          title={notice.text}
        />
      )}
      {reloadError && (
        <Alert
          type='error'
          showIcon
          className='mt-3'
          title={`Không tải được dữ liệu mới nhất: ${reloadError}`}
          action={<Button onClick={refresh}>Tải lại dữ liệu</Button>}
        />
      )}
      {needsAck && (
        <Checkbox
          className='mt-3'
          checked={acknowledged}
          disabled={busy}
          onChange={event => setAcknowledged(event.target.checked)}
        >
          Tôi đã xem lại dữ liệu mới nhất
        </Checkbox>
      )}
    </>
  );

  return {
    busy,
    notices,
    canSubmit: !busy && !reloadError && (!needsAck || acknowledged),
    edited: () => setKey(crypto.randomUUID()),
    submit
  };
}

export const isWholeNumber = (value: number | null): value is number =>
  value !== null && Number.isSafeInteger(value) && value >= 0;
