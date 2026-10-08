import { Table, Typography, type TableColumnsType } from "antd";
import type { AdminOrderDetail, PaymentHistoryEntry, StatusHistoryEntry } from "@/services/orders";
import {
  displayOrderText,
  formatOrderDate,
  legacyPaymentActionLabel,
  missingOrderData,
  orderActorLabels,
  orderStatusLabels,
  paymentActionLabels,
  paymentStatusLabels
} from "./order-display";

const commonColumns = [
  { title: "Thời gian", key: "time", render: (_, entry) => formatOrderDate(entry.changedAt) },
  {
    title: "Người thực hiện",
    key: "actor",
    render: (_, entry) =>
      entry.changedBy ? (
        <>
          <div>{orderActorLabels[entry.changedBy.actorType]}</div>
          <div>{displayOrderText(entry.changedBy.actorName)}</div>
          <div>{displayOrderText(entry.changedBy.actorId)}</div>
        </>
      ) : (
        missingOrderData
      )
  },
  { title: "Ghi chú", key: "note", render: (_, entry) => displayOrderText(entry.note) }
] satisfies TableColumnsType<StatusHistoryEntry | PaymentHistoryEntry>;

export default function OrderHistory({ order }: { order: AdminOrderDetail }) {
  return (
    <>
      <section aria-label='Lịch sử đơn hàng' className='mt-6'>
        <Typography.Title level={3}>Lịch sử đơn hàng</Typography.Title>
        {order.statusHistory?.length ? (
          <Table<StatusHistoryEntry>
            pagination={false}
            dataSource={order.statusHistory.map((entry, key) => ({ ...entry, key }))}
            columns={[
              {
                title: "Trạng thái",
                key: "status",
                render: (_, entry) => orderStatusLabels[entry.status]
              },
              ...commonColumns
            ]}
          />
        ) : (
          <p>Chưa ghi nhận lịch sử</p>
        )}
      </section>
      <section aria-label='Lịch sử thanh toán' className='mt-6'>
        <Typography.Title level={3}>Lịch sử thanh toán</Typography.Title>
        {order.paymentHistory?.length ? (
          <Table<PaymentHistoryEntry>
            pagination={false}
            dataSource={order.paymentHistory.map((entry, key) => ({ ...entry, key }))}
            columns={[
              {
                title: "Trạng thái",
                key: "status",
                render: (_, entry) => paymentStatusLabels[entry.status]
              },
              {
                title: "Thao tác",
                key: "action",
                render: (_, entry) =>
                  entry.action
                    ? paymentActionLabels[entry.action]
                    : entry.status === "not_required"
                      ? paymentStatusLabels.not_required
                      : legacyPaymentActionLabel
              },
              ...commonColumns,
              {
                title: "Mã tham chiếu",
                key: "reference",
                render: (_, entry) => displayOrderText(entry.reference)
              }
            ]}
          />
        ) : (
          <p>Chưa ghi nhận lịch sử</p>
        )}
      </section>
    </>
  );
}
