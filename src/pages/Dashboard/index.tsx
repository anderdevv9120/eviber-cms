import type { ReactNode } from "react";
import { Alert, Button, Card, Flex, Spin, Typography } from "antd";
import {
  CarOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  RightOutlined,
  RollbackOutlined
} from "@ant-design/icons";
import { Link } from "react-router";
import { PATH } from "@/constants/paths";
import { useKeyedRead } from "@/hooks/useKeyedRead";
import { getDashboardAPI, type DashboardSummary } from "@/services/reports";

async function loadSummary(_key: string, signal: AbortSignal) {
  const { data } = await getDashboardAPI(signal);
  if (!data?.metadata || !data.orders || !data.catalog)
    throw new Error("Không nhận được số liệu tổng quan hợp lệ. Vui lòng thử lại.");
  return data;
}

// Cùng tập SKU với số đếm: biến thể đang bán của sản phẩm đã xuất bản
const stockLink = (stock: "low" | "out") =>
  `${PATH.INVENTORY}?${new URLSearchParams({ productStatus: "PUBLISH", variantStatus: "ACTIVE", stock })}`;

const TONE = {
  warning: "bg-(--ant-color-warning-bg) text-(--ant-color-warning)",
  info: "bg-(--ant-color-primary-bg) text-(--ant-color-primary-text)",
  error: "bg-(--ant-color-error-bg) text-(--ant-color-error)"
} as const;

const formatCount = (value: number) => value.toLocaleString("vi-VN");

export default function Dashboard() {
  const summary = useKeyedRead("summary", loadSummary);

  const refresh = () => {
    summary.reload().catch(() => {
      // The section displays its read failure and offers another retry.
    });
  };

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
        <Button onClick={refresh} disabled={summary.loading}>
          Tải lại
        </Button>
      </Flex>
      <section aria-label='Tình trạng hiện tại'>
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
            action={<Button onClick={refresh}>Thử lại</Button>}
          />
        )}
        {summary.data && <SummaryCards summary={summary.data} />}
      </section>
    </section>
  );
}

function SummaryCards({ summary }: { summary: DashboardSummary }) {
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
      to: `${PATH.ORDER}?attention=awaiting-transfer`,
      icon: <CreditCardOutlined />,
      tone: "info"
    },
    {
      title: "Cần hoàn tiền",
      value: orders.refundNeeded,
      to: `${PATH.ORDER}?attention=refund-needed`,
      icon: <RollbackOutlined />,
      tone: "error"
    }
  ];
  const stats: [string, number, string | null][] = [
    ["Sản phẩm đang bán", catalog.publishedProducts, null],
    ["SKU đang bán", catalog.activeSkus, null],
    ["SKU sắp hết hàng", catalog.lowStockSkus, stockLink("low")],
    ["SKU hết hàng", catalog.outOfStockSkus, stockLink("out")]
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
              <span className='flex items-center gap-2'>
                <span className='text-base font-semibold tabular-nums'>{formatCount(value)}</span>
                {/* Ô trống cùng cỡ mũi tên để số các dòng không link vẫn thẳng cột */}
                <span className='w-3 text-xs text-(--ant-color-text-tertiary)'>
                  {target && <RightOutlined />}
                </span>
              </span>
            </>
          );
          if (!target)
            return (
              <div key={title} className={`${statRow} ${border}`}>
                {content}
              </div>
            );
          return (
            <Link
              key={title}
              to={target}
              className={`${statRow} ${border} text-(--ant-color-text) hover:bg-(--ant-color-fill-quaternary)`}
              aria-label={`${title}: ${value}`}
            >
              {content}
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
