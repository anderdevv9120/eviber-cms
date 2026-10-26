import { Form, theme, Typography } from "antd";

/**
 * Dòng hộp thư giả lập: admin thấy tên người gửi hiện ra sao trước khi lưu, không cần gửi thử. Đặt trong <Form>:
 * đọc senderName qua context để chỉ dòng này render lại khi admin gõ.
 */
export default function InboxPreview() {
  const { token } = theme.useToken();
  const senderName = Form.useWatch<string | undefined>("senderName") ?? "";
  const rowClass =
    "grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-2.5";

  return (
    <section aria-label='Khách thấy trong hộp thư' className='mb-5'>
      <Typography.Text type='secondary' className='mb-1.5 block'>
        Khách thấy trong hộp thư:
      </Typography.Text>
      <div
        className='overflow-hidden rounded-lg border'
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <div className={rowClass} style={{ background: token.colorBgContainer }}>
          <Typography.Text strong ellipsis>
            {senderName.trim() || "Tên người gửi"}
          </Typography.Text>
          <Typography.Text ellipsis>
            <strong>Đơn hàng ORD-K7WQ3FZ8 đã được ghi nhận</strong>
            <Typography.Text type='secondary'> · Cảm ơn bạn đã đặt hàng…</Typography.Text>
          </Typography.Text>
          <Typography.Text type='secondary'>10:24</Typography.Text>
        </div>
        <div
          className={rowClass}
          style={{
            background: token.colorFillQuaternary,
            borderTop: `1px solid ${token.colorBorderSecondary}`
          }}
        >
          <Typography.Text type='secondary'>Ngân hàng ABC</Typography.Text>
          <Typography.Text type='secondary' ellipsis>
            Thông báo biến động số dư
          </Typography.Text>
          <Typography.Text type='secondary'>09:02</Typography.Text>
        </div>
      </div>
    </section>
  );
}
