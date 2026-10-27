import type { ReactNode } from "react";
import { Card, Typography } from "antd";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Typography.Link href={href} target='_blank' rel='noopener noreferrer'>
      {children}
    </Typography.Link>
  );
}

export default function GmailGuide() {
  return (
    <Card title='Hướng dẫn lấy App Password Gmail'>
      <ol className='m-0 flex list-decimal flex-col gap-2 pl-5'>
        <li>
          Đăng nhập tài khoản Gmail dùng để gửi mail, bật{" "}
          <ExternalLink href='https://myaccount.google.com/signinoptions/twosv'>
            Xác minh 2 bước
          </ExternalLink>{" "}
          (
          <ExternalLink href='https://support.google.com/accounts/answer/185839?hl=vi'>
            hướng dẫn
          </ExternalLink>
          ).
        </li>
        <li>
          Mở trang{" "}
          <ExternalLink href='https://myaccount.google.com/apppasswords'>
            Mật khẩu ứng dụng
          </ExternalLink>{" "}
          (
          <ExternalLink href='https://support.google.com/accounts/answer/185833?hl=vi'>
            hướng dẫn
          </ExternalLink>
          ), đặt tên (ví dụ "Cửa hàng") rồi bấm Tạo. Google hiện 16 ký tự và chỉ hiện một lần — chép
          lại ngay.
        </li>
        <li>
          Dán địa chỉ Gmail và App Password vào form trên rồi bấm <strong>Lưu cấu hình</strong>. Hệ
          thống đăng nhập thử Gmail (không gửi mail nào), Gmail chấp nhận mới lưu.
        </li>
        <li>
          Bấm <strong>Gửi mail thử</strong> để xem mail khách nhận được, nhớ kiểm tra cả thư mục
          Spam.
        </li>
      </ol>
      <Typography.Paragraph type='secondary' className='mt-4 mb-0!'>
        Gmail miễn phí gửi được khoảng 500 mail/ngày (khoảng 200 đơn). Cần nhiều hơn thì dùng Google
        Workspace (2.000 mail/ngày), form vẫn như cũ. Đổi mật khẩu đăng nhập Gmail sẽ làm App
        Password cũ hết hiệu lực — khi đó tạo App Password mới và nhập lại ở đây.
      </Typography.Paragraph>
    </Card>
  );
}
