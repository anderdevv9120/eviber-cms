import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Flex, Popconfirm, Spin, Switch, Typography } from "antd";
import type { TableProps } from "antd";
import SortableTable from "@/components/SortableTable";
import useOrderDraft from "@/hooks/useOrderDraft";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import {
  createBannerAPI,
  deleteBannerAPI,
  listBannersAPI,
  reorderBannersAPI,
  updateBannerAPI,
  type Banner,
  type BannerInput
} from "@/services/banners";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import BannerForm from "./BannerForm";

export default function Banners() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Banner | "new" | null>(null);
  // ponytail: banner không có revision — truyền 0; xung đột bắt bằng 409 khi lưu thứ tự
  const draft = useOrderDraft(banners?.map(b => b._id) ?? [], 0);
  useUnsavedOrderWarning(draft.dirty);
  const writesDisabled = busy || draft.dirty;

  // .then thay vì async/await: react-hooks/set-state-in-effect coi setState sau await là đồng bộ
  const load = useCallback(
    (signal?: AbortSignal) =>
      listBannersAPI(signal).then(
        res => {
          setBanners(res.data);
          setLoadError(null);
        },
        (cause: unknown) => {
          if (!signal?.aborted) setLoadError(getErrorMessage(cause));
        }
      ),
    []
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      successNotification(success);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        draft.discard();
        await load();
        setActionError("Danh sách banner đã thay đổi. Đã tải lại; kiểm tra rồi thao tác lại.");
      } else setActionError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (input: BannerInput) => {
    if (editing === "new") await createBannerAPI(input);
    else if (editing) await updateBannerAPI(editing._id, input);
    successNotification(editing === "new" ? "Đã thêm banner" : "Đã lưu banner");
    setEditing(null);
    await load();
  };

  const byId = useMemo(() => new Map((banners ?? []).map(b => [b._id, b])), [banners]);
  const ordered = draft.valueIds.flatMap(id => byId.get(id) ?? []);

  const columns: NonNullable<TableProps<Banner>["columns"]> = [
    {
      title: "Ảnh",
      width: 160,
      render: (_, row) => (
        <img
          src={resolveImageUrl(row.image)}
          alt={row.title}
          style={{ width: 140, height: 48, objectFit: "cover", borderRadius: 4 }}
        />
      )
    },
    {
      title: "Tiêu đề",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text strong>{row.title}</Typography.Text>
          {row.subtitle && <Typography.Text type='secondary'>{row.subtitle}</Typography.Text>}
        </Flex>
      )
    },
    {
      title: "Nút",
      render: (_, row) => (row.ctaLabel ? `${row.ctaLabel} → ${row.ctaHref}` : "—")
    },
    {
      title: "Hiển thị",
      width: 100,
      render: (_, row) => (
        <Switch
          aria-label={`Hiển thị ${row.title}`}
          checked={row.isActive}
          disabled={writesDisabled}
          onChange={checked =>
            void run(
              () => updateBannerAPI(row._id, { isActive: checked }),
              checked ? "Đã bật banner" : "Đã tắt banner"
            )
          }
        />
      )
    },
    {
      title: "Thao tác",
      width: 160,
      render: (_, row) => (
        <Flex gap={8}>
          <Button
            aria-label={`Sửa ${row.title}`}
            disabled={writesDisabled}
            onClick={() => setEditing(row)}
          >
            Sửa
          </Button>
          <Popconfirm
            title='Xóa banner này?'
            description='Banner bị xóa vĩnh viễn. Muốn giữ lại thì tắt Hiển thị.'
            okText='Xóa banner'
            cancelText='Hủy'
            okButtonProps={{ danger: true }}
            onConfirm={() => run(() => deleteBannerAPI(row._id), "Đã xóa banner")}
          >
            <Button danger aria-label={`Xóa ${row.title}`} disabled={writesDisabled}>
              Xóa
            </Button>
          </Popconfirm>
        </Flex>
      )
    }
  ];

  if (loadError && !banners)
    return (
      <Alert
        type='error'
        showIcon
        title={loadError}
        action={<Button onClick={() => void load()}>Thử lại</Button>}
      />
    );
  if (!banners) return <Spin />;

  return (
    <Flex vertical gap={16}>
      <Flex justify='space-between' align='center' wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Banner trang chủ
        </Typography.Title>
        <Flex gap={8}>
          {draft.dirty && (
            <>
              <Button disabled={busy} onClick={draft.discard}>
                Hủy thay đổi
              </Button>
              <Button
                type='primary'
                loading={busy}
                onClick={() =>
                  void run(() => reorderBannersAPI(draft.valueIds), "Đã lưu thứ tự banner")
                }
              >
                Lưu thứ tự
              </Button>
            </>
          )}
          <Button type='primary' disabled={writesDisabled} onClick={() => setEditing("new")}>
            Thêm banner
          </Button>
        </Flex>
      </Flex>
      {actionError && <Alert type='warning' showIcon title={actionError} />}
      <SortableTable<Banner>
        rows={ordered}
        columns={columns}
        rowLabel={row => row.title}
        itemNoun='banner'
        disabled={busy}
        onMove={draft.move}
        onMoveTo={draft.moveTo}
        emptyText='Chưa có banner'
        scrollX={800}
      />
      {editing && (
        <BannerForm
          banner={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
        />
      )}
    </Flex>
  );
}
