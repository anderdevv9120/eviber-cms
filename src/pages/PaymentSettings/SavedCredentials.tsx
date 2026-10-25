import { Button, Descriptions, Flex, Typography } from "antd";
import type { PaymentSettings } from "@/services/payment-settings";

interface SavedCredentialsProps {
  settings: PaymentSettings;
  disabled: boolean;
  onEdit: () => void;
}

const masked = (last4: string | null) => `••••••••••••${last4 ?? ""}`;

export default function SavedCredentials({ settings, disabled, onEdit }: SavedCredentialsProps) {
  return (
    <section aria-label='Bộ key payOS đang lưu' className='mb-6'>
      <Descriptions
        bordered
        size='small'
        column={1}
        styles={{ label: { width: 160 } }}
        items={[
          {
            key: "clientId",
            label: "Client ID",
            children: <span className='font-mono'>{settings.clientId}</span>
          },
          {
            key: "apiKey",
            label: "API Key",
            children: <span className='font-mono'>{masked(settings.apiKeyLast4)}</span>
          },
          {
            key: "checksumKey",
            label: "Checksum Key",
            children: <span className='font-mono'>{masked(settings.checksumKeyLast4)}</span>
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
          Đổi bộ key
        </Button>
      </Flex>
    </section>
  );
}
