import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Pagination,
  Radio,
  Select,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useSearchParams } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getInventoryAPI,
  type InventoryList,
  type InventoryRow,
  type InventoryStockFilter
} from "@/services/inventory";
import type { ProductStatus, ProductVariantStatus } from "@/services/products";
import { thresholdError, validThreshold } from "./inventory-query";
import { useKeyedRead } from "@/hooks/useKeyedRead";
import { productStatusLabels } from "@/pages/Products/product-list-query";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import {
  INVENTORY_PAGE_SIZES,
  parseInventoryQuery,
  toInventoryApiQuery,
  toInventorySearch,
  type InventoryUrlQuery
} from "./inventory-query";
import AdjustStockModal from "./AdjustStockModal";
import StockHistoryDrawer from "./StockHistoryDrawer";

const HINT = "Đếm trên mọi biến thể chưa xoá — khác số liệu Dashboard (chỉ sản phẩm đang bán).";
const productStatusColors: Record<ProductStatus, string> = {
  PUBLISH: "green",
  UNPUBLISH: "orange",
  DRAFT: "default",
  DELETED: "red"
};
const variantStatuses: Record<ProductVariantStatus, { label: string; color: string }> = {
  ACTIVE: { label: "Đang bán", color: "green" },
  INACTIVE: { label: "Ngừng bán", color: "default" }
};
const stockLabels: Record<InventoryStockFilter, string> = {
  all: "Tất cả",
  low: "Sắp hết",
  out: "Hết hàng"
};

const queryOf = (key: string) => parseInventoryQuery(new URLSearchParams(key)).query;
async function loadInventory(key: string, signal: AbortSignal) {
  const { data } = await getInventoryAPI(toInventoryApiQuery(queryOf(key)), signal);
  if (!data || !Array.isArray(data.data) || !data.metadata)
    throw new Error("Không nhận được danh sách tồn kho hợp lệ. Vui lòng thử lại.");
  return data;
}
function recoverPage(key: string, list: InventoryList) {
  const query = queryOf(key);
  const lastPage = Math.max(1, list.totalPage);
  return query.page > lastPage ? toInventorySearch({ ...query, page: lastPage }).toString() : null;
}

const productPath = (id: string) => PATH.PRODUCT_DETAIL.replace(":id", encodeURIComponent(id));

/** Commits on blur or Enter, and only a valid value; the parent re-keys it on URL changes. */
function ThresholdInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const valid = validThreshold(draft.trim());
  const commit = () => {
    if (valid && Number(draft) !== value) onCommit(Number(draft));
  };
  return (
    <Flex vertical>
      <Input
        aria-label='Ngưỡng sắp hết'
        prefix='Ngưỡng ≤'
        inputMode='numeric'
        style={{ width: 170 }}
        value={draft}
        status={valid ? undefined : "error"}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onPressEnter={commit}
      />
      {!valid && <Typography.Text type='danger'>{thresholdError}</Typography.Text>}
    </Flex>
  );
}

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const { query, errors } = parseInventoryQuery(params);
  // Stable identity keeps the read Effect from re-running on unrelated renders.
  const commitRecoveredPage = useCallback(
    (key: string) => setParams(new URLSearchParams(key), { replace: true }),
    [setParams]
  );
  const { data, error, loading, reload } = useKeyedRead(
    errors.length ? null : toInventorySearch(query).toString(),
    loadInventory,
    recoverPage,
    commitRecoveredPage
  );
  const retry = () => {
    reload().catch(() => {
      // The read displays its own failure and offers another retry.
    });
  };
  // Page resets unless the change is the page itself.
  const changeQuery = (changes: Partial<InventoryUrlQuery>) =>
    setParams(toInventorySearch({ ...query, page: 1, ...changes }));

  // A row replaced after an adjustment shows until the next read, which drops every replacement.
  const [replaced, setReplaced] = useState<{
    source?: InventoryList;
    rows: Record<string, InventoryRow>;
  }>({ rows: {} });
  const replaceRow = (row: InventoryRow) =>
    setReplaced(previous => ({
      source: data,
      rows: { ...(previous.source === data ? previous.rows : {}), [row.variantId]: row }
    }));
  const rows = data?.data.map(
    row => (replaced.source === data && replaced.rows[row.variantId]) || row
  );
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const rowActions = { onAdjust: setAdjusting, onHistory: setHistory, replaceRow };

  const threshold = data?.metadata.lowStockThreshold ?? query.lowStockThreshold;
  const columns: TableColumnsType<InventoryRow> = [
    {
      title: "Ảnh",
      key: "image",
      width: 72,
      render: (_, row) =>
        row.image ? (
          <img
            src={resolveImageUrl(row.image)}
            alt={row.productName}
            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
          />
        ) : (
          "—"
        )
    },
    {
      title: "Sản phẩm",
      key: "product",
      render: (_, row) => <Link to={productPath(row.productId)}>{row.productName}</Link>
    },
    {
      title: "Thuộc tính",
      key: "attributes",
      render: (_, row) => row.attributeLabels.join(" / ") || "—"
    },
    { title: "SKU", dataIndex: "sku" },
    {
      title: "Trạng thái sản phẩm",
      key: "productStatus",
      render: (_, row) => (
        <Tag color={productStatusColors[row.productStatus]}>
          {productStatusLabels[row.productStatus]}
        </Tag>
      )
    },
    {
      title: "Trạng thái biến thể",
      key: "variantStatus",
      render: (_, row) => (
        <Tag color={variantStatuses[row.variantStatus].color}>
          {variantStatuses[row.variantStatus].label}
        </Tag>
      )
    },
    {
      title: "Tồn kho",
      key: "inventoryCount",
      render: (_, { inventoryCount }) => (
        <strong
          className={
            inventoryCount === 0
              ? "text-red-600"
              : inventoryCount <= threshold
                ? "text-orange-500"
                : undefined
          }
        >
          {inventoryCount}
        </strong>
      )
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, row) => (
        <Flex gap={8} wrap>
          <Button
            size='small'
            aria-label={`Điều chỉnh ${row.sku}`}
            onClick={() => rowActions.onAdjust(row)}
          >
            Điều chỉnh
          </Button>
          <Button
            size='small'
            aria-label={`Lịch sử ${row.sku}`}
            onClick={() => rowActions.onHistory(row)}
          >
            Lịch sử
          </Button>
        </Flex>
      )
    }
  ];

  return (
    <section className='min-w-0'>
      <Typography.Title level={2}>Tồn kho</Typography.Title>
      <Flex gap={12} wrap align='start' className='mb-2'>
        <Input.Search
          key={query.search}
          aria-label='Tìm biến thể'
          placeholder='Tên sản phẩm hoặc SKU'
          defaultValue={query.search}
          maxLength={100}
          allowClear
          style={{ width: 320 }}
          onSearch={value => changeQuery({ search: value.trim() })}
        />
        <Select
          aria-label='Lọc trạng thái sản phẩm'
          value={query.productStatus}
          allowClear
          placeholder='Mọi trạng thái sản phẩm'
          style={{ width: 220 }}
          options={(["PUBLISH", "UNPUBLISH", "DRAFT"] as const).map(value => ({
            value,
            label: productStatusLabels[value]
          }))}
          onChange={(productStatus?: InventoryUrlQuery["productStatus"]) =>
            changeQuery({ productStatus })
          }
        />
        <Select
          aria-label='Lọc trạng thái biến thể'
          value={query.variantStatus}
          allowClear
          placeholder='Mọi trạng thái biến thể'
          style={{ width: 220 }}
          options={Object.entries(variantStatuses).map(([value, { label }]) => ({ value, label }))}
          onChange={(variantStatus?: InventoryUrlQuery["variantStatus"]) =>
            changeQuery({ variantStatus })
          }
        />
        <Radio.Group
          aria-label='Chế độ tồn kho'
          optionType='button'
          value={query.stock}
          options={Object.entries(stockLabels).map(([value, label]) => ({ value, label }))}
          onChange={event => changeQuery({ stock: event.target.value })}
        />
        {query.stock === "low" && (
          <ThresholdInput
            key={query.lowStockThreshold}
            value={query.lowStockThreshold}
            onCommit={lowStockThreshold => changeQuery({ lowStockThreshold })}
          />
        )}
        <Button className='ml-auto' onClick={retry} disabled={loading || errors.length > 0}>
          Tải lại
        </Button>
      </Flex>
      {query.productId && (
        <Tag
          key={query.productId}
          closable
          className='mb-2'
          onClose={() => changeQuery({ productId: undefined })}
        >
          Sản phẩm: {data?.data[0]?.productName ?? query.productId}
        </Tag>
      )}
      <Typography.Paragraph type='secondary'>{HINT}</Typography.Paragraph>
      {errors.length > 0 && (
        <Alert
          className='mb-4'
          type='warning'
          showIcon
          title='Bộ lọc tồn kho trên đường dẫn không hợp lệ'
          description={
            <ul>
              {errors.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          }
          action={
            <Button onClick={() => setParams(toInventorySearch(query))}>
              Dùng giá trị mặc định
            </Button>
          }
        />
      )}
      {loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải tồn kho' />
        </Flex>
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={retry}>Thử lại</Button>}
        />
      )}
      {data && (
        <>
          <Table
            rowKey='variantId'
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1100 }}
            locale={{ emptyText: "Không có biến thể" }}
          />
          <Flex justify='space-between' align='center' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {data.total} biến thể</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={query.pageSize}
              total={data.total}
              showSizeChanger={{ "aria-label": "Số biến thể mỗi trang" }}
              pageSizeOptions={INVENTORY_PAGE_SIZES}
              onChange={(page, pageSize) =>
                changeQuery(pageSize !== query.pageSize ? { pageSize } : { page })
              }
            />
          </Flex>
        </>
      )}
      {adjusting && (
        <AdjustStockModal
          key={adjusting.variantId}
          row={adjusting}
          open
          onClose={() => setAdjusting(null)}
          onAdjusted={result => {
            rowActions.replaceRow(result.row);
            if (history?.variantId === result.row.variantId) setHistoryRefresh(count => count + 1);
          }}
          onGone={() => {
            setAdjusting(null);
            retry();
          }}
          onUnknownResult={retry}
        />
      )}
      {history && (
        <StockHistoryDrawer
          key={history.variantId}
          variantId={history.variantId}
          open
          onClose={() => setHistory(null)}
          refreshKey={historyRefresh}
        />
      )}
    </section>
  );
}
