import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Flex, Result, Spin, Table, Tag, Typography } from "antd";
import { Link, useParams, useSearchParams } from "react-router";
import { getOrderAPI, type AdminOrderDetail, type OrderProduct } from "@/services/orders";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { safeOrderReturnTo } from "./order-list-query";
import {
  displayOrderText,
  formatOrderAmount,
  formatOrderDate,
  missingOrderData,
  orderActionLabels,
  orderStatusLabels,
  paymentActionLabels,
  paymentMethodLabels,
  paymentStatusLabels
} from "./order-display";
import OrderHistory from "./OrderHistory";
import OrderActionDialog, { type OrderActionIntent } from "./OrderActionDialog";

export default function OrderDetail() {
  const { orderId = "" } = useParams();
  const [params] = useSearchParams();
  const returnTo = safeOrderReturnTo(
    params.getAll("returnTo").length === 1 ? params.get("returnTo") : null
  );
  return <OrderDetailRead key={orderId} orderId={orderId} returnTo={returnTo} />;
}

function OrderDetailRead({ orderId, returnTo }: { orderId: string; returnTo: string }) {
  const [attempt, setAttempt] = useState(0);
  const [intent, setIntent] = useState<OrderActionIntent | null>(null);
  const [view, setView] = useState<{
    loading: boolean;
    order?: AdminOrderDetail;
    error?: string;
    unavailable?: boolean;
  }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    getOrderAPI(orderId, controller.signal)
      .then(result => {
        if (cancelled) return;
        if (!result.data?._id) throw new Error("Không tải được dữ liệu đơn hàng");
        setView({ loading: false, order: result.data });
      })
      .catch(cause => {
        if (cancelled) return;
        setView({
          loading: false,
          error: getErrorMessage(cause),
          unavailable: cause instanceof ApiError && [400, 404].includes(cause.status ?? 0)
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orderId, attempt]);

  const reload = () => {
    setView({ loading: true });
    setAttempt(value => value + 1);
  };
  const order = view.order;
  const currency = order?.checkoutInfo.currency;
  const amount = (value?: number) => formatOrderAmount(value, currency);

  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center'>
        <Link to={returnTo}>Về danh sách</Link>
        <Button onClick={reload} disabled={view.loading}>
          Tải lại
        </Button>
      </Flex>
      {view.loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải đơn hàng' />
        </Flex>
      )}
      {view.unavailable ? (
        <Result
          status='404'
          title='Đơn hàng không còn khả dụng'
          subTitle='Mã đơn hàng không hợp lệ hoặc đơn hàng không tồn tại.'
        />
      ) : (
        view.error && (
          <Alert
            type='error'
            showIcon
            className='mt-4'
            title={view.error}
            action={<Button onClick={reload}>Thử lại</Button>}
          />
        )
      )}
      {order && (
        <>
          <Typography.Title level={2}>
            Đơn hàng {displayOrderText(order.orderNumber)}
          </Typography.Title>
          <section aria-label='Thông tin đơn hàng'>
            <p>Ngày tạo: {formatOrderDate(order.created_at)}</p>
            <Flex gap={8} className='my-4'>
              <Tag>{orderStatusLabels[order.status]}</Tag>
              <Tag>
                {order.paymentStatus ? paymentStatusLabels[order.paymentStatus] : missingOrderData}
              </Tag>
            </Flex>
            <Flex gap={8} wrap>
              {order.actions.orderStatuses
                .filter(action => action.enabled)
                .map(action => (
                  <Button
                    key={action.status}
                    onClick={() => setIntent({ type: "fulfillment", status: action.status })}
                  >
                    {orderActionLabels[action.status]}
                  </Button>
                ))}
              {order.actions.paymentActions
                .filter(action => action.enabled)
                .map(action => (
                  <Button
                    key={action.action}
                    onClick={() => setIntent({ type: "payment", action: action.action })}
                  >
                    {paymentActionLabels[action.action]}
                  </Button>
                ))}
            </Flex>
          </section>
          <section aria-label='Người nhận'>
            <Typography.Title level={3}>Người nhận</Typography.Title>
            <Descriptions
              bordered
              column={2}
              items={[
                {
                  key: "customer",
                  label: "Loại khách hàng",
                  children: order.userId ? "Khách hàng đăng ký" : "Khách vãng lai"
                },
                {
                  key: "name",
                  label: "Họ tên",
                  children: displayOrderText(order.shippingInfo.name)
                },
                {
                  key: "email",
                  label: "Email",
                  children: displayOrderText(order.shippingInfo.email)
                },
                {
                  key: "phone",
                  label: "Điện thoại",
                  children: displayOrderText(order.shippingInfo.phoneNumber)
                },
                {
                  key: "address",
                  label: "Địa chỉ",
                  span: 2,
                  children: displayOrderText(
                    [
                      order.shippingInfo.specificAddress,
                      order.shippingInfo.ward,
                      order.shippingInfo.district,
                      order.shippingInfo.city
                    ]
                      .filter(value => value?.trim())
                      .join(", ")
                  )
                },
                {
                  key: "shipping-note",
                  label: "Ghi chú giao hàng",
                  children: displayOrderText(order.shippingInfo.note)
                },
                {
                  key: "customer-note",
                  label: "Ghi chú khách hàng",
                  children: displayOrderText(order.customerNote)
                }
              ]}
            />
          </section>
          <section aria-label='Sản phẩm đã mua' className='mt-6'>
            <Typography.Title level={3}>Sản phẩm đã mua</Typography.Title>
            <Table<OrderProduct>
              pagination={false}
              dataSource={order.productInfo.map((item, key) => ({ ...item, key }))}
              locale={{ emptyText: "Chưa có dữ liệu" }}
              columns={[
                {
                  title: "Sản phẩm",
                  key: "product",
                  render: (_, item) => (
                    <>
                      {item.variantImageAtOrder?.trim() ? (
                        <img
                          src={item.variantImageAtOrder}
                          alt={displayOrderText(item.productNameAtOrder)}
                          width={64}
                          height={64}
                        />
                      ) : (
                        <p>Chưa có hình ảnh</p>
                      )}
                      <div>{displayOrderText(item.productNameAtOrder)}</div>
                    </>
                  )
                },
                {
                  title: "SKU",
                  key: "sku",
                  render: (_, item) => displayOrderText(item.variantSkuAtOrder)
                },
                {
                  title: "Thuộc tính lúc mua",
                  key: "attributes",
                  render: (_, item) =>
                    item.attributeValuesAtOrder?.length
                      ? item.attributeValuesAtOrder.map((attribute, index) => (
                          <div key={index}>
                            {attribute.name}: {attribute.value}
                          </div>
                        ))
                      : missingOrderData
                },
                { title: "Số lượng", dataIndex: "quantity", key: "quantity" },
                {
                  title: "Giá gốc lúc mua",
                  key: "originalPrice",
                  render: (_, item) => amount(item.originalPriceAtOrder)
                },
                {
                  title: "Đơn giá lúc mua",
                  key: "price",
                  render: (_, item) => amount(item.priceAtOrder)
                },
                {
                  title: "Thành tiền",
                  key: "total",
                  render: (_, item) => amount(item.priceAtOrder * item.quantity)
                }
              ]}
            />
          </section>
          <section aria-label='Tổng tiền' className='mt-6'>
            <Typography.Title level={3}>Tổng tiền</Typography.Title>
            <Descriptions
              bordered
              column={2}
              items={[
                {
                  key: "subtotal",
                  label: "Tạm tính",
                  children: amount(order.checkoutInfo.subtotal)
                },
                {
                  key: "discount",
                  label: "Giảm giá",
                  children: amount(order.checkoutInfo.discountAmount)
                },
                {
                  key: "shipping",
                  label: "Phí vận chuyển",
                  children: amount(order.checkoutInfo.shippingFee)
                },
                {
                  key: "total",
                  label: "Tổng thanh toán",
                  children: amount(order.checkoutInfo.totalPrice)
                },
                { key: "currency", label: "Tiền tệ", children: displayOrderText(currency) },
                {
                  key: "coupon",
                  label: "Mã giảm giá",
                  children: displayOrderText(order.checkoutInfo.couponCode)
                },
                {
                  key: "coupon-percent",
                  label: "Tỷ lệ giảm giá",
                  children:
                    order.checkoutInfo.couponDiscountPercentage === undefined
                      ? missingOrderData
                      : `${order.checkoutInfo.couponDiscountPercentage}%`
                }
              ]}
            />
          </section>
          <section aria-label='Thông tin thanh toán' className='mt-6'>
            <Typography.Title level={3}>Thông tin thanh toán</Typography.Title>
            <Descriptions
              bordered
              column={2}
              items={[
                {
                  key: "method",
                  label: "Phương thức",
                  children: paymentMethodLabels[order.paymentInfo.method]
                },
                {
                  key: "status",
                  label: "Trạng thái thanh toán",
                  children: order.paymentStatus
                    ? paymentStatusLabels[order.paymentStatus]
                    : missingOrderData
                },
                {
                  key: "provider",
                  label: "Nhà cung cấp",
                  children: displayOrderText(order.paymentInfo.provider)
                },
                {
                  key: "transaction",
                  label: "Mã giao dịch",
                  children: displayOrderText(order.paymentInfo.transactionId)
                },
                {
                  key: "brand",
                  label: "Loại thẻ",
                  children: displayOrderText(order.paymentInfo.brand)
                },
                {
                  key: "last4",
                  label: "Bốn số cuối",
                  children: displayOrderText(order.paymentInfo.last4)
                },
                {
                  key: "paidAt",
                  label: "Thời điểm thanh toán",
                  children: formatOrderDate(order.paidAt)
                },
                {
                  key: "dueAt",
                  label: "Hạn thanh toán",
                  children: formatOrderDate(order.paymentDueAt)
                }
              ]}
            />
          </section>
          <section aria-label='Điều kiện xử lý' className='mt-6'>
            <Typography.Title level={3}>Điều kiện xử lý</Typography.Title>
            {order.actions.returnDeadline && (
              <p>Hạn trả hàng: {formatOrderDate(order.actions.returnDeadline)}</p>
            )}
            <ul className='list-disc pl-5'>
              {order.actions.orderStatuses.map(action => (
                <li key={action.status}>
                  {orderStatusLabels[action.status]}:{" "}
                  {action.enabled ? "Có thể thực hiện" : displayOrderText(action.reason)}
                </li>
              ))}
              {order.actions.paymentActions.map(action => (
                <li key={action.action}>
                  {paymentActionLabels[action.action]}:{" "}
                  {action.enabled ? "Có thể thực hiện" : displayOrderText(action.reason)}
                </li>
              ))}
            </ul>
          </section>
          <OrderHistory order={order} />
        </>
      )}
      {intent && (
        <OrderActionDialog
          key={`${orderId}:${intent.type}:${intent.type === "payment" ? intent.action : intent.status}`}
          orderId={orderId}
          intent={intent}
          onClose={() => setIntent(null)}
          // The mutation result (or a conflict reload) is the newest committed read of this order.
          onOrderChanged={async updated => setView({ loading: false, order: updated })}
        />
      )}
    </section>
  );
}
