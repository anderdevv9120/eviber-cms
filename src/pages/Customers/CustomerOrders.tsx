import { useEffect, useState } from "react";
import { Alert, Button, Flex, Pagination, Spin, Table, Tag, Typography } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useLocation } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getCustomerOrdersAPI,
  getGuestBuyerOrdersAPI,
  type CustomerListResult,
  type CustomerOrderRow
} from "@/services/customers";
import {
  formatOrderAmount,
  formatOrderDate,
  orderStatusLabels,
  paymentStatusLabels
} from "@/pages/Orders/order-display";
import { getErrorMessage } from "@/utils/getErrorMessage";

type Buyer = { kind: "registered"; id: string } | { kind: "guest"; email: string };
export default function CustomerOrders({ buyer }: { buyer: Buyer }) {
  const identity = buyer.kind === "registered" ? buyer.id : buyer.email;
  return <OrderHistory key={`${buyer.kind}:${identity}`} kind={buyer.kind} identity={identity} />;
}
function OrderHistory({ kind, identity }: { kind: Buyer["kind"]; identity: string }) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const [query, setQuery] = useState({ page: 1, pageSize: 10, attempt: 0 });
  const key = `${query.page}:${query.pageSize}:${query.attempt}`;
  const [view, setView] = useState<{
    key: string;
    result?: CustomerListResult<CustomerOrderRow>;
    error?: string;
  }>({ key });
  useEffect(() => {
    const controller = new AbortController();
    const fetchPage = async (page: number) => {
      const { data } = await (
        kind === "registered" ? getCustomerOrdersAPI : getGuestBuyerOrdersAPI
      )(identity, { page, pageSize: query.pageSize }, controller.signal);
      if (
        !data ||
        !Array.isArray(data.data) ||
        !Number.isSafeInteger(data.total) ||
        data.total < 0 ||
        !Number.isSafeInteger(data.totalPage) ||
        data.totalPage < 0 ||
        data.page !== page ||
        data.pageSize !== query.pageSize
      )
        throw new Error("Không nhận được lịch sử mua hàng hợp lệ");
      return data;
    };
    const read = async () => {
      try {
        let result = await fetchPage(query.page);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, result.totalPage);
        if (query.page > lastPage) result = await fetchPage(lastPage);
        if (!controller.signal.aborted) setView({ key, result });
      } catch (cause) {
        if (!controller.signal.aborted) setView({ key, error: getErrorMessage(cause) });
      }
    };
    read().catch(() => {
      /* Read failures are displayed inline. */
    });
    return () => controller.abort();
  }, [kind, identity, key, query.page, query.pageSize]);
  const current = view.key === key ? view : undefined;
  const result = current?.result;
  const reload = () => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }));
  return (
    <section aria-label='Lịch sử mua hàng' className='mt-6'>
      <Typography.Title level={3}>Lịch sử mua hàng</Typography.Title>
      {!result && !current?.error && <Spin aria-label='Đang tải lịch sử mua hàng' />}
      {current?.error && (
        <Alert
          type='error'
          showIcon
          title={current.error}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      )}
      {result && (
        <>
          <Table<CustomerOrderRow>
            rowKey='_id'
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Chưa có đơn hàng" }}
            columns={[
              {
                title: "Đơn hàng",
                key: "order",
                render: (_, row) => (
                  <Link
                    to={`${PATH.ORDER}/${encodeURIComponent(row._id)}?${new URLSearchParams({ returnTo })}`}
                  >
                    {row.orderNumber?.trim() || "Chi tiết đơn hàng"}
                  </Link>
                )
              },
              {
                title: "Ngày tạo",
                key: "date",
                render: (_, row) => formatOrderDate(row.created_at)
              },
              {
                title: "Tổng tiền",
                key: "total",
                render: (_, row) =>
                  formatOrderAmount(row.checkoutInfo?.totalPrice, row.checkoutInfo?.currency)
              },
              {
                title: "Trạng thái đơn hàng",
                key: "status",
                render: (_, row) => <Tag>{orderStatusLabels[row.status] ?? "—"}</Tag>
              },
              {
                title: "Thanh toán",
                key: "payment",
                render: (_, row) => (
                  <Tag>
                    {row.paymentStatus ? (paymentStatusLabels[row.paymentStatus] ?? "—") : "—"}
                  </Tag>
                )
              }
            ]}
          />
          <Flex justify='space-between' align='center' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {result.total} đơn hàng</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={result.page}
              pageSize={result.pageSize}
              total={result.total}
              pageSizeOptions={[10, 20, 50]}
              showSizeChanger={{ "aria-label": "Số đơn hàng mỗi trang" }}
              onChange={(page, pageSize) =>
                setQuery({
                  page: pageSize === query.pageSize ? page : 1,
                  pageSize,
                  attempt: query.attempt + 1
                })
              }
            />
          </Flex>
        </>
      )}
    </section>
  );
}
