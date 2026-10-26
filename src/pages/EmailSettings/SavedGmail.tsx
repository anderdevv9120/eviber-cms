import { Button, Descriptions, Flex, Typography } from "antd";
import type { EmailSettings } from "@/services/email-settings";

interface SavedGmailProps {
  settings: EmailSettings;
  disabled: boolean;
  onEdit: () => void;
}

export default function SavedGmail({ settings, disabled, onEdit }: SavedGmailProps) {
  return (
    <section aria-label='Tài khoản Gmail đang lưu' className='mb-6'>
      <Descriptions
        bordered
        size='small'
        column={1}
        styles={{ label: { width: 160 } }}
        items={[
          {
            key: "address",
            label: "Địa chỉ Gmail",
            children: <span className='font-mono'>{settings.address}</span>
          },
          {
            key: "appPassword",
            label: "App Password",
            children: (
              <span className='font-mono'>{`••••••••••••${settings.appPasswordLast4 ?? ""}`}</span>
            )
          }
        ]}
      />
      <Flex justify='space-between' align='center' gap={12} wrap className='mt-3'>
        <Typography.Text type='secondary'>
          {settings.updatedAt &&
            `Lưu ${new Date(settings.updatedAt).toLocaleString("vi-VN")}${
              settings.updatedBy ? ` bởi ${settings.updatedBy}` : ""
            }`}
        </Typography.Text>
        <Button disabled={disabled} onClick={onEdit}>
          Đổi tài khoản Gmail
        </Button>
      </Flex>
    </section>
  );
}
