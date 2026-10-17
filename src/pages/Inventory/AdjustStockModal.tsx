import { useRef, useState } from "react";
import { Alert, Button, Flex, Input, InputNumber, Modal, Segmented, Typography } from "antd";
import { adjustStockAPI, type AdjustStockResult, type InventoryRow } from "@/services/inventory";
import { errorNotification, successNotification } from "@/utils/notification";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { ApiError } from "@/utils/request";
import {
  MAX_DELTA,
  MAX_NOTE,
  previewAfter,
  toAdjustRequest,
  type AdjustMode
} from "./adjust-stock";
import { INVENTORY_ERROR } from "./inventory-errors";

interface Props {
  row: InventoryRow;
  open: boolean;
  onClose: () => void;
  /** Fires once per successful adjustment, before `onClose`. */
  onAdjusted: (result: AdjustStockResult) => void;
  /** The variant no longer exists; the caller closes and refetches. */
  onGone: () => void;
  /** The request got no HTTP response, so the adjustment may have committed; the caller refetches the list. */
  onUnknownResult: () => void;
}

const modes = [
  { value: "in", label: "Nhập thêm (+)" },
  { value: "out", label: "Xuất bớt (−)" },
  { value: "count", label: "Kiểm kê (= N)" }
] satisfies { value: AdjustMode; label: string }[];
const amountLabels: Record<AdjustMode, string> = {
  in: "Số lượng nhập thêm",
  out: "Số lượng xuất bớt",
  count: "Tồn kho thực tế (N)"
};

export default function AdjustStockModal({
  row,
  open,
  onClose,
  onAdjusted,
  onGone,
  onUnknownResult
}: Props) {
  const [mode, setMode] = useState<AdjustMode>("in");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  // Starts from the list row and follows the server's value after a 400/409.
  const [current, setCurrent] = useState(row.inventoryCount);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ type: "warning" | "error"; text: string } | null>(null);
  // State updates are async, so only a ref stops a second click in the same tick.
  const inFlight = useRef(false);

  const request = toAdjustRequest(mode, amount, current, note);
  const after = previewAfter(mode, amount, current);

  const submit = async () => {
    if (!request || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setNotice(null);
    try {
      const { data } = await adjustStockAPI(row.variantId, request);
      successNotification(`Đã điều chỉnh tồn kho ${row.sku}`);
      onAdjusted(data);
      onClose();
    } catch (cause) {
      const details = cause instanceof ApiError ? cause.errors : undefined;
      const latest =
        typeof details?.currentInventoryCount === "number" ? details.currentInventoryCount : null;
      if (
        details?.code === INVENTORY_ERROR.VARIANT_NOT_FOUND ||
        (cause instanceof ApiError && cause.status === 404)
      ) {
        errorNotification(getErrorMessage(cause));
        onGone();
      } else if (details?.code === INVENTORY_ERROR.STOCK_CHANGED && latest !== null) {
        setCurrent(latest);
        setNotice({ type: "warning", text: `Tồn kho vừa đổi thành ${latest}` });
      } else if (details?.code === INVENTORY_ERROR.INSUFFICIENT_STOCK && latest !== null) {
        setCurrent(latest);
        setNotice({ type: "error", text: `Không đủ tồn kho: hiện còn ${latest}` });
      } else if (cause instanceof ApiError && cause.status === undefined) {
        // Network error or timeout (toApiError): the server transaction may have committed, and a
        // retry of in/out has no expectedCurrent guard, so tell staff to check the history first.
        setNotice({
          type: "error",
          text: "Không rõ kết quả — kiểm tra Lịch sử trước khi thử lại"
        });
        onUnknownResult();
      } else {
        setNotice({ type: "error", text: getErrorMessage(cause) });
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title='Điều chỉnh tồn kho'
      onCancel={() => {
        if (!pending) onClose();
      }}
      footer={[
        <Button key='cancel' onClick={onClose} disabled={pending}>
          Hủy
        </Button>,
        <Button key='save' type='primary' loading={pending} disabled={!request} onClick={submit}>
          Lưu điều chỉnh
        </Button>
      ]}
    >
      <Flex vertical gap={12}>
        <div>
          <Typography.Text strong>{row.productName}</Typography.Text>
          <br />
          <Typography.Text type='secondary'>
            {[row.sku, ...row.attributeLabels].join(" · ")}
          </Typography.Text>
        </div>
        <Segmented
          block
          options={modes}
          value={mode}
          onChange={value => {
            setMode(value);
            setAmount(null);
          }}
        />
        <Flex gap={16} align='center' wrap>
          <InputNumber
            aria-label={amountLabels[mode]}
            addonBefore={amountLabels[mode]}
            min={mode === "count" ? 0 : 1}
            max={mode === "count" ? undefined : MAX_DELTA}
            precision={0}
            value={amount}
            onChange={value => setAmount(value)}
          />
          <Typography.Text>
            Tồn kho hiện tại: <strong>{current}</strong>
          </Typography.Text>
        </Flex>
        <Typography.Text type={after !== null && after < 0 ? "danger" : undefined}>
          {`${current} → ${after ?? "—"}`}
        </Typography.Text>
        <Input.TextArea
          aria-label='Ghi chú'
          placeholder='Lý do điều chỉnh (không bắt buộc)'
          maxLength={MAX_NOTE}
          autoSize={{ minRows: 2, maxRows: 5 }}
          value={note}
          onChange={event => setNote(event.target.value)}
        />
        {notice && <Alert type={notice.type} showIcon title={notice.text} />}
      </Flex>
    </Modal>
  );
}
