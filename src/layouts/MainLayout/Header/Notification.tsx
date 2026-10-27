import { useRef, useState } from "react";
import { Alert, Badge, Button, Empty, Flex, Popover, Spin, Tooltip, Typography } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getNotificationScope,
  markAllNotificationsReadAPI,
  markNotificationsReadAPI,
  type NotificationSummary,
  type NotificationView
} from "@/services/notifications";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useAppStore } from "@/store/useAppStore";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { notificationHref } from "@/pages/Notifications/notification-query";

const Notification = () => {
  const app = useAppStore();
  const store = useNotificationStore();
  const scope = getNotificationScope()?.key;
  const summary = app.profile && scope === store.scopeKey ? store.summary : null;
  return (
    <NotificationPanel
      key={`${scope}:${JSON.stringify(app.profile?.access)}`}
      scope={scope}
      summary={summary}
    />
  );
};

const NotificationPanel = ({
  scope,
  summary
}: {
  scope: string | undefined;
  summary: NotificationSummary | null;
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { error: syncError, isSyncing, refreshNotifications } = useNotificationStore();
  const mutate = async (item?: NotificationView) => {
    const access = useAppStore.getState().profile?.access;
    if (!scope || pending.current || !summary) return;
    if (getNotificationScope()?.key !== scope) {
      refreshNotifications();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    const current = () =>
      getNotificationScope()?.key === scope && useAppStore.getState().profile?.access === access;
    try {
      if (item) await markNotificationsReadAPI([item.id]);
      else await markAllNotificationsReadAPI(summary.head);
      if (!current()) return;
      refreshNotifications();
      if (item) {
        setOpen(false);
        navigate(notificationHref(item.target));
      }
    } catch (cause) {
      if (current()) setError(getErrorMessage(cause));
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  const run = (item?: NotificationView) => {
    mutate(item).catch(cause => setError(getErrorMessage(cause)));
  };

  return (
    <Popover
      open={open}
      onOpenChange={value => {
        setOpen(value);
        if (value) refreshNotifications();
      }}
      afterOpenChange={value => {
        if (value)
          panel.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus();
      }}
      trigger='click'
      placement='bottomRight'
      content={
        <Spin spinning={isSyncing} aria-label='Danh sách thông báo'>
          <Flex
            ref={panel}
            vertical
            gap={12}
            style={{ width: 360, minHeight: 120, maxHeight: "70vh", overflowY: "auto" }}
            onKeyDown={event => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
                bell.current?.focus();
              }
            }}
          >
            <Flex justify='space-between' align='center'>
              <Typography.Text strong>Thông báo</Typography.Text>
              <Tooltip title='Đánh dấu tất cả đã đọc'>
                <Button
                  type='text'
                  size='small'
                  aria-label='Đánh dấu tất cả đã đọc'
                  icon={<CheckOutlined />}
                  disabled={!summary || busy || !summary.unreadCount}
                  onClick={() => run()}
                />
              </Tooltip>
            </Flex>
            {(error || syncError) && (
              <Alert
                type='error'
                showIcon
                title={error || syncError}
                action={
                  <Button
                    onClick={() => {
                      setError(null);
                      refreshNotifications();
                    }}
                  >
                    Thử lại
                  </Button>
                }
              />
            )}
            {summary && !summary.items.length && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có thông báo' />
            )}
            {summary?.items.slice(0, 10).map(item => (
              <Button
                key={item.id}
                type='text'
                disabled={busy}
                onClick={() => run(item)}
                style={{
                  height: "auto",
                  whiteSpace: "normal",
                  textAlign: "left",
                  justifyContent: "start"
                }}
              >
                <Flex vertical align='start'>
                  <Typography.Text strong={!item.readAt}>{item.title}</Typography.Text>
                  <Typography.Text>{item.body}</Typography.Text>
                  <Typography.Text type='secondary'>
                    {Number.isFinite(Date.parse(item.occurredAt))
                      ? new Date(item.occurredAt).toLocaleString("vi-VN")
                      : "—"}
                  </Typography.Text>
                </Flex>
              </Button>
            ))}
            <Flex justify='space-between' gap={12}>
              <Link to={PATH.NOTIFICATIONS} onClick={() => setOpen(false)}>
                Xem tất cả thông báo
              </Link>
              <Link to={PATH.SETTINGS_NOTIFICATIONS} onClick={() => setOpen(false)}>
                Cài đặt thông báo
              </Link>
            </Flex>
          </Flex>
        </Spin>
      }
    >
      <Badge count={summary?.unreadCount ?? 0} size='small' offset={[-6, 6]} overflowCount={99}>
        <Button
          ref={bell}
          type='text'
          shape='circle'
          size='large'
          aria-label='Thông báo'
          aria-expanded={open}
          icon={<BellOutlined />}
          className='text-(--ant-color-text-secondary)'
        />
      </Badge>
    </Popover>
  );
};

export default Notification;
