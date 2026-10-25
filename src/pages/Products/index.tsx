import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App, Button, Flex, Input, Pagination, Select, Spin, Tag } from "antd";
import { Typography } from "antd";
import type { TableColumnsType } from "antd";
import DataTable from "@/components/DataTable";
import viVN from "antd/locale/vi_VN";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  changeProductStatusAPI,
  listProductsAPI,
  type CategoryOption,
  type ProductListResult,
  type ProductListRow,
  type ProductStatus,
  type PublishRequirement
} from "@/services/products";
import { PATH } from "@/constants/paths";
import { listCategoriesAPI } from "@/services/categories";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorNotification, successNotification } from "@/utils/notification";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { formatOrderAmount, formatOrderDate } from "@/pages/Orders/order-display";
import { useComboImpact } from "./useComboImpact";
import type { ComboRef } from "@/services/combos";
import {
  parseProductListQuery,
  productStatusLabels,
  publishRequirementLabels,
  serializeProductListQuery,
  toProductListApiQuery,
  type ProductListQueryState
} from "./product-list-query";

const SEARCH_DEBOUNCE_MS = 400;
const STALE_MESSAGE = "Sản phẩm vừa được thay đổi, vui lòng thử lại";
const statusColors: Record<ProductStatus, string> = {
  PUBLISH: "green",
  UNPUBLISH: "orange",
  DRAFT: "default",
  DELETED: "red"
};
const statusActions: Record<ProductStatus, string> = {
  PUBLISH: "Đã đăng bán sản phẩm",
  UNPUBLISH: "Đã ngừng bán sản phẩm",
  DRAFT: "Đã khôi phục sản phẩm",
  DELETED: "Đã lưu trữ sản phẩm"
};

const productDetailPath = (id: string) =>
  PATH.PRODUCT_DETAIL.replace(":id", encodeURIComponent(id));

function checkProductPage(data: ProductListResult): ProductListResult {
  if (!data || !Array.isArray(data.data) || !Number.isFinite(data.total))
    throw new Error("Dữ liệu danh sách sản phẩm không hợp lệ");
  return data;
}

function priceRange({ minPrice, maxPrice }: ProductListRow): string {
  if (minPrice === null || maxPrice === null) return "—";
  const min = formatOrderAmount(minPrice, "VND");
  return minPrice === maxPrice ? min : `${min} – ${formatOrderAmount(maxPrice, "VND")}`;
}

/** Publish failures list what the server guard found missing. */
function statusErrorMessage(cause: unknown): string {
  const missing = cause instanceof ApiError ? cause.errors?.missing : undefined;
  if (!Array.isArray(missing)) return getErrorMessage(cause);
  const labels = missing.flatMap(code =>
    Object.prototype.hasOwnProperty.call(publishRequirementLabels, code)
      ? [publishRequirementLabels[code as PublishRequirement]]
      : []
  );
  return labels.length
    ? `${getErrorMessage(cause)}: thiếu ${labels.join(", ")}`
    : getErrorMessage(cause);
}

// Copied from Vouchers: one request owns recovery and its canonical URL.
function useProductList() {
  const [params, setParams] = useSearchParams();
  const query = parseProductListQuery(params);
  const key = serializeProductListQuery(query).toString();
  const [view, setView] = useState<{ key: string; result?: ProductListResult; error?: string }>({
    key
  });
  const request = useRef<{ controller: AbortController; key: string } | null>(null);
  const fetchList = useCallback(async () => {
    request.current?.controller.abort();
    const current = { controller: new AbortController(), key };
    request.current = current;
    const fetchPage = async (pageQuery: ProductListQueryState) => {
      const { data } = await listProductsAPI(
        toProductListApiQuery(pageQuery),
        current.controller.signal
      );
      if (current.controller.signal.aborted || request.current !== current)
        throw new Error("Yêu cầu đã bị thay thế");
      return checkProductPage(data);
    };
    try {
      const currentQuery = parseProductListQuery(new URLSearchParams(key));
      let data = await fetchPage(currentQuery);
      const lastPage = Math.max(1, data.totalPage);
      if (currentQuery.page > lastPage) {
        const recoveredParams = serializeProductListQuery({ ...currentQuery, page: lastPage });
        current.key = recoveredParams.toString();
        setParams(recoveredParams, { replace: true });
        data = await fetchPage({ ...currentQuery, page: lastPage });
      }
      setView({ key: current.key, result: data });
    } catch (cause) {
      if (!current.controller.signal.aborted && request.current === current)
        setView({ key: current.key, error: getErrorMessage(cause) });
    }
  }, [key, setParams]);
  useEffect(() => {
    if (request.current?.key !== key)
      fetchList().catch(() => {
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
    (changes: Partial<ProductListQueryState>) =>
      setParams(previous => {
        const next = { ...parseProductListQuery(previous), ...changes };
        if (!("page" in changes)) next.page = 1;
        return serializeProductListQuery(next);
      }),
    [setParams]
  );
  const reload = () => {
    setView({ key });
    fetchList().catch(() => {
      /* Active errors are inline. */
    });
  };
  const current = view.key === key ? view : { key };
  return { query, changeQuery, reload, ...current };
}

function useCategoryOptions() {
  const [state, setState] = useState<{ options: CategoryOption[]; error?: string }>({
    options: []
  });
  useEffect(() => {
    const controller = new AbortController();
    listCategoriesAPI(controller.signal).then(
      ({ data }) => setState({ options: Array.isArray(data) ? data : [] }),
      (cause: unknown) => {
        if (!controller.signal.aborted) setState({ options: [], error: getErrorMessage(cause) });
      }
    );
    return () => controller.abort();
  }, []);
  return state;
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

function ProductsPage() {
  const navigate = useNavigate();
  const comboImpact = useComboImpact();
  const { query, changeQuery, reload, result, error } = useProductList();
  const categories = useCategoryOptions();
  const commitSearch = useCallback((q: string) => changeQuery({ q }), [changeQuery]);
  const [search, setSearch] = useDebouncedSearch(query.q, commitSearch);
  const [busyId, setBusyId] = useState<string | null>(null);
  const changing = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const changeStatus = async (row: ProductListRow, status: ProductStatus) => {
    if (changing.current) return;
    changing.current = true;
    setBusyId(row._id);
    setActionError(null);
    try {
      let affected: ComboRef[] = [];
      if (status === "UNPUBLISH" || status === "DELETED") {
        const confirmed = await comboImpact.confirm(
          row._id,
          status === "UNPUBLISH" ? "Ngừng bán sản phẩm này?" : "Lưu trữ sản phẩm này?"
        );
        if (confirmed === null) return;
        affected = confirmed;
      }
      await changeProductStatusAPI(row._id, { status, expectedRevision: row.revision });
      successNotification(statusActions[status]);
      comboImpact.notify(affected);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        setActionError(STALE_MESSAGE);
        reload();
      } else errorNotification(statusErrorMessage(cause));
    } finally {
      changing.current = false;
      setBusyId(null);
    }
  };

  const action = (row: ProductListRow, status: ProductStatus, label: string) => (
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

  const columns: TableColumnsType<ProductListRow> = [
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
      render: (_, row) => <Link to={productDetailPath(row._id)}>{row.name}</Link>
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_, row) => (
        <Tag color={statusColors[row.status]}>{productStatusLabels[row.status]}</Tag>
      )
    },
    {
      title: "Biến thể (đang bán/tổng)",
      key: "variants",
      render: (_, row) => `${row.activeVariantCount}/${row.variantCount}`
    },
    { title: "Giá", key: "price", render: (_, row) => priceRange(row) },
    { title: "Tồn kho", dataIndex: "totalStock" },
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
              <Button
                size='small'
                aria-label={`Ngừng bán ${row.name}`}
                disabled={busyId !== null}
                loading={busyId === row._id}
                onClick={() => changeStatus(row, "UNPUBLISH")}
              >
                Ngừng bán
              </Button>
            ) : (
              action(row, "PUBLISH", "Đăng bán")
            )}
            <Button
              size='small'
              danger
              aria-label={`Lưu trữ ${row.name}`}
              disabled={busyId !== null}
              onClick={() => changeStatus(row, "DELETED")}
            >
              Lưu trữ
            </Button>
          </Flex>
        )
    }
  ];

  return (
    <section className='min-w-0'>
      <Typography.Title level={2}>Sản phẩm</Typography.Title>
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
          aria-label='Tìm sản phẩm'
          placeholder='Tên hoặc SKU'
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
        <Select
          aria-label='Lọc danh mục'
          value={query.categoryId}
          allowClear
          placeholder={categories.error ? "Không tải được danh mục" : "Tất cả danh mục"}
          disabled={!!categories.error}
          style={{ width: 220 }}
          options={categories.options.map(({ _id, name }) => ({ value: _id, label: name }))}
          onChange={(categoryId?: string) => changeQuery({ categoryId })}
        />
        <Flex gap={8} className='ml-auto'>
          <Button onClick={reload} disabled={!result && !error}>
            Tải lại
          </Button>
          <Button type='primary' onClick={() => navigate(PATH.PRODUCT_NEW)}>
            Thêm sản phẩm
          </Button>
        </Flex>
      </Flex>
      {error ? (
        <Alert type='error' title={error} action={<Button onClick={reload}>Thử lại</Button>} />
      ) : !result ? (
        <Spin aria-label='Đang tải sản phẩm' />
      ) : (
        <>
          <DataTable
            rowKey='_id'
            columns={columns}
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Không có sản phẩm" }}
          />
          <Flex justify='space-between' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {result.total} sản phẩm</Typography.Text>
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

export default function Products() {
  const accountId = useAppStore(state => state.profile?._id);
  return accountId ? (
    <App component={false}>
      <ProductsPage key={accountId} />
    </App>
  ) : null;
}
