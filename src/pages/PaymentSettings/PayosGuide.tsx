import type { ReactNode } from "react";
import { Card, Typography } from "antd";

interface PayosGuideProps {
  /** null = máy chủ chưa khai địa chỉ công khai (env PUBLIC_API_URL) */
  webhookUrl: string | null;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Typography.Link href={href} target='_blank' rel='noopener noreferrer'>
      {children}
    </Typography.Link>
  );
}

export default function PayosGuide({ webhookUrl }: PayosGuideProps) {
  return (
    <Card title='Hướng dẫn lấy key payOS'>
      <ol className='m-0 flex list-decimal flex-col gap-2 pl-5'>
        <li>
          Tạo tài khoản tại <ExternalLink href='https://my.payos.vn'>my.payos.vn</ExternalLink> (
          <ExternalLink href='https://payos.vn/docs/huong-dan-su-dung/tao-tai-khoan-payos'>
            hướng dẫn
          </ExternalLink>
          ).
        </li>
        <li>
          <ExternalLink href='https://payos.vn/docs/huong-dan-su-dung/xac-thuc-to-chuc'>
            Xác thực tổ chức
          </ExternalLink>{" "}
          và{" "}
          <ExternalLink href='https://payos.vn/docs/huong-dan-su-dung/ket-noi-tai-khoan-ngan-hang'>
            liên kết tài khoản ngân hàng
          </ExternalLink>{" "}
          nhận tiền.
        </li>
        <li>
          Trên my.payos.vn, tạo <strong>kênh thanh toán</strong>. Trang chi tiết kênh hiện Client
          ID, API Key và Checksum Key — dán vào form trên, bấm <strong>Kiểm tra kết nối</strong> rồi{" "}
          <strong>Lưu cấu hình</strong>. Cả hai bước đều tạo rồi hủy ngay một mã QR thử 10.000đ trên
          kênh (nội dung KTKETNOI) — không phát sinh tiền; hủy lỗi thì mã tự hết hạn sau 5 phút.
        </li>
        <li>
          Sau khi lưu, mở lại kênh vừa tạo trên my.payos.vn, mục <strong>Webhook URL</strong>, dán
          địa chỉ sau rồi lưu:{" "}
          {webhookUrl ? (
            <Typography.Text code copyable={{ text: webhookUrl }}>
              {webhookUrl}
            </Typography.Text>
          ) : (
            <Typography.Text type='warning'>
              máy chủ chưa khai địa chỉ công khai — nhờ người triển khai đặt{" "}
              <Typography.Text code>PUBLIC_API_URL</Typography.Text> cho máy chủ rồi tải lại trang
              này để lấy địa chỉ.
            </Typography.Text>
          )}{" "}
          Khi bạn lưu, payOS gọi thử địa chỉ này ngay và chỉ chấp nhận nếu key ở bước 3 đã được lưu
          ở đây trước. Tiền về sẽ tự chuyển đơn sang Đã thanh toán; chưa khai thì bạn phải đổi trạng
          thái tay cho từng đơn (
          <ExternalLink href='https://payos.vn/docs/du-lieu-tra-ve/webhook'>
            tài liệu webhook
          </ExternalLink>
          ).
        </li>
      </ol>
      <Typography.Paragraph type='secondary' className='mt-4 mb-0!'>
        payOS không có môi trường thử riêng: muốn thử mà không đụng tiền thật của shop, tạo thêm một
        kênh chỉ dùng để thử và chuyển vài nghìn đồng.
      </Typography.Paragraph>
    </Card>
  );
}
