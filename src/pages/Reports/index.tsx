import { useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Radio,
  Row,
  Spin,
  Switch,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import DataTable from "@/components/DataTable";
import { useSearchParams } from "react-router";
import dayjs, { type Dayjs } from "dayjs";
import {
  getSalesReportAPI,
  type BestSellingProduct,
  type BestSellingSku,
  type CurrencyTotal,
  type SalesReport,
  type SalesReportQuery
} from "@/services/reports";
import {
  formatOrderAmount,
  formatOrderDate,
  orderStatusLabels,
  paymentStatusLabels
} from "../Orders/order-display";
import { useKeyedRead } from "@/hooks/useKeyedRead";
import DailySalesChart from "./DailySalesChart";
import {
  calendarLabel,
  parseReportQuery,
  reportPresetRange,
  reportRangeErrors,
  serializeReportQuery,
  vietnamToday,
  type ReportPreset
} from "./report-query";

async function loadReport(key: string, signal: AbortSignal) {
  const params = new URLSearchParams(key);
  const query: SalesReportQuery = {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    deliveredOnly: params.get("deliveredOnly") === "true"
  };
  const { data } = await getSalesReportAPI(query, signal);
  if (
    !data?.metadata ||
    !Array.isArray(data.daily) ||
    !Array.isArray(data.topProducts) ||
    !Array.isArray(data.topSkus)
  )
    throw new Error("Không nhận được báo cáo hợp lệ. Vui lòng thử lại.");
  return data;
}

const presetLabels: Record<ReportPreset | "custom", string> = {
  today: "Hôm nay",
  last7: "7 ngày gần nhất",
  month: "Tháng này",
  custom: "Tùy chọn"
};
const presetOf = ({ from, to }: SalesReportQuery, today: string) =>
  (["today", "last7", "month"] as const).find(preset => {
    const range = reportPresetRange(preset, today);
    return range.from === from && range.to === to;
  }) ?? "custom";
const unknownLabel = "Không xác định";
const reportDateFormat = "DD/MM/YYYY";
// The draft keeps YYYY-MM-DD calendar strings; dayjs exists only at the picker boundary.
const pickerDay = (date: string) => (date ? dayjs(date) : null);
const draftDay = (date?: Dayjs | null) => date?.format("YYYY-MM-DD") ?? "";

/** A missing amount list is a real zero only when nothing was counted. */
function Money({
  totals,
  count,
  unavailable
}: {
  totals: CurrencyTotal[];
  count: number;
  unavailable: string;
}) {
  if (!totals.length) return count === 0 ? "0" : unavailable;
  return totals.map(total => (
    <div key={total.currency}>{formatOrderAmount(total.amount, total.currency)}</div>
  ));
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  // The default period stays fixed while the page is open, so its read key does too.
  const [today] = useState(() => vietnamToday());
  const url = parseReportQuery(params, today);
  const committedKey = url.query && serializeReportQuery(url.query).toString();
  const report = useKeyedRead(committedKey, loadReport);

  const refresh = () => {
    report.reload().catch(() => {
      // The page displays the read failure and offers another retry.
    });
  };
  const apply = (query: SalesReportQuery) => {
    const next = serializeReportQuery(query);
    // Applying the committed filters again is an explicit refresh.
    if (next.toString() === committedKey) refresh();
    else setParams(next);
  };

  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center' wrap gap={12}>
        <Typography.Title level={2}>Báo cáo bán hàng</Typography.Title>
        <Button onClick={refresh} disabled={report.loading || !committedKey}>
          Tải lại
        </Button>
      </Flex>
      <ReportFilters
        key={committedKey ?? "invalid"}
        committed={url.query ?? { ...reportPresetRange("month", today), deliveredOnly: false }}
        today={today}
        pending={report.loading}
        onApply={apply}
      />
      <Typography.Paragraph type='secondary'>
        Báo cáo tính các đơn theo ngày tạo đơn (giờ Việt Nam) với trạng thái hiện tại. Hoàn tiền,
        hủy, trả hàng hoặc điều chỉnh thanh toán sau này có thể làm thay đổi số liệu của kỳ đã qua.
        Bộ lọc giao hàng chỉ áp dụng cho đơn đã thanh toán, số lượng bán, biểu đồ và sản phẩm bán
        chạy; đơn đã đặt, các bảng trạng thái, đơn đã hoàn tiền toàn bộ, Đã thu, Đã hoàn và Thực thu
        luôn tính trên mọi đơn tạo trong khoảng.
      </Typography.Paragraph>
      {url.errors.length > 0 && (
        <Alert
          className='mb-4'
          type='warning'
          showIcon
          title='Bộ lọc báo cáo trên đường dẫn không hợp lệ'
          description={
            <ul>
              {url.errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          }
          action={
            <Button onClick={() => setParams(new URLSearchParams())}>Dùng giá trị mặc định</Button>
          }
        />
      )}
      {report.loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải báo cáo' />
        </Flex>
      )}
      {report.error && (
        <Alert
          type='error'
          showIcon
          title={report.error}
          action={<Button onClick={refresh}>Thử lại</Button>}
        />
      )}
      {report.data && <ReportBody report={report.data} />}
    </section>
  );
}

function ReportFilters({
  committed,
  today,
  pending,
  onApply
}: {
  committed: SalesReportQuery;
  today: string;
  pending: boolean;
  onApply: (query: SalesReportQuery) => void;
}) {
  const [draft, setDraft] = useState(committed);
  const [custom, setCustom] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const preset = custom ? "custom" : presetOf(draft, today);
  const unchanged =
    serializeReportQuery(draft).toString() === serializeReportQuery(committed).toString();

  const choosePreset = (value: ReportPreset | "custom") => {
    setCustom(value === "custom");
    if (value !== "custom") setDraft({ ...draft, ...reportPresetRange(value, today) });
  };
  const changeDates = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setCustom(true);
    setDraft({ ...draft, from: draftDay(dates?.[0]), to: draftDay(dates?.[1]) });
  };
  // Dates are validated on submit only, so a half-entered custom range never reads.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rangeErrors = reportRangeErrors(draft.from, draft.to);
    setErrors(rangeErrors);
    if (!rangeErrors.length) onApply(draft);
  };

  return (
    <form onSubmit={submit} className='mb-4'>
      <Flex wrap gap={12} align='center'>
        <Radio.Group
          aria-label='Khoảng thời gian'
          optionType='button'
          value={preset}
          onChange={event => choosePreset(event.target.value)}
          options={Object.entries(presetLabels).map(([value, label]) => ({ value, label }))}
        />
        <label htmlFor='report-from' className='sr-only'>
          Từ ngày
        </label>
        <label htmlFor='report-to' className='sr-only'>
          Đến ngày
        </label>
        <DatePicker.RangePicker
          id={{ start: "report-from", end: "report-to" }}
          format={reportDateFormat}
          placeholder={["Từ ngày", "Đến ngày"]}
          needConfirm={false}
          value={[pickerDay(draft.from), pickerDay(draft.to)]}
          status={errors.length > 0 ? "error" : undefined}
          onChange={changeDates}
        />
        <Flex gap={8} align='center'>
          <Switch
            id='report-delivered-only'
            checked={draft.deliveredOnly}
            onChange={deliveredOnly => setDraft({ ...draft, deliveredOnly })}
          />
          <label htmlFor='report-delivered-only'>Chỉ đơn đã giao</label>
        </Flex>
        {/* A changed draft may supersede a pending read; the same filters would only duplicate it. */}
        <Button type='primary' htmlType='submit' disabled={pending && unchanged}>
          Áp dụng
        </Button>
      </Flex>
      {errors.length > 0 && (
        <div role='alert' className='mt-2'>
          {errors.map(error => (
            <Typography.Text key={error} type='danger' className='block'>
              {error}
            </Typography.Text>
          ))}
        </div>
      )}
    </form>
  );
}

function Metric({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Col xs={24} sm={12} lg={6}>
      <Card size='small' role='group' aria-label={title} className='h-full'>
        <Typography.Text type='secondary'>{title}</Typography.Text>
        <div className='text-xl font-semibold'>{children}</div>
      </Card>
    </Col>
  );
}

function ReportBody({ report }: { report: SalesReport }) {
  const { metadata, excludedMonetaryData: excluded } = report;
  const fulfillment = [
    ...Object.entries(orderStatusLabels).map(([status, label]) => ({
      label,
      count: report.fulfillmentStatuses[status as keyof typeof orderStatusLabels] ?? 0
    })),
    { label: unknownLabel, count: report.fulfillmentStatuses.unknown ?? 0 }
  ];
  const payment = [
    ...Object.entries(paymentStatusLabels).map(([status, label]) => ({
      label,
      count: report.paymentStatuses[status as keyof typeof paymentStatusLabels] ?? 0
    })),
    { label: unknownLabel, count: report.paymentStatuses.unknown ?? 0 }
  ];

  return (
    <>
      <Typography.Paragraph type='secondary'>
        {`Khoảng ${calendarLabel(metadata.from)} – ${calendarLabel(metadata.to)} (giờ Việt Nam) · ${
          metadata.deliveredOnly ? "Chỉ đơn đã giao" : "Tất cả đơn đủ điều kiện"
        } · Cập nhật lúc ${formatOrderDate(metadata.generatedAt)}`}
      </Typography.Paragraph>
      <Row gutter={[16, 16]} className='mb-4'>
        <Metric title='Đơn đã đặt'>{report.ordersPlaced}</Metric>
        <Metric title='Đơn đã thanh toán'>{report.paidOrderCount}</Metric>
        <Metric title='Số lượng đã bán'>{report.unitsSold}</Metric>
        <Metric title='Giá trị gộp đơn đã thanh toán'>
          <Money
            totals={report.paidOrderValue}
            count={report.paidOrderCount}
            unavailable='Không có số liệu tiền hợp lệ'
          />
        </Metric>
        <Metric title='Đã thu'>
          <Money
            totals={report.receivedOrderValue}
            count={excluded.receivedOrders}
            unavailable='Không có số liệu tiền hợp lệ'
          />
        </Metric>
        <Metric title='Đã hoàn'>
          <Money
            totals={report.refundedOrderValue}
            count={excluded.refundedOrders}
            unavailable='Không có số liệu tiền hợp lệ'
          />
        </Metric>
        <Metric title='Thực thu'>
          <Money
            totals={report.netReceivedOrderValue}
            count={excluded.receivedOrders + excluded.refundedOrders}
            unavailable='Không có số liệu tiền hợp lệ'
          />
        </Metric>
        <Metric title='Đơn đã hoàn tiền toàn bộ'>
          <div>{report.refundedOrderCount}</div>
        </Metric>
      </Row>
      <Typography.Paragraph type='secondary'>
        Giá trị gộp đơn đã thanh toán là tổng tiền cuối của các đơn đang ở trạng thái đã thanh toán
        (sau giảm giá, gồm phí vận chuyển), chưa trừ hoàn một phần. Đã thu, Đã hoàn và Thực thu dùng
        số tiền đã ghi nhận trên mọi đơn tạo trong khoảng, kể cả đơn hủy, trả hàng và hoàn tiền; bộ
        lọc giao hàng không áp dụng cho ba tổng này. Mỗi loại tiền tệ được cộng riêng.
      </Typography.Paragraph>
      {(excluded.paidOrders > 0 ||
        excluded.refundedOrders > 0 ||
        excluded.receivedOrders > 0 ||
        excluded.items > 0) && (
        <Alert
          className='mb-4'
          type='warning'
          showIcon
          title={`Không tính vào tổng tiền do thiếu hoặc sai dữ liệu: ${excluded.paidOrders} đơn đã thanh toán, ${excluded.refundedOrders} đơn đã hoàn tiền, ${excluded.receivedOrders} đơn thu tiền, ${excluded.items} sản phẩm trong đơn.`}
        />
      )}

      <section aria-label='Giá trị đơn đã thanh toán theo ngày' className='mb-6'>
        <Typography.Title level={3}>Giá trị gộp đơn đã thanh toán theo ngày</Typography.Title>
        <DailySalesChart daily={report.daily} />
      </section>

      <Row gutter={[16, 16]} className='mb-6'>
        <Col xs={24} lg={12}>
          <StatusTable title='Trạng thái giao hàng' rows={fulfillment} />
        </Col>
        <Col xs={24} lg={12}>
          <StatusTable title='Trạng thái thanh toán' rows={payment} />
        </Col>
      </Row>
      <Typography.Paragraph type='secondary'>
        Hai bảng trạng thái mô tả cùng các đơn đã đặt theo hai góc độ; không cộng số liệu giữa hai
        bảng.
      </Typography.Paragraph>

      <Typography.Paragraph type='secondary'>
        Xếp theo số lượng bán, gồm đơn không cần thanh toán. Giá trị hàng hóa tính theo giá lúc đặt,
        trước giảm giá voucher của đơn và không gồm phí vận chuyển. Số lượng và giá trị hàng hóa gộp
        chưa trừ các sản phẩm được hoàn tiền.
      </Typography.Paragraph>
      <BestSellers
        title='Sản phẩm bán chạy'
        empty='Không có sản phẩm bán ra'
        rows={report.topProducts}
      />
      <BestSellers title='SKU bán chạy' empty='Không có SKU bán ra' rows={report.topSkus} />
    </>
  );
}

function StatusTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <section aria-label={title}>
      <Typography.Title level={4}>{title}</Typography.Title>
      <DataTable
        rowKey='label'
        size='small'
        pagination={false}
        dataSource={rows}
        columns={[
          { title: "Trạng thái", dataIndex: "label" },
          { title: "Số đơn", dataIndex: "count" }
        ]}
      />
    </section>
  );
}

type BestSellerRow = BestSellingProduct | BestSellingSku;
const sellerId = (row: BestSellerRow) => ("productId" in row ? row.productId : row.variantId);
function BestSellers({
  title,
  empty,
  rows
}: {
  title: string;
  empty: string;
  rows: BestSellerRow[];
}) {
  const columns: TableColumnsType<BestSellerRow> = [
    { title: "#", key: "rank", render: (_, __, index) => index + 1 },
    {
      title: "Tên",
      key: "label",
      render: (_, row) => (row.missingLabel ? <Tag>Thiếu tên</Tag> : row.label)
    },
    { title: "Mã", key: "id", render: (_, row) => sellerId(row) },
    { title: "Số lượng", dataIndex: "unitsSold" },
    {
      title: "Giá trị hàng hóa gộp",
      key: "value",
      render: (_, row) => (
        <Money totals={row.merchandiseValue} count={row.unitsSold} unavailable='Không có số liệu' />
      )
    }
  ];
  return (
    <section aria-label={title} className='mb-6'>
      <Typography.Title level={3}>{title}</Typography.Title>
      <DataTable
        rowKey={sellerId}
        size='small'
        pagination={false}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: empty }}
      />
    </section>
  );
}
