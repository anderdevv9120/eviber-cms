import { useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Pagination,
  Segmented,
  Select,
  Spin,
  Table,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useLocation } from "react-router";
import { PATH } from "@/constants/paths";
import type {
  AdminOrderSummary,
  OrderAttention,
  OrderStatus,
  PaymentStatus
} from "@/services/orders";
import { useOrdersList } from "./useOrdersList";
import { safeOrderReturnTo } from "./order-list-query";
import {
  displayOrderText,
  formatOrderAmount,
  formatOrderDate,
  missingOrderData,
  orderAttentionLabels,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels
} from "./order-display";

const ATTENTION_OPTIONS: { value: OrderAttention | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...(Object.entries(orderAttentionLabels) as [OrderAttention, string][]).map(([value, label]) => ({
    value,
    label
  }))
];

export default function Orders() {
  const { query, result, loading, error, changeQuery, reload } = useOrdersList();
  const location = useLocation();
  const returnTo = safeOrderReturnTo(`${location.pathname}${location.search}`);
  const refresh = () => {
    reload().catch(() => {
      // The hook displays the read failure and offers an explicit retry.
    });
  };
  const columns: TableColumnsType<AdminOrderSummary> = [
    { title: "Mã đơn hàng", key: "number", render: (_, row) => displayOrderText(row.orderNumber) },
    { title: "Ngày tạo", key: "created", render: (_, row) => formatOrderDate(row.created_at) },
    {
      title: "Người nhận",
      key: "recipient",
      render: (_, row) => (
        <>
          <div>{displayOrderText(row.shippingInfo.name)}</div>
          <div>{displayOrderText(row.shippingInfo.phoneNumber)}</div>
        </>
      )
    },
    {
      title: "Tổng tiền",
      key: "total",
      render: (_, row) => formatOrderAmount(row.checkoutInfo.totalPrice, row.checkoutInfo.currency)
    },
    {
      title: "Phương thức thanh toán",
      key: "method",
      render: (_, row) => paymentMethodLabels[row.paymentInfo.method] ?? missingOrderData
    },
    {
      title: "Trạng thái đơn hàng",
      key: "status",
      render: (_, row) => orderStatusLabels[row.status] ?? missingOrderData
    },
    {
      title: "Trạng thái thanh toán",
      key: "payment",
      render: (_, row) =>
        row.paymentStatus ? paymentStatusLabels[row.paymentStatus] : missingOrderData
    },
    {
      title: "Ngày thanh toán",
      key: "paid",
      render: (_, row) => (row.paidAt ? formatOrderDate(row.paidAt) : "—")
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, row) => (
        <Link
          to={`${PATH.ORDER}/${encodeURIComponent(row._id)}?${new URLSearchParams({ returnTo })}`}
        >
          Chi tiết
        </Link>
      )
    }
  ];

  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center'>
        <Typography.Title level={2}>Quản lý Đơn hàng</Typography.Title>
        <Button onClick={refresh} disabled={loading}>
          Tải lại
        </Button>
      </Flex>
      <Segmented<OrderAttention | "">
        aria-label='Lọc đơn cần chú ý'
        className='mb-4'
        value={query.attention ?? ""}
        onChange={attention => changeQuery({ attention: attention || undefined })}
        options={ATTENTION_OPTIONS}
      />
      <Flex gap={12} className='mb-4'>
        <OrderSearch
          key={query.search ?? ""}
          search={query.search ?? ""}
          onSearch={search => changeQuery({ search })}
        />
        <Select<OrderStatus | "">
          aria-label='Lọc trạng thái đơn hàng'
          style={{ minWidth: 200 }}
          value={query.status ?? ""}
          onChange={status => changeQuery({ status: status || undefined })}
          options={[
            { value: "", label: "Tất cả trạng thái đơn hàng" },
            ...Object.entries(orderStatusLabels).map(([value, label]) => ({
              value: value as OrderStatus,
              label
            }))
          ]}
        />
        <Select<PaymentStatus | "">
          aria-label='Lọc trạng thái thanh toán'
          style={{ minWidth: 220 }}
          value={query.paymentStatus ?? ""}
          onChange={paymentStatus => changeQuery({ paymentStatus: paymentStatus || undefined })}
          options={[
            { value: "", label: "Tất cả trạng thái thanh toán" },
            ...Object.entries(paymentStatusLabels).map(([value, label]) => ({
              value: value as PaymentStatus,
              label
            }))
          ]}
        />
      </Flex>
      {loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải danh sách đơn hàng' />
        </Flex>
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={refresh}>Thử lại</Button>}
        />
      )}
      {!loading && result && (
        <>
          <Table
            rowKey='_id'
            columns={columns}
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Không có đơn hàng" }}
          />
          <Flex justify='space-between' align='center' className='mt-4'>
            <Typography.Text>Tổng {result.total} đơn hàng</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={query.pageSize}
              total={result.total}
              showSizeChanger={{ "aria-label": "Số đơn mỗi trang" }}
              pageSizeOptions={[10, 20, 50]}
              onChange={(page, pageSize) =>
                changeQuery(pageSize !== query.pageSize ? { pageSize } : { page })
              }
            />
          </Flex>
        </>
      )}
    </section>
  );
}

function OrderSearch({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState(search);
  return (
    <Input.Search
      aria-label='Tìm đơn hàng'
      placeholder='Mã đơn, tên, email hoặc số điện thoại'
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onSearch={onSearch}
      enterButton='Tìm kiếm'
    />
  );
}
