import { Button, Flex, Form, InputNumber, Select, Switch, Table, Typography } from "antd";
import {
  getNotificationSettingsAPI,
  updateNotificationSettingsAPI,
  type StoreNotificationSettings,
  type NotificationChannel,
  type NotificationEventType
} from "@/services/notifications";
import { NOTIFICATION_EVENT_LABELS } from "@/pages/Notifications/notification-query";
import useNotificationSettings from "./useNotificationSettings";

const save = (draft: StoreNotificationSettings, saved: StoreNotificationSettings) =>
  updateNotificationSettingsAPI({
    expectedRevision: saved.revision,
    allowPersonalPreferences: draft.allowPersonalPreferences,
    lowStockThreshold: draft.lowStockThreshold,
    events: (Object.keys(NOTIFICATION_EVENT_LABELS) as NotificationEventType[]).map(type => ({
      type,
      ...draft.events[type]
    }))
  });

export default function StoreSettings(props: {
  scope: string;
  access: string;
  canUpdate: boolean;
}) {
  const state = useNotificationSettings({ ...props, load: getNotificationSettingsAPI, save });
  const draft = state.values?.draft;
  const disabled = !props.canUpdate || state.saving || state.blocked;
  const column = (channel: NotificationChannel, title: string) => ({
    title,
    key: channel,
    render: (_: unknown, type: NotificationEventType) => {
      if (!draft) return null;
      const value = draft.events[type][channel];
      const update = (patch: Partial<typeof value>) =>
        state.setDraft({
          ...draft,
          events: {
            ...draft.events,
            [type]: { ...draft.events[type], [channel]: { ...value, ...patch } }
          }
        });
      return (
        <Flex vertical gap={8}>
          <Select
            aria-label={`${NOTIFICATION_EVENT_LABELS[type]} — ${title} — Chính sách`}
            value={value.policy}
            disabled={disabled}
            options={[
              { value: "disabled", label: "Tắt" },
              { value: "optional", label: "Tùy chọn" },
              { value: "required", label: "Bắt buộc" }
            ]}
            onChange={policy => update({ policy })}
          />
          <Flex gap={8} align='center'>
            <Switch
              aria-label={`${NOTIFICATION_EVENT_LABELS[type]} — ${title} — Mặc định`}
              checked={value.defaultEnabled}
              disabled={disabled || value.policy !== "optional"}
              onChange={defaultEnabled => update({ defaultEnabled })}
            />
            Mặc định {value.defaultEnabled ? "bật" : "tắt"}
          </Flex>
        </Flex>
      );
    }
  });
  return (
    <Flex vertical gap={16}>
      <Typography.Paragraph>
        Chính sách áp dụng khi thông báo được phân phối, không thay đổi lịch sử. Ngưỡng tồn kho chỉ
        áp dụng cho lần giảm tồn tiếp theo.
      </Typography.Paragraph>
      {!props.canUpdate && (
        <Typography.Text type='secondary'>
          Bạn chỉ có quyền xem chính sách cửa hàng.
        </Typography.Text>
      )}
      {state.feedback}
      {draft && (
        <Form
          key={state.values?.saved.revision}
          layout='vertical'
          disabled={disabled}
          initialValues={draft}
          onFinish={state.submit}
        >
          <Form.Item label='Cho phép tùy chọn cá nhân'>
            <Switch
              aria-label='Cho phép tùy chọn cá nhân'
              checked={draft.allowPersonalPreferences}
              onChange={allowPersonalPreferences =>
                state.setDraft({ ...draft, allowPersonalPreferences })
              }
            />
          </Form.Item>
          <Form.Item
            name='lowStockThreshold'
            label='Ngưỡng sắp hết hàng'
            rules={[
              {
                required: true,
                type: "integer",
                min: 1,
                max: 1000,
                message: "Nhập số nguyên từ 1 đến 1000"
              }
            ]}
          >
            <InputNumber
              aria-label='Ngưỡng sắp hết hàng'
              onChange={value => state.setDraft({ ...draft, lowStockThreshold: value as number })}
            />
          </Form.Item>
          <Table
            rowKey={type => type}
            pagination={false}
            dataSource={Object.keys(NOTIFICATION_EVENT_LABELS) as NotificationEventType[]}
            columns={[
              {
                title: "Sự kiện",
                key: "event",
                render: (_: unknown, type: NotificationEventType) => NOTIFICATION_EVENT_LABELS[type]
              },
              column("inApp", "Trong ứng dụng"),
              column("desktop", "Máy tính")
            ]}
          />
          <Button
            className='mt-4'
            type='primary'
            htmlType='submit'
            loading={state.saving}
            disabled={disabled || !state.dirty}
          >
            Lưu chính sách cửa hàng
          </Button>
        </Form>
      )}
    </Flex>
  );
}
