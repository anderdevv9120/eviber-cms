import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Tag,
  Tooltip,
  Checkbox
} from "antd";
import { Typography } from "antd";
import type { TableColumnsType } from "antd";
import DataTable from "@/components/DataTable";
import viVN from "antd/locale/vi_VN";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  changeComboStatusAPI,
  listCombosAPI,
  type ComboListResult,
  type ComboListRow,
  type ComboIssue
} from "@/services/combos";
import type { ProductStatus } from "@/services/products";
import { mapComboError } from "./combo-errors";
import { PATH } from "@/constants/paths";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorNotification, successNotification } from "@/utils/notification";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { formatOrderAmount, formatOrderDate } from "@/pages/Orders/order-display";
import {
  parseComboListQuery,
  productStatusLabels,
  publishRequirementLabels,
  serializeComboListQuery,
  toComboListApiQuery,
  type ComboListQueryState
} from "./combo-list-query";

const SEARCH_DEBOUNCE_MS = 400;
const STALE_MESSAGE = "Combo vừa được thay đổi, vui lòng tải lại";
const statusColors: Record<ProductStatus, string> = {
  PUBLISH: "green",
  UNPUBLISH: "orange",
  DRAFT: "default",
  DELETED: "red"
};
const statusActions: Record<ProductStatus, string> = {
  PUBLISH: "Đã đăng bán combo",
  UNPUBLISH: "Đã ngừng bán combo",
  DRAFT: "Đã khôi phục combo",
  DELETED: "Đã lưu trữ combo"
};

const comboDetailPath = (id: string) => PATH.COMBO_DETAIL.replace(":id", encodeURIComponent(id));

function checkComboPage(data: ComboListResult): ComboListResult {
  if (!data || !Array.isArray(data.data) || !Number.isFinite(data.total))
    throw new Error("Dữ liệu danh sách combo không hợp lệ");
  return data;
}

function priceRange({ priceRange }: ComboListRow): string {
  if (!priceRange) return "—";
  return `${formatOrderAmount(priceRange.min, "VND")} – ${formatOrderAmount(priceRange.max, "VND")}`;
}

const issueLabels: Record<ComboIssue["kind"], string> = {
  PRODUCT_MISSING: "không còn tồn tại",
  PRODUCT_NOT_PUBLISHED: "đã ẩn",
  LOCKED_VARIANT_INACTIVE: "có biến thể cố định đã ẩn",
  NO_ACTIVE_VARIANT: "không có biến thể đang bán"
};

function statusErrorMessage(cause: unknown): string {
  const mapped = cause instanceof ApiError ? mapComboError(cause) : undefined;
  const labels = mapped?.missing?.map(code => publishRequirementLabels[code]) ?? [];
  return labels.length
    ? `${getErrorMessage(cause)}: thiếu ${labels.join(", ")}`
    : getErrorMessage(cause);
}

// Copied from Vouchers: one request owns recovery and its canonical URL.
function useComboList() {
  const [params, setParams] = useSearchParams();
  const query = parseComboListQuery(params);
  const key = serializeComboListQuery(query).toString();
  const [view, setView] = useState<{ key: string; result?: ComboListResult; error?: string }>({
    key
  });
  const request = useRef<{ controller: AbortController; key: string } | null>(null);
  const fetchList = useCallback(
    async (queryKey: string) => {
      request.current?.controller.abort();
      const current = { controller: new AbortController(), key: queryKey };
      request.current = current;
      const fetchPage = async (pageQuery: ComboListQueryState) => {
        const { data } = await listCombosAPI(
          toComboListApiQuery(pageQuery),
          current.controller.signal
        );
        if (current.controller.signal.aborted || request.current !== current)
          throw new Error("Yêu cầu đã bị thay thế");
        return checkComboPage(data);
      };
      try {
        const currentQuery = parseComboListQuery(new URLSearchParams(queryKey));
        let data = await fetchPage(currentQuery);
        const lastPage = Math.max(1, data.totalPage);
        if (currentQuery.page > lastPage) {
          const recoveredParams = serializeComboListQuery({ ...currentQuery, page: lastPage });
          current.key = recoveredParams.toString();
          setParams(recoveredParams, { replace: true });
          data = await fetchPage({ ...currentQuery, page: lastPage });
        }
        setView({ key: current.key, result: data });
      } catch (cause) {
        if (!current.controller.signal.aborted && request.current === current)
          setView({ key: current.key, error: getErrorMessage(cause) });
      }
    },
    [setParams]
  );
  useEffect(() => {
    if (request.current?.key !== key)
      fetchList(key).catch(() => {
        /* Active errors are inline. */
      });
    return () => {
      if (request.current?.key !== key) return;
      request.current.controller.abort();
      request.current = null;
    };
  }, [fetchList, key]);
  useEffect(
    () => () => {
      request.current?.controller.abort();
      request.current = null;
    },
    []
  );
  const changeQuery = useCallback(
    (changes: Partial<ComboListQueryState>) =>
      setParams(previous => {
        const next = { ...parseComboListQuery(previous), ...changes };
        if (!("page" in changes)) next.page = 1;
        return serializeComboListQuery(next);
      }),
    [setParams]
  );
  const reload = () => {
    // A pending status action may finish after the URL has changed.
    const currentKey = request.current?.key;
    if (currentKey === undefined) return;
    setView({ key: currentKey });
    fetchList(currentKey).catch(() => {
      /* Active errors are inline. */
    });
  };
  const current = view.key === key ? view : { key };
  return { query, changeQuery, reload, ...current };
}

/** URL `q` wins whenever it changes outside typing (back/forward, filter reset). */
function useDebouncedSearch(q: string, commit: (q: string) => void) {
  const [draft, setDraft] = useState({ base: q, text: q });
  const text = draft.base === q ? draft.text : q;
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = setTimeout(() => {
      setDraft({ base: next, text });
      commit(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q, commit]);
  return [text, (value: string) => setDraft({ base: q, text: value })] as const;
}

function CombosPage() {
  const navigate = useNavigate();
  const { query, changeQuery, reload, result, error } = useComboList();
  const commitSearch = useCallback((q: string) => changeQuery({ q }), [changeQuery]);
  const [search, setSearch] = useDebouncedSearch(query.q, commitSearch);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const changeStatus = async (row: ComboListRow, status: ProductStatus) => {
    setBusyId(row._id);
    setActionError(null);
    try {
      await changeComboStatusAPI(row._id, { status, expectedRevision: row.revision });
      successNotification(statusActions[status]);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        setActionError(STALE_MESSAGE);
        reload();
      } else errorNotification(statusErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const action = (row: ComboListRow, status: ProductStatus, label: string) => (
    <Button
      size='small'
      aria-label={`${label} ${row.name}`}
      disabled={busyId !== null}
      loading={busyId === row._id}
      onClick={() => changeStatus(row, status)}
    >
      {label}
    </Button>
  );

  const columns: TableColumnsType<ComboListRow> = [
    {
      title: "Ảnh",
      key: "image",
      width: 72,
      render: (_, row) =>
        row.image ? (
          <img
            src={resolveImageUrl(row.image)}
            alt={row.name}
            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
          />
        ) : (
          "—"
        )
    },
    {
      title: "Tên",
      key: "name",
      render: (_, row) => <Link to={comboDetailPath(row._id)}>{row.name}</Link>
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_, row) => (
        <Tag color={statusColors[row.status]}>{productStatusLabels[row.status]}</Tag>
      )
    },
    {
      title: "Giá",
      key: "price",
      render: (_, row) =>
        row.pricing.mode === "PERCENT"
          ? `−${row.pricing.value}%`
          : formatOrderAmount(row.pricing.value, "VND")
    },
    { title: "Khoảng giá", key: "priceRange", render: (_, row) => priceRange(row) },
    {
      title: "Tình trạng",
      key: "availability",
      render: (_, row) =>
        row.issues.length ? (
          <Tooltip
            title={row.issues
              .map(issue => `${issue.productName ?? issue.productId} ${issueLabels[issue.kind]}`)
              .join("; ")}
          >
            <Tag color='red'>Cần xử lý</Tag>
          </Tooltip>
        ) : row.availability === "AVAILABLE" ? (
          "Còn hàng"
        ) : (
          "Hết hàng"
        )
    },
    { title: "Cập nhật", key: "updated", render: (_, row) => formatOrderDate(row.updated_at) },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, row) =>
        row.status === "DELETED" ? (
          action(row, "DRAFT", "Khôi phục")
        ) : (
          <Flex gap={8} wrap>
            {row.status === "PUBLISH" ? (
              <Popconfirm
                title='Ngừng bán combo này?'
                description='Combo bị ẩn khỏi cửa hàng; có thể đăng bán lại sau.'
                okText='Ngừng bán combo'
                cancelText='Hủy'
                onConfirm={() => changeStatus(row, "UNPUBLISH")}
              >
                <Button
                  size='small'
                  aria-label={`Ngừng bán ${row.name}`}
                  disabled={busyId !== null}
                  loading={busyId === row._id}
                >
                  Ngừng bán
                </Button>
              </Popconfirm>
            ) : (
              action(row, "PUBLISH", "Đăng bán")
            )}
            <Popconfirm
              title='Lưu trữ combo này?'
              description='Combo bị ẩn khỏi cửa hàng; khôi phục trong bộ lọc "Đã lưu trữ".'
              okText='Lưu trữ combo'
              cancelText='Hủy'
              okButtonProps={{ danger: true }}
              onConfirm={() => changeStatus(row, "DELETED")}
            >
              <Button
                size='small'
                danger
                aria-label={`Lưu trữ ${row.name}`}
                disabled={busyId !== null}
              >
                Lưu trữ
              </Button>
            </Popconfirm>
          </Flex>
        )
    }
  ];

  return (
    <section className='min-w-0'>
      <Typography.Title level={2}>Combo</Typography.Title>
      {actionError && (
        <Alert
          type='warning'
          showIcon
          closable
          title={actionError}
          className='mb-4'
          onClose={() => setActionError(null)}
        />
      )}
      <Flex gap={12} wrap align='center' className='mb-4'>
        <Input
          type='search'
          aria-label='Tìm combo'
          placeholder='Tên hoặc đường dẫn'
          value={search}
          maxLength={100}
          allowClear
          style={{ maxWidth: 320 }}
          onChange={event => setSearch(event.target.value)}
        />
        <Select
          aria-label='Lọc trạng thái'
          value={query.status}
          style={{ width: 220 }}
          options={[
            { value: "ACTIVE_SET", label: "Tất cả (trừ đã lưu trữ)" },
            ...Object.entries(productStatusLabels).map(([value, label]) => ({ value, label }))
          ]}
          onChange={status => changeQuery({ status })}
        />
        <Checkbox
          checked={query.attention}
          onChange={event => changeQuery({ attention: event.target.checked })}
        >
          Lọc cần xử lý
        </Checkbox>
        <Flex gap={8} className='ml-auto'>
          <Button onClick={reload} disabled={!result && !error}>
            Tải lại
          </Button>
          <Button type='primary' onClick={() => navigate(PATH.COMBO_NEW)}>
            Thêm combo
          </Button>
        </Flex>
      </Flex>
      {error ? (
        <Alert type='error' title={error} action={<Button onClick={reload}>Thử lại</Button>} />
      ) : !result ? (
        <Spin aria-label='Đang tải combo' />
      ) : (
        <>
          <DataTable
            rowKey='_id'
            columns={columns}
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Không có combo" }}
          />
          <Flex justify='space-between' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {result.total} combo</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={result.pageSize}
              total={result.total}
              showSizeChanger={false}
              onChange={page => changeQuery({ page })}
            />
          </Flex>
        </>
      )}
    </section>
  );
}

export default function Combos() {
  const accountId = useAppStore(state => state.profile?._id);
  return accountId ? <CombosPage key={accountId} /> : null;
}
