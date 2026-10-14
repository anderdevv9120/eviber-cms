import { useState } from "react";
import { Alert, Button, Descriptions, Drawer, Flex, Spin, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { generatePath, Link } from "react-router";
import { PATH } from "@/constants/paths";
import {
  getInventoryMovementsAPI,
  type InventoryMovement,
  type InventoryMovementList,
  type StockMovementReason
} from "@/services/inventory";
import { useKeyedRead } from "@/pages/Dashboard/useKeyedRead";
import { formatOrderDate } from "@/pages/Orders/order-display";
import { ApiError } from "@/utils/request";
import { INVENTORY_ERROR } from "./inventory-errors";

const PAGE_SIZE = 10;
const GONE_MESSAGE = "Biến thể không còn tồn tại hoặc sản phẩm đã bị xoá.";
const reasonLabels: Record<StockMovementReason, string> = {
  order: "Đơn hàng",
  cancel_restock: "Hoàn kho huỷ đơn",
  return: "Hoàn trả",
  manual_adjust: "Điều chỉnh tay"
};

interface Props {
  variantId: string;
  open: boolean;
  onClose: () => void;
  /** Changing it refetches page 1. */
  refreshKey: number;
}

/** The variant (or its product) was deleted: a state of its own, not a failed read. */
type Gone = { gone: true };

// The read key is `variantId:page:refreshKey`; a new refreshKey re-reads like a new page.
async function loadMovements(
  key: string,
  signal: AbortSignal
): Promise<InventoryMovementList | Gone> {
  const [variantId, page] = key.split(":");
  try {
    const { data } = await getInventoryMovementsAPI(
      variantId,
      { page: Number(page), pageSize: PAGE_SIZE },
      signal
    );
    if (!data || !Array.isArray(data.data) || !data.variant)
      throw new Error("Không nhận được lịch sử tồn kho hợp lệ. Vui lòng thử lại.");
    return data;
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      (cause.errors?.code === INVENTORY_ERROR.VARIANT_NOT_FOUND || cause.status === 404)
    )
      return { gone: true };
    throw cause;
  }
}

const signed = (delta: number) => `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;

const columns: TableColumnsType<InventoryMovement> = [
  {
    title: "Thời gian",
    key: "createdAt",
    render: (_, { createdAt }) => formatOrderDate(createdAt)
  },
  {
    title: "Lý do",
    key: "reason",
    render: (_, { reason }) => <Tag>{reasonLabels[reason] ?? reason}</Tag>
  },
  {
    title: "Thay đổi",
    key: "delta",
    render: (_, { delta }) => (
      <Typography.Text type={delta > 0 ? "success" : "danger"}>{signed(delta)}</Typography.Text>
    )
  },
  { title: "Tồn sau", dataIndex: "stockAfter" },
  { title: "Người thực hiện", key: "actor", render: (_, { actor }) => actor?.name ?? "—" },
  { title: "Ghi chú", key: "note", render: (_, { note }) => note ?? "—" },
  {
    title: "Đơn hàng",
    key: "order",
    render: (_, { order }) =>
      order ? (
        <Link to={generatePath(PATH.ORDER_DETAIL, { orderId: order.id })}>{order.orderNumber}</Link>
      ) : (
        "—"
      )
  }
];

export default function StockHistoryDrawer({ variantId, open, onClose, refreshKey }: Props) {
  // A refreshKey newer than the page choice resets to page 1.
  const [choice, setChoice] = useState({ page: 1, refreshKey });
  const page = choice.refreshKey === refreshKey ? choice.page : 1;
  const { data, error, loading, reload } = useKeyedRead(
    `${variantId}:${page}:${refreshKey}`,
    loadMovements
  );
  const list = data && "gone" in data ? null : data;
  const retry = () => {
    reload().catch(() => {
      // The read displays its own failure and offers another retry.
    });
  };

  return (
    <Drawer title='Lịch sử tồn kho' open={open} onClose={onClose} size={800}>
      {loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải lịch sử tồn kho' />
        </Flex>
      )}
      {data && !list && <Alert type='warning' showIcon title={GONE_MESSAGE} />}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={retry}>Thử lại</Button>}
        />
      )}
      {list && (
        <Flex vertical gap={16}>
          <Descriptions
            column={2}
            size='small'
            items={[
              { key: "product", label: "Sản phẩm", children: list.variant.productName },
              {
                key: "labels",
                label: "Thuộc tính",
                children: list.variant.attributeLabels.join(" / ") || "—"
              },
              { key: "sku", label: "SKU", children: list.variant.sku },
              {
                key: "stock",
                label: "Tồn kho hiện tại",
                children: <strong>{list.variant.inventoryCount}</strong>
              }
            ]}
          />
          <Table
            rowKey='id'
            columns={columns}
            dataSource={list.data}
            scroll={{ x: 700 }}
            locale={{ emptyText: "Chưa có biến động tồn kho" }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: list.total,
              showSizeChanger: false,
              hideOnSinglePage: true,
              onChange: next => setChoice({ page: next, refreshKey })
            }}
          />
        </Flex>
      )}
    </Drawer>
  );
}
