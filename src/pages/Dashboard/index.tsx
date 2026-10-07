import { useCallback, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Pagination,
  Radio,
  Row,
  Spin,
  Statistic,
  Table,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useSearchParams } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getDashboardAPI,
  getStockReportAPI,
  type DashboardSummary,
  type StockReport,
  type StockRow,
  type StockStatus
} from "@/services/reports";
import { formatOrderDate } from "../Orders/order-display";
import {
  parseDashboardQuery,
  serializeDashboardQuery,
  thresholdError,
  validThreshold,
  type StockQuery
} from "./dashboard-query";
import { useKeyedRead } from "./useKeyedRead";

async function loadSummary(key: string, signal: AbortSignal) {
  const { data } = await getDashboardAPI({ lowStockThreshold: Number(key) }, signal);
  if (!data?.metadata || !data.orders || !data.catalog)
    throw new Error("Không nhận được số liệu tổng quan hợp lệ. Vui lòng thử lại.");
  return data;
}
const stockQuery = (key: string) => parseDashboardQuery(new URLSearchParams(key)).query;
async function loadStock(key: string, signal: AbortSignal) {
  const { data } = await getStockReportAPI(stockQuery(key), signal);
  if (!data?.metadata || !Array.isArray(data.data))
    throw new Error("Không nhận được danh sách tồn kho hợp lệ. Vui lòng thử lại.");
  return data;
}
function recoverStockPage(key: string, report: StockReport) {
  const query = stockQuery(key);
  const lastPage = Math.max(1, report.totalPage);
  return query.page > lastPage
    ? serializeDashboardQuery({ ...query, page: lastPage }).toString()
    : null;
}

const stockLabels: Record<StockStatus, string> = { low: "Sắp hết hàng", out: "Hết hàng" };
const stockColumns: TableColumnsType<StockRow> = [
  { title: "Sản phẩm", dataIndex: "productName" },
  { title: "SKU", dataIndex: "sku" },
  { title: "Tồn kho", dataIndex: "inventoryCount" }
];
const appliedAt = ({ lowStockThreshold, generatedAt }: DashboardSummary["metadata"]) =>
  `Ngưỡng đang áp dụng: ${lowStockThreshold} · Cập nhật lúc ${formatOrderDate(generatedAt)}`;

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const url = parseDashboardQuery(params);
  // Stable identity keeps the stock read Effect from re-running on unrelated renders.
  const commitRecoveredPage = useCallback(
    (key: string) => setParams(new URLSearchParams(key), { replace: true }),
    [setParams]
  );
  const summary = useKeyedRead(url.threshold === null ? null : String(url.threshold), loadSummary);
  const stock = useKeyedRead(
    url.stock && serializeDashboardQuery(url.stock).toString(),
    loadStock,
    recoverStockPage,
    commitRecoveredPage
  );
  const busy = summary.loading || stock.loading;

  const retry = (section: { reload: () => Promise<void> }) => {
    section.reload().catch(() => {
      // The section displays its read failure and offers another retry.
    });
  };
  const refresh = () => {
    retry(summary);
    retry(stock);
  };
  // Page resets unless the change is the page itself.
  const changeStock = (changes: Partial<StockQuery>) =>
    setParams(serializeDashboardQuery({ ...url.query, page: 1, ...changes }));
  const resetInvalidValues = () => setParams(serializeDashboardQuery(url.query));
  const applyThreshold = (value: string) => {
    const next = serializeDashboardQuery({
      ...url.query,
      lowStockThreshold: Number(value),
      page: 1
    });
    // Applying the committed values again is an explicit refresh.
    if (next.toString() === params.toString()) refresh();
    else setParams(next);
  };
  const committedThreshold =
    url.threshold === null ? (params.get("lowStockThreshold") ?? "") : String(url.threshold);

  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center' wrap gap={12}>
        <Typography.Title level={2}>Tổng quan vận hành</Typography.Title>
        <Flex gap={12} align='start'>
          <ThresholdForm
            key={committedThreshold}
            committed={committedThreshold}
            busy={busy}
            onApply={applyThreshold}
          />
          <Button onClick={refresh} disabled={busy}>
            Tải lại
          </Button>
        </Flex>
      </Flex>
      <Typography.Paragraph type='secondary'>
        Số liệu hiện tại trên mọi ngày; không dùng bộ lọc ngày hay trạng thái giao hàng của báo cáo.
      </Typography.Paragraph>
      {url.thresholdError && (
        <Alert
          className='mb-4'
          type='warning'
          showIcon
          title={url.thresholdError}
          action={<Button onClick={resetInvalidValues}>Dùng giá trị mặc định</Button>}
        />
      )}

      <section aria-label='Tình trạng hiện tại' className='mb-6'>
        {summary.loading && (
          <Flex justify='center' className='py-8'>
            <Spin aria-label='Đang tải số liệu tổng quan' />
          </Flex>
        )}
        {summary.error && (
          <Alert
            type='error'
            showIcon
            title={summary.error}
            action={<Button onClick={() => retry(summary)}>Thử lại</Button>}
          />
        )}
        {summary.data && (
          <SummaryCards
            summary={summary.data}
            stockStatus={url.query.stockStatus}
            onSelectStock={stockStatus => changeStock({ stockStatus })}
          />
        )}
      </section>

      <section aria-label='Tồn kho cần chú ý'>
        <Flex justify='space-between' align='center'>
          <Typography.Title level={3}>Tồn kho cần chú ý</Typography.Title>
          <Radio.Group
            aria-label='Chế độ tồn kho'
            optionType='button'
            value={url.query.stockStatus}
            onChange={event => changeStock({ stockStatus: event.target.value })}
            options={Object.entries(stockLabels).map(([value, label]) => ({ value, label }))}
          />
        </Flex>
        {url.stockErrors.length > 0 && (
          <Alert
            type='warning'
            showIcon
            title='Bộ lọc tồn kho trên đường dẫn không hợp lệ'
            description={
              <ul>
                {url.stockErrors.map(error => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            }
            action={<Button onClick={resetInvalidValues}>Dùng giá trị mặc định</Button>}
          />
        )}
        {stock.loading && (
          <Flex justify='center' className='py-8'>
            <Spin aria-label='Đang tải danh sách tồn kho' />
          </Flex>
        )}
        {stock.error && (
          <Alert
            type='error'
            showIcon
            title={stock.error}
            action={<Button onClick={() => retry(stock)}>Thử lại</Button>}
          />
        )}
        {stock.data && (
          <>
            <Typography.Paragraph type='secondary'>
              {appliedAt(stock.data.metadata)}
            </Typography.Paragraph>
            <Table
              rowKey='variantId'
              columns={stockColumns}
              dataSource={stock.data.data}
              pagination={false}
              locale={{
                emptyText:
                  stock.data.metadata.stockStatus === "out"
                    ? "Không có SKU hết hàng"
                    : "Không có SKU sắp hết hàng"
              }}
            />
            <Flex justify='space-between' align='center' className='mt-4'>
              <Typography.Text>Tổng {stock.data.total} SKU</Typography.Text>
              <Pagination
                locale={viVN.Pagination}
                current={url.query.page}
                pageSize={url.query.pageSize}
                total={stock.data.total}
                showSizeChanger={{ "aria-label": "Số SKU mỗi trang" }}
                pageSizeOptions={[10, 20, 50]}
                onChange={(page, pageSize) =>
                  changeStock(pageSize !== url.query.pageSize ? { pageSize } : { page })
                }
              />
            </Flex>
          </>
        )}
      </section>
    </section>
  );
}

function SummaryCards({
  summary,
  stockStatus,
  onSelectStock
}: {
  summary: DashboardSummary;
  stockStatus: StockStatus;
  onSelectStock: (status: StockStatus) => void;
}) {
  const { orders, catalog } = summary;
  const card = (title: string, value: number, hoverable = true) => (
    <Card size='small' hoverable={hoverable} className='h-full'>
      <Statistic title={title} value={value} />
    </Card>
  );
  const items: [string, number, string | StockStatus | null][] = [
    ["Đơn chờ xử lý", orders.pending, `${PATH.ORDER}?status=pending`],
    ["Đơn chờ giao hàng", orders.awaitingShipment, `${PATH.ORDER}?status=confirmed`],
    ["Chờ chuyển khoản", orders.awaitingTransfer, `${PATH.PAYMENTS}?attention=awaiting-transfer`],
    ["Cần hoàn tiền", orders.refundNeeded, `${PATH.PAYMENTS}?attention=refund-needed`],
    // Catalog management is not implemented yet: these counts are summaries only.
    ["Sản phẩm đang bán", catalog.publishedProducts, null],
    ["SKU đang bán", catalog.activeSkus, null],
    ["SKU sắp hết hàng", catalog.lowStockSkus, "low"],
    ["SKU hết hàng", catalog.outOfStockSkus, "out"]
  ];
  return (
    <>
      <Row gutter={[16, 16]}>
        {items.map(([title, value, target]) => (
          <Col key={title} xs={24} sm={12} lg={6}>
            {target === "low" || target === "out" ? (
              <button
                type='button'
                className='w-full h-full text-left cursor-pointer'
                aria-label={`${title}: ${value}`}
                aria-pressed={stockStatus === target}
                onClick={() => onSelectStock(target)}
              >
                {card(title, value)}
              </button>
            ) : target ? (
              <Link to={target} aria-label={`${title}: ${value}`}>
                {card(title, value)}
              </Link>
            ) : (
              card(title, value, false)
            )}
          </Col>
        ))}
      </Row>
      <Typography.Paragraph type='secondary' className='mt-2'>
        {appliedAt(summary.metadata)}
      </Typography.Paragraph>
    </>
  );
}

function ThresholdForm({
  committed,
  busy,
  onApply
}: {
  committed: string;
  busy: boolean;
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(committed);
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    setInvalid(!validThreshold(value));
    if (validThreshold(value)) onApply(value);
  };
  return (
    <form onSubmit={submit}>
      <Flex gap={8} align='center'>
        <label htmlFor='low-stock-threshold'>Ngưỡng tồn kho thấp</label>
        <Input
          id='low-stock-threshold'
          inputMode='numeric'
          style={{ width: 96 }}
          value={draft}
          status={invalid ? "error" : undefined}
          aria-invalid={invalid}
          aria-describedby={invalid ? "low-stock-threshold-error" : undefined}
          onChange={event => setDraft(event.target.value)}
        />
        {/* A changed draft may supersede a pending read; the same value would only duplicate it. */}
        <Button htmlType='submit' disabled={busy && draft.trim() === committed}>
          Áp dụng
        </Button>
      </Flex>
      {invalid && (
        <Typography.Text type='danger' id='low-stock-threshold-error'>
          {thresholdError}
        </Typography.Text>
      )}
    </form>
  );
}
