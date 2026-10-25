import type { PermissionCode } from "@/constants/permissions";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Flex, Popconfirm, Spin, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import { Link } from "react-router";
import SortableTable from "@/components/SortableTable";
import { PATH } from "@/constants/paths";
import useOrderDraft from "@/hooks/useOrderDraft";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import {
  deleteCategoryAPI,
  listCategoriesAPI,
  reorderCategoriesAPI,
  type Category
} from "@/services/categories";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { CATEGORY_ERROR, toCategoryErrorView } from "./category-errors";
import CategoryForm from "./CategoryForm";

interface ActionError {
  message: string;
  /** Danh mục đang được dùng → hiện link sang sản phẩm/voucher/combo */
  inUseId?: string;
}

// useUnsavedOrderWarning cần modal từ antd <App> (như Banners)
export default function Categories() {
  return (
    <App component={false}>
      <CategoriesContent />
    </App>
  );
}

function CategoriesContent() {
  const profile = useAppStore(state => state.profile);
  const canCreate = !!profile && canAccess(profile, { anyOf: ["CATEGORY_CREATE"] });
  const canUpdate = !!profile && canAccess(profile, { anyOf: ["CATEGORY_UPDATE"] });
  const canDelete = !!profile && canAccess(profile, { anyOf: ["CATEGORY_DELETE"] });
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  // ponytail: thứ tự không có revision — truyền 0; xung đột bắt bằng ORDER_STALE khi lưu
  const draft = useOrderDraft(categories?.map(c => c._id) ?? [], 0);
  useUnsavedOrderWarning(draft.dirty);
  const writesDisabled = busy || draft.dirty;

  // .then thay vì async/await: react-hooks/set-state-in-effect coi setState sau await là đồng bộ
  // Trả các dòng mới (undefined khi lỗi) để CategoryForm điền lại sau xung đột revision
  const load = useCallback(
    (signal?: AbortSignal): Promise<Category[] | undefined> =>
      listCategoriesAPI(signal).then(
        res => {
          setCategories(res.data);
          setLoadError(null);
          return res.data;
        },
        (cause: unknown) => {
          if (!signal?.aborted) setLoadError(getErrorMessage(cause));
          return undefined;
        }
      ),
    []
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = async (
    permission: PermissionCode,
    action: () => Promise<unknown>,
    success: string,
    id?: string
  ) => {
    const latest = useAppStore.getState().profile;
    if (busy || !latest || !canAccess(latest, { anyOf: [permission] })) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      successNotification(success);
      await load();
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.errors?.code === CATEGORY_ERROR.ORDER_STALE || cause.status === 404)
      ) {
        draft.discard();
        await load();
        setActionError({
          message: "Danh sách danh mục đã thay đổi. Đã tải lại; kiểm tra rồi thao tác lại."
        });
      } else {
        const view = toCategoryErrorView(cause);
        setActionError({ message: view.message, inUseId: view.inUse ? id : undefined });
      }
    } finally {
      setBusy(false);
    }
  };

  const byId = useMemo(() => new Map((categories ?? []).map(c => [c._id, c])), [categories]);
  const ordered = draft.valueIds.flatMap(id => byId.get(id) ?? []);

  const columns: NonNullable<TableProps<Category>["columns"]> = [
    {
      title: "Ảnh",
      width: 72,
      render: (_, row) => (
        <img
          src={resolveImageUrl(row.imageUrl)}
          alt={row.name}
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
        />
      )
    },
    { title: "Tên", render: (_, row) => <Typography.Text strong>{row.name}</Typography.Text> },
    { title: "Slug", render: (_, row) => <Typography.Text code>{row.slug}</Typography.Text> },
    { title: "Sản phẩm", width: 100, align: "right", dataIndex: "productCount" },
    { title: "Voucher", width: 100, align: "right", dataIndex: "couponCount" },
    { title: "Combo", width: 100, align: "right", dataIndex: "comboCount" },
    {
      title: "Thao tác",
      width: 160,
      render: (_, row) => (
        <Flex gap={8}>
          <Button
            aria-label={`Sửa ${row.name}`}
            disabled={writesDisabled || !canUpdate}
            onClick={() => {
              if (canUpdate && !writesDisabled) setEditing(row);
            }}
          >
            Sửa
          </Button>
          <Popconfirm
            disabled={writesDisabled || !canDelete}
            title='Xóa danh mục này?'
            okText='Xóa danh mục'
            cancelText='Hủy'
            okButtonProps={{ danger: true, disabled: writesDisabled || !canDelete }}
            onConfirm={() => {
              if (!draft.dirty)
                return run(
                  "CATEGORY_DELETE",
                  () => deleteCategoryAPI(row._id),
                  "Đã xóa danh mục",
                  row._id
                );
            }}
          >
            <Tooltip
              title={
                row.productCount || row.couponCount || row.comboCount
                  ? "Danh mục đang được dùng, sẽ không xóa được"
                  : undefined
              }
            >
              <Button danger aria-label={`Xóa ${row.name}`} disabled={writesDisabled || !canDelete}>
                Xóa
              </Button>
            </Tooltip>
          </Popconfirm>
        </Flex>
      )
    }
  ];

  if (loadError && !categories)
    return (
      <Alert
        type='error'
        showIcon
        title={loadError}
        action={<Button onClick={() => void load()}>Thử lại</Button>}
      />
    );
  if (!categories) return <Spin />;

  return (
    <Flex vertical gap={16}>
      <Flex justify='space-between' align='center' wrap gap={12}>
        <Typography.Title level={2} className='m-0!'>
          Danh mục sản phẩm
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
                disabled={!canUpdate}
                onClick={() =>
                  void run(
                    "CATEGORY_UPDATE",
                    () => reorderCategoriesAPI(draft.valueIds),
                    "Đã lưu thứ tự danh mục"
                  )
                }
              >
                Lưu thứ tự
              </Button>
            </>
          )}
          <Button
            type='primary'
            disabled={writesDisabled || !canCreate}
            onClick={() => {
              if (canCreate && !writesDisabled) setEditing("new");
            }}
          >
            Thêm danh mục
          </Button>
        </Flex>
      </Flex>
      {actionError && (
        <Alert
          type='warning'
          showIcon
          title={actionError.message}
          description={
            actionError.inUseId && (
              <Flex gap={16}>
                <Link to={`${PATH.PRODUCTS}?categoryId=${encodeURIComponent(actionError.inUseId)}`}>
                  Xem sản phẩm
                </Link>
                <Link to={PATH.VOUCHERS}>Xem voucher</Link>
                <Link to={PATH.COMBOS}>Xem combo</Link>
              </Flex>
            )
          }
        />
      )}
      <SortableTable<Category>
        rows={ordered}
        columns={columns}
        rowLabel={row => row.name}
        itemNoun='danh mục'
        disabled={busy || !canUpdate}
        onMove={(id, direction) => {
          if (canUpdate && !busy) draft.move(id, direction);
        }}
        onMoveTo={(id, target) => {
          if (canUpdate && !busy) draft.moveTo(id, target);
        }}
        emptyText='Chưa có danh mục'
      />
      {editing && (
        <CategoryForm
          key={editing === "new" ? "new" : editing._id}
          open
          category={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            successNotification(editing === "new" ? "Đã thêm danh mục" : "Đã lưu danh mục");
            setEditing(null);
            await load();
          }}
          onReload={() => load()}
        />
      )}
    </Flex>
  );
}
