import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Empty, Flex, Pagination, Select, Table, Typography } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getNotificationScope,
  listNotificationsAPI,
  markAllNotificationsReadAPI,
  markNotificationsReadAPI,
  type NotificationEventType,
  type NotificationList,
  type NotificationListQuery,
  type NotificationView
} from "@/services/notifications";
import { useAppStore } from "@/store/useAppStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { getErrorMessage } from "@/utils/getErrorMessage";
import {
  NOTIFICATION_EVENT_LABELS,
  notificationHref,
  parseNotificationQuery,
  serializeNotificationQuery
} from "./notification-query";

export default function Notifications() {
  const app = useAppStore();
  const [params, setParams] = useSearchParams();
  const scope = getNotificationScope()?.key;
  const query = parseNotificationQuery(params);
  const search = serializeNotificationQuery(query).toString();
  if (!scope || !app.profile) return null;
  return (
    <History
      key={`${scope}:${JSON.stringify(app.profile.access)}:${search}`}
      scope={scope}
      query={query}
      search={search}
      change={next => setParams(serializeNotificationQuery({ ...query, page: 1, ...next }))}
    />
  );
}

function History({
  scope,
  query,
  search,
  change
}: {
  scope: string;
  query: NotificationListQuery;
  search: string;
  change: (query: NotificationListQuery) => void;
}) {
  const store = useNotificationStore();
  const summary = store.scopeKey === scope ? store.summary : null;
  const [result, setResult] = useState<NotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const active = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const current = () => !controller.signal.aborted && getNotificationScope()?.key === scope;
    listNotificationsAPI(parseNotificationQuery(new URLSearchParams(search)), controller.signal)
      .then(({ data }) => {
        if (!current()) return;
        setResult(data);
        setSelected([]);
      })
      .catch(cause => {
        if (current()) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, search, reload]);

  const reloadList = () => {
    setLoading(true);
    setError(null);
    setReload(value => value + 1);
  };

  const mutate = async (ids?: string[], item?: NotificationView) => {
    if (pending.current || !result) return;
    const controller = active.current;
    const current = () =>
      !!controller && !controller.signal.aborted && getNotificationScope()?.key === scope;
    if (!current()) {
      store.refreshNotifications();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (ids) await markNotificationsReadAPI(ids);
      else await markAllNotificationsReadAPI(result.head);
      if (!current()) return;
      store.refreshNotifications();
      if (item)
        navigate(notificationHref(item.target, PATH.NOTIFICATIONS + (search ? `?${search}` : "")));
      else reloadList();
    } catch (cause) {
      if (current()) setError(getErrorMessage(cause));
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  const run = (ids?: string[], item?: NotificationView) => {
    mutate(ids, item).catch(cause => setError(getErrorMessage(cause)));
  };
  const newestInApp = Math.max(0, ...(summary?.items.map(item => item.sequence) ?? []));
  return (
    <Flex vertical gap={16}>
      <Flex justify='space-between' align='center'>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Thông báo
        </Typography.Title>
        <Link to={PATH.SETTINGS_NOTIFICATIONS}>Cài đặt thông báo</Link>
      </Flex>
      <Typography.Text>
        {summary ? `${summary.unreadCount} chưa đọc` : "Đang đồng bộ số chưa đọc..."}
      </Typography.Text>
      {store.error && (
        <Alert
          type='warning'
          showIcon
          title={store.error}
          action={<Button onClick={store.refreshNotifications}>Đồng bộ lại</Button>}
        />
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={reloadList}>Thử lại</Button>}
        />
      )}
      <Flex gap={12} wrap>
        <Select
          aria-label='Trạng thái thông báo'
          style={{ width: 180 }}
          value={query.status}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "unread", label: "Chưa đọc" }
          ]}
          onChange={status => change({ status })}
        />
        <Select<NotificationEventType | "">
          aria-label='Loại thông báo'
          style={{ width: 240 }}
          value={query.event ?? ""}
          options={[
            { value: "", label: "Tất cả loại thông báo" },
            ...(result?.eligibleEvents ?? store.eligibleEvents).map(type => ({
              value: type,
              label: NOTIFICATION_EVENT_LABELS[type]
            }))
          ]}
          onChange={event => change({ event: event || undefined })}
        />
        <Button disabled={!selected.length || busy || loading} onClick={() => run(selected)}>
          Đánh dấu đã đọc
        </Button>
        <Button disabled={!result || busy || loading} onClick={() => run()}>
          Đánh dấu tất cả đã đọc
        </Button>
      </Flex>
      {result && newestInApp > result.head && (
        <Button disabled={busy || loading} onClick={reloadList}>
          Có thông báo mới — tải lại
        </Button>
      )}
      {loading && <span role='status'>Đang tải thông báo...</span>}
      <Table<NotificationView>
        rowKey='id'
        loading={loading}
        dataSource={result?.data ?? []}
        pagination={false}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có thông báo' />
        }}
        columns={[
          {
            title: "Chọn",
            key: "select",
            width: 64,
            render: (_, item) => (
              <Checkbox
                aria-label={`Chọn ${item.title}`}
                disabled={busy || loading}
                checked={selected.includes(item.id)}
                onChange={event =>
                  setSelected(ids =>
                    event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id)
                  )
                }
              />
            )
          },
          {
            title: "Thông báo",
            key: "notification",
            render: (_, item) => (
              <Flex vertical align='start'>
                <Button
                  type='link'
                  disabled={busy || loading}
                  style={{ padding: 0, whiteSpace: "normal", height: "auto", textAlign: "left" }}
                  onClick={() => run([item.id], item)}
                >
                  <Typography.Text strong={!item.readAt}>{item.title}</Typography.Text>
                </Button>
                <Typography.Text>{item.body}</Typography.Text>
              </Flex>
            )
          },
          {
            title: "Trạng thái",
            key: "read",
            render: (_, item) => (item.readAt ? "Đã đọc" : "Chưa đọc")
          },
          {
            title: "Thời gian",
            key: "date",
            render: (_, item) =>
              Number.isFinite(Date.parse(item.occurredAt))
                ? new Date(item.occurredAt).toLocaleString("vi-VN")
                : "—"
          }
        ]}
      />
      {result && (
        <Flex justify='space-between' align='center'>
          <Typography.Text>Tổng {result.total} thông báo</Typography.Text>
          <Pagination
            locale={viVN.Pagination}
            current={query.page}
            pageSize={query.pageSize}
            total={result.total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(page, pageSize) =>
              change({ page: pageSize === query.pageSize ? page : 1, pageSize })
            }
          />
        </Flex>
      )}
    </Flex>
  );
}
