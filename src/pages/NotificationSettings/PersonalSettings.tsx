import { Button, Empty, Flex, Select, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import {
  getNotificationPreferencesAPI,
  getNotificationScope,
  updateNotificationPreferencesAPI,
  type NotificationPreferencesView,
  type NotificationChannel
} from "@/services/notifications";
import { NOTIFICATION_EVENT_LABELS } from "@/pages/Notifications/notification-query";
import useNotificationSettings from "./useNotificationSettings";
import {
  desktopAvailability,
  requestDesktopPermission,
  readDesktopEnabled,
  setDesktopEnabled,
  showDesktopTestNotification,
  subscribeDesktopDeviceChanges
} from "@/utils/desktop-notifications";

function DesktopDevice({ scope }: { scope: string }) {
  const [device, setDevice] = useState({
    enabled: false,
    busy: true,
    error: "",
    availability: desktopAvailability()
  });
  const current = () => getNotificationScope()?.key === scope;
  useEffect(() => {
    let disposed = false;
    const sync = async () => {
      const identity = getNotificationScope();
      if (identity?.key !== scope) return;
      const availability = desktopAvailability();
      try {
        const enabled =
          availability === "unsupported" || availability === "insecure"
            ? false
            : await readDesktopEnabled(identity.deviceKey);
        if (!disposed && getNotificationScope()?.key === scope)
          setDevice({ enabled, availability, busy: false, error: "" });
      } catch {
        if (!disposed && getNotificationScope()?.key === scope)
          setDevice({
            enabled: false,
            availability,
            busy: false,
            error: "Không thể truy cập bộ nhớ thông báo. Thông báo trong ứng dụng vẫn hoạt động."
          });
      }
    };
    const refresh = () => {
      sync().catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribeDevice = subscribeDesktopDeviceChanges(key => {
      if (key === getNotificationScope()?.deviceKey) refresh();
    });
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
      unsubscribeDevice();
    };
  }, [scope]);
  const change = async () => {
    const identity = getNotificationScope();
    if (identity?.key !== scope || device.busy) return;
    try {
      // Keep the browser prompt inside the original user gesture, before any await.
      const permission = device.enabled
        ? Promise.resolve(desktopAvailability())
        : requestDesktopPermission();
      setDevice(previous => ({ ...previous, busy: true, error: "" }));
      const granted = await permission;
      if (!current()) return;
      if (!device.enabled && granted !== "granted") {
        setDevice(previous => ({ ...previous, busy: false, availability: desktopAvailability() }));
        return;
      }
      await setDesktopEnabled(identity.deviceKey, !device.enabled);
      if (current())
        setDevice({
          enabled: !device.enabled,
          busy: false,
          error: "",
          availability: desktopAvailability()
        });
    } catch {
      if (current())
        setDevice(previous => ({
          ...previous,
          busy: false,
          error:
            "Không thể bật/tắt thông báo máy tính. Kiểm tra quyền trình duyệt và bộ nhớ thiết bị."
        }));
    }
  };
  const test = async () => {
    const identity = getNotificationScope();
    if (identity?.key !== scope) return;
    try {
      const enabled = await readDesktopEnabled(identity.deviceKey);
      if (!current() || !enabled || desktopAvailability() !== "granted") return;
      showDesktopTestNotification();
      setDevice(previous => ({ ...previous, error: "" }));
    } catch {
      if (current())
        setDevice(previous => ({
          ...previous,
          error: "Không thể gửi thông báo thử. Kiểm tra cài đặt trình duyệt và hệ điều hành."
        }));
    }
  };
  const unavailable = ["unsupported", "insecure", "denied"].includes(device.availability);
  const description =
    device.availability === "unsupported"
      ? "Trình duyệt không hỗ trợ thông báo máy tính."
      : device.availability === "insecure"
        ? "Cần HTTPS để bật thông báo máy tính."
        : device.availability === "denied"
          ? "Trình duyệt đã chặn thông báo. Mở cài đặt trang để cho phép."
          : device.enabled
            ? "Đã bật thông báo máy tính trên thiết bị này."
            : "Chưa bật thông báo máy tính trên thiết bị này.";
  return (
    <Flex vertical gap={8}>
      <Typography.Text role='status'>{device.error || description}</Typography.Text>
      <Flex gap={8}>
        <Button
          disabled={device.busy || (!device.enabled && (unavailable || !!device.error))}
          onClick={change}
        >
          {device.enabled ? "Tắt thông báo trên máy tính" : "Bật thông báo trên máy tính"}
        </Button>
        {device.enabled && device.availability === "granted" && (
          <Button disabled={device.busy} onClick={test}>
            Gửi thông báo thử
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

const save = (draft: NotificationPreferencesView, saved: NotificationPreferencesView) =>
  updateNotificationPreferencesAPI({
    expectedRevision: saved.revision,
    expectedStoreRevision: saved.storeRevision,
    changes: draft.events.flatMap((event, index) =>
      (["inApp", "desktop"] as const)
        .filter(channel => event[channel].override !== saved.events[index][channel].override)
        .map(channel => ({ type: event.type, channel, enabled: event[channel].override }))
    )
  });

export default function PersonalSettings(props: { scope: string; access: string }) {
  const state = useNotificationSettings({ ...props, load: getNotificationPreferencesAPI, save });
  const draft = state.values?.draft;
  const column = (channel: NotificationChannel, title: string) => ({
    title,
    key: channel,
    render: (_: unknown, event: NotificationPreferencesView["events"][number]) => {
      const value = event[channel];
      const locked = !draft?.allowPersonalPreferences
        ? "Cửa hàng không cho phép tùy chỉnh"
        : value.policy === "required"
          ? "Cửa hàng bắt buộc bật"
          : value.policy === "disabled"
            ? "Cửa hàng đã tắt"
            : "Chính sách hiện tại không cho phép thay đổi";
      return (
        <Flex vertical gap={4}>
          <Select
            aria-label={`${NOTIFICATION_EVENT_LABELS[event.type]} — ${title}`}
            value={value.override === null ? "inherit" : String(value.override)}
            disabled={!value.editable || state.saving || state.blocked}
            options={[
              {
                value: "inherit",
                label: `Theo cửa hàng (${value.defaultEnabled ? "Bật" : "Tắt"})`
              },
              { value: "true", label: "Bật" },
              { value: "false", label: "Tắt" }
            ]}
            onChange={next => {
              if (draft)
                state.setDraft({
                  ...draft,
                  events: draft.events.map(item =>
                    item.type === event.type
                      ? {
                          ...item,
                          [channel]: {
                            ...value,
                            override: next === "inherit" ? null : next === "true"
                          }
                        }
                      : item
                  )
                });
            }}
          />
          <Typography.Text type='secondary'>
            Hiệu lực hiện tại: {value.enabled ? "Bật" : "Tắt"}
          </Typography.Text>
          <Typography.Text type='secondary'>
            Lựa chọn đã lưu:{" "}
            {state.values?.saved.events.find(item => item.type === event.type)?.[channel]
              .override === null
              ? "Theo cửa hàng"
              : state.values?.saved.events.find(item => item.type === event.type)?.[channel]
                    .override
                ? "Bật"
                : "Tắt"}
          </Typography.Text>
          {!value.editable && (
            <Typography.Text type='secondary'>
              {locked}. Lựa chọn cá nhân được giữ lại.
            </Typography.Text>
          )}
        </Flex>
      );
    }
  });
  return (
    <Flex vertical gap={16}>
      <Typography.Paragraph>
        Chọn riêng từng kênh. “Theo cửa hàng” khôi phục kế thừa mặc định. Trạng thái đã đọc luôn là
        của riêng bạn.
      </Typography.Paragraph>
      {state.feedback}
      {draft && (
        <>
          <Table
            rowKey='type'
            pagination={false}
            dataSource={draft.events}
            locale={{
              emptyText: <Empty description='Không có loại thông báo phù hợp với quyền hiện tại' />
            }}
            columns={[
              {
                title: "Sự kiện",
                dataIndex: "type",
                render: (type: keyof typeof NOTIFICATION_EVENT_LABELS) =>
                  NOTIFICATION_EVENT_LABELS[type]
              },
              column("inApp", "Trong ứng dụng"),
              column("desktop", "Máy tính")
            ]}
          />
          <Button
            type='primary'
            loading={state.saving}
            disabled={!state.dirty || state.saving || state.blocked}
            onClick={state.submit}
          >
            Lưu tùy chọn cá nhân
          </Button>
        </>
      )}
      <Typography.Paragraph type='secondary'>
        Thông báo máy tính cần được bật riêng trên thiết bị và được trình duyệt cho phép. CMS phải
        đang mở; chế độ ngủ hoặc đóng trang có thể ngừng thông báo.
      </Typography.Paragraph>
      <DesktopDevice scope={props.scope} />
    </Flex>
  );
}
