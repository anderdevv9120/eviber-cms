import { Flex, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { DailySales } from "@/services/reports";
import { formatOrderAmount } from "../Orders/order-display";
import { calendarLabel } from "./report-query";

const unavailable = "Không có số liệu";
// Paid orders with no valid money (all excluded) are unavailable, not a real zero.
const amountOn = (day: DailySales, currency: string) =>
  day.paidOrderValue.find(total => total.currency === currency)?.amount ??
  (day.paidOrderValue.length || !day.paidOrderCount ? 0 : null);
const amountText = (amount: number | null, currency: string) =>
  amount === null ? unavailable : formatOrderAmount(amount, currency);

/**
 * One bar chart per currency, each on its own scale, because unlike currencies never share an
 * axis. Axis labels stay in HTML so the stretched SVG never distorts text when resized.
 */
export default function DailySalesChart({ daily }: { daily: DailySales[] }) {
  const currencies = [
    ...new Set(daily.flatMap(day => day.paidOrderValue.map(total => total.currency)))
  ].sort();
  const charts = currencies
    .map(currency => ({ currency, values: daily.map(day => amountOn(day, currency)) }))
    .filter(chart => Math.max(...chart.values.map(Number)) > 0);
  const columns: TableColumnsType<DailySales> = [
    { title: "Ngày", dataIndex: "date", render: calendarLabel },
    { title: "Đơn đã thanh toán", dataIndex: "paidOrderCount" },
    { title: "Số lượng đã bán", dataIndex: "unitsSold" },
    ...currencies.map(currency => ({
      title: `Giá trị (${currency})`,
      key: currency,
      render: (_: unknown, day: DailySales) => amountText(amountOn(day, currency), currency)
    }))
  ];

  return (
    <>
      {charts.length === 0 && (
        <Typography.Paragraph type='secondary'>
          Không có giá trị đơn đã thanh toán trong khoảng này
        </Typography.Paragraph>
      )}
      {charts.map(({ currency, values }) => {
        const max = Math.max(...values.map(Number));
        return (
          <figure key={currency} className='mb-6'>
            <Flex justify='space-between'>
              <Typography.Text strong>{currency}</Typography.Text>
              <Typography.Text type='secondary'>
                Cao nhất {formatOrderAmount(max, currency)}
              </Typography.Text>
            </Flex>
            <svg
              role='img'
              aria-label={`Biểu đồ cột giá trị đơn đã thanh toán theo ngày (${currency}); số liệu chi tiết trong bảng bên dưới`}
              viewBox={`0 0 ${values.length} 100`}
              preserveAspectRatio='none'
              className='block w-full h-40 border-b border-slate-300 text-blue-600'
            >
              {values.map((value, index) => {
                const height = (Number(value) / max) * 100;
                return (
                  <rect
                    key={daily[index].date}
                    x={index + 0.1}
                    y={100 - height}
                    width={0.8}
                    height={height}
                    fill='currentColor'
                  >
                    <title>
                      {`${calendarLabel(daily[index].date)}: ${amountText(value, currency)}`}
                    </title>
                  </rect>
                );
              })}
            </svg>
            <Flex justify='space-between'>
              <Typography.Text type='secondary'>{calendarLabel(daily[0].date)}</Typography.Text>
              <Typography.Text type='secondary'>
                {calendarLabel(daily[daily.length - 1].date)}
              </Typography.Text>
            </Flex>
          </figure>
        );
      })}
      <Table rowKey='date' size='small' columns={columns} dataSource={daily} pagination={false} />
    </>
  );
}
