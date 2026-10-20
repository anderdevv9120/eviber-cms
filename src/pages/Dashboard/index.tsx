import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, Flex, Input, Pagination, Radio, Spin, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import {
  CarOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  RightOutlined,
  RollbackOutlined
} from "@ant-design/icons";
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

const TONE = {
  warning: "bg-(--ant-color-warning-bg) text-(--ant-color-warning)",
  info: "bg-(--ant-color-primary-bg) text-(--ant-color-primary-text)",
  error: "bg-(--ant-color-error-bg) text-(--ant-color-error)"
} as const;

const formatCount = (value: number) => value.toLocaleString("vi-VN");

const stockLabels: Record<StockStatus, string> = { low: "Sắp hết hàng", out: "Hết hàng" };
const stockColumns: TableColumnsType<StockRow> = [
  { title: "Sản phẩm", dataIndex: "productName" },
  { title: "SKU", dataIndex: "sku" },
  { title: "Tồn kho", dataIndex: "inventoryCount" }
];

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
      <Flex justify='space-between' align='end' gap={16} className='mb-5'>
        <div>
          <Typography.Title level={2} className='m-0!'>
            Tổng quan vận hành
          </Typography.Title>
          <Typography.Text type='secondary' className='text-[13px]'>
            Số liệu hiện tại trên mọi ngày; không dùng bộ lọc ngày hay trạng thái giao hàng của báo
            cáo.
          </Typography.Text>
        </div>
        <Button onClick={refresh} disabled={busy}>
          Tải lại
        </Button>
      </Flex>
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
        <Card styles={{ body: { padding: 0 } }} className='overflow-hidden'>
          <Flex
            justify='space-between'
            align='center'
            wrap
            gap={12}
            className='border-b border-(--ant-color-border-secondary) px-5 py-3'
          >
            <Typography.Title level={3} className='m-0! text-base!'>
              Tồn kho cần chú ý
            </Typography.Title>
            <Flex align='center' gap={12} wrap>
              <ThresholdForm
                key={committedThreshold}
                committed={committedThreshold}
                busy={busy}
                onApply={applyThreshold}
              />
              <Radio.Group
                aria-label='Chế độ tồn kho'
                optionType='button'
                value={url.query.stockStatus}
                onChange={event => changeStock({ stockStatus: event.target.value })}
                options={Object.entries(stockLabels).map(([value, label]) => ({ value, label }))}
              />
            </Flex>
          </Flex>
          {url.stockErrors.length > 0 && (
            <Alert
              className='m-4'
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
              className='m-4'
              type='error'
              showIcon
              title={stock.error}
              action={<Button onClick={() => retry(stock)}>Thử lại</Button>}
            />
          )}
          {stock.data && (
            <>
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
              <Flex
                justify='space-between'
                align='center'
                className='border-t border-(--ant-color-border-secondary) px-5 py-3'
              >
                <Typography.Text type='secondary'>Tổng {stock.data.total} SKU</Typography.Text>
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
        </Card>
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
  const tasks: {
    title: string;
    value: number;
    to: string;
    icon: ReactNode;
    tone: keyof typeof TONE;
  }[] = [
    {
      title: "Đơn chờ xử lý",
      value: orders.pending,
      to: `${PATH.ORDER}?status=pending`,
      icon: <ClockCircleOutlined />,
      tone: "warning"
    },
    {
      title: "Đơn chờ giao hàng",
      value: orders.awaitingShipment,
      to: `${PATH.ORDER}?status=confirmed`,
      icon: <CarOutlined />,
      tone: "info"
    },
    {
      title: "Chờ chuyển khoản",
      value: orders.awaitingTransfer,
      to: `${PATH.PAYMENTS}?attention=awaiting-transfer`,
      icon: <CreditCardOutlined />,
      tone: "info"
    },
    {
      title: "Cần hoàn tiền",
      value: orders.refundNeeded,
      to: `${PATH.PAYMENTS}?attention=refund-needed`,
      icon: <RollbackOutlined />,
      tone: "error"
    }
  ];
  // Catalog management is not implemented yet: product counts are summaries only.
  const stats: [string, number, StockStatus | null][] = [
    ["Sản phẩm đang bán", catalog.publishedProducts, null],
    ["SKU đang bán", catalog.activeSkus, null],
    ["SKU sắp hết hàng", catalog.lowStockSkus, "low"],
    ["SKU hết hàng", catalog.outOfStockSkus, "out"]
  ];
  const statRow = "flex w-full items-center justify-between px-5 py-3 text-[13px]";
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5'>
      <Card title='Việc cần xử lý' styles={{ body: { padding: 0 } }}>
        {tasks.map(({ title, value, to, icon, tone }, index) => (
          <Link
            key={title}
            to={to}
            aria-label={`${title}: ${value}`}
            className={`flex items-center gap-3.5 px-5 py-3.5 text-(--ant-color-text) hover:bg-(--ant-color-fill-quaternary) ${index ? "border-t border-(--ant-color-border-secondary)" : ""}`}
          >
            <span className={`grid size-8 place-items-center rounded-lg ${TONE[tone]}`}>
              {icon}
            </span>
            <span className='min-w-11 text-xl font-semibold tabular-nums'>
              {formatCount(value)}
            </span>
            <span>{title}</span>
            <RightOutlined className='ml-auto text-xs text-(--ant-color-text-tertiary)' />
          </Link>
        ))}
      </Card>
      <Card title='Catalog' styles={{ body: { padding: 0 } }}>
        {stats.map(([title, value, target], index) => {
          const border = index ? "border-t border-(--ant-color-border-secondary)" : "";
          const content = (
            <>
              <span className='text-(--ant-color-text-secondary)'>{title}</span>
              <span className='text-base font-semibold tabular-nums'>{formatCount(value)}</span>
            </>
          );
          if (!target)
            return (
              <div key={title} className={`${statRow} ${border}`}>
                {content}
              </div>
            );
          const pressed = stockStatus === target;
          return (
            <button
              key={title}
              type='button'
              className={`${statRow} ${border} cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ant-color-primary) ${pressed ? "bg-(--ant-color-primary-bg) [&>span]:text-(--ant-color-primary-text)!" : "hover:bg-(--ant-color-fill-quaternary)"}`}
              aria-label={`${title}: ${value}`}
              aria-pressed={pressed}
              onClick={() => onSelectStock(target)}
            >
              {content}
            </button>
          );
        })}
      </Card>
    </div>
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
        <label
          htmlFor='low-stock-threshold'
          className='text-[13px] text-(--ant-color-text-secondary)'
        >
          Ngưỡng tồn kho thấp
        </label>
        <Input
          id='low-stock-threshold'
          inputMode='numeric'
          style={{ width: 72 }}
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
