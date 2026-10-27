import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Flex, Result, Spin, Tag, Typography } from "antd";
import DataTable from "@/components/DataTable";
import { Link, useParams, useSearchParams } from "react-router";
import { getOrderAPI, type AdminOrderDetail } from "@/services/orders";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { PATH } from "@/constants/paths";
import { groupOrderLines, type OrderLineRow } from "./order-lines";
import {
  cancellationReasonLabels,
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
import RefundSection from "./RefundSection";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

// Stored purchase snapshot; legacy orders without a type keep the old percentage field.
const couponDiscount = (
  checkout: AdminOrderDetail["checkoutInfo"],
  amount: (value?: number) => string
) => {
  if (checkout.couponDiscountType === "fixed_amount") return amount(checkout.couponDiscountValue);
  const percentage =
    checkout.couponDiscountType === "percentage"
      ? checkout.couponDiscountValue
      : checkout.couponDiscountPercentage;
  return percentage === undefined ? missingOrderData : `${percentage}%`;
};

export default function OrderDetail() {
  const { orderId = "" } = useParams();
  return <OrderDetailRead key={orderId} orderId={orderId} />;
}

function OrderDetailRead({ orderId }: { orderId: string }) {
  const [params] = useSearchParams();
  const targets = params.getAll("requestId");
  const requestId =
    targets.length === 0
      ? undefined
      : targets.length === 1 && /^[a-f\d]{24}$/i.test(targets[0])
        ? targets[0]
        : null;
  const profile = useAppStore(state => state.profile);
  const canUpdate = !!profile && canAccess(profile, { anyOf: ["ORDER_UPDATE"] });
  const canPay = !!profile && canAccess(profile, { anyOf: ["ORDER_PAYMENT_UPDATE"] });
  const canRefund =
    !!profile && canAccess(profile, { anyOf: ["ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"] });
  const [refundMounted, setRefundMounted] = useState(canRefund);
  // Keep an existing draft mounted on revocation; the section blocks reads and writes itself.
  useEffect(
    () =>
      useAppStore.subscribe(({ profile: current }) => {
        if (current && canAccess(current, { anyOf: ["ORDER_REFUND_REVIEW", "ORDER_REFUND_PAY"] }))
          setRefundMounted(true);
      }),
    []
  );
  const openAction = (next: OrderActionIntent) => {
    const current = useAppStore.getState().profile;
    if (
      current &&
      canAccess(current, {
        anyOf: [next.type === "payment" ? "ORDER_PAYMENT_UPDATE" : "ORDER_UPDATE"]
      })
    )
      setIntent(next);
  };
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
  // A committed refund changes the order's revision and action eligibility; read it quietly so the
  // refund section keeps its place.
  const refreshOrder = async () => {
    const { data } = await getOrderAPI(orderId);
    if (!data?._id) throw new Error("Không tải được dữ liệu đơn hàng");
    setView({ loading: false, order: data });
  };
  const order = view.order;
  const currency = order?.checkoutInfo.currency;
  const amount = (value?: number) => formatOrderAmount(value, currency);

  return (
    <section className='min-w-0'>
      <Flex justify='flex-end' align='center'>
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
            {order.status === "cancelled" && (
              <p className='mb-4'>
                Lý do hủy (khách chọn):{" "}
                {order.cancellation
                  ? [
                      cancellationReasonLabels[order.cancellation.reason],
                      order.cancellation.note?.trim()
                    ]
                      .filter(Boolean)
                      .join(" — ")
                  : missingOrderData}
              </p>
            )}
            <Flex gap={8} wrap>
              {order.actions.orderStatuses
                .filter(action => action.enabled && canUpdate)
                .map(action => (
                  <Button
                    key={action.status}
                    onClick={() => openAction({ type: "fulfillment", status: action.status })}
                  >
                    {orderActionLabels[action.status]}
                  </Button>
                ))}
              {order.actions.paymentActions
                // Refunds are handled by the refund section below, never by a payment dialog.
                .filter(action => action.enabled && action.action !== "refund" && canPay)
                .map(action => (
                  <Button
                    key={action.action}
                    onClick={() => openAction({ type: "payment", action: action.action })}
                  >
                    {paymentActionLabels[action.action]}
                  </Button>
                ))}
            </Flex>
          </section>
          <section aria-label='Người nhận' className='mt-6'>
            <Typography.Title level={3}>Người nhận</Typography.Title>
            <Descriptions
              bordered
              column={2}
              items={[
                {
                  key: "customer",
                  label: "Loại khách hàng",
                  children: <CustomerLink order={order} />
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
            <DataTable<OrderLineRow>
              pagination={false}
              dataSource={groupOrderLines(order.productInfo, order.combos)}
              locale={{ emptyText: missingOrderData }}
              columns={[
                {
                  title: "Sản phẩm",
                  key: "product",
                  render: (_, item) => (
                    <>
                      {item.image?.trim() ? (
                        <img
                          src={item.image}
                          alt={displayOrderText(item.name)}
                          width={64}
                          height={64}
                        />
                      ) : (
                        <p>Chưa có hình ảnh</p>
                      )}
                      <div>{displayOrderText(item.name)}</div>
                    </>
                  )
                },
                {
                  title: "SKU",
                  key: "sku",
                  render: (_, item) => displayOrderText(item.sku)
                },
                {
                  title: "Thuộc tính lúc mua",
                  key: "attributes",
                  render: (_, item) =>
                    item.attributes?.length
                      ? item.attributes.map((attribute, index) => (
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
                  render: (_, item) => amount(item.originalUnitPrice)
                },
                {
                  title: "Đơn giá lúc mua",
                  key: "price",
                  render: (_, item) => (item.unitPrice === null ? "—" : amount(item.unitPrice))
                },
                {
                  title: "Thành tiền",
                  key: "total",
                  render: (_, item) => amount(item.lineTotal)
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
                  label: "Mức giảm của mã",
                  children: couponDiscount(order.checkoutInfo, amount)
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
                  {action.action === "refund" && action.enabled
                    ? "Xử lý trong mục Hoàn tiền bên dưới"
                    : action.enabled
                      ? "Có thể thực hiện"
                      : displayOrderText(action.reason)}
                </li>
              ))}
            </ul>
          </section>
          {refundMounted && (
            <RefundSection
              requestId={requestId}
              orderId={orderId}
              revision={order.revision}
              order={order}
              onCommitted={refreshOrder}
            />
          )}
          {!refundMounted && requestId !== undefined && (
            <Alert type='warning' showIcon title='Yêu cầu hoàn tiền không còn khả dụng' />
          )}
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

function CustomerLink({ order }: { order: AdminOrderDetail }) {
  const profile = useAppStore(state => state.profile);
  if (!profile || !canAccess(profile, { anyOf: ["CUSTOMER_READ"] }))
    return order.userId ? "Khách hàng đăng ký" : "Khách vãng lai";
  if (order.userId)
    return (
      <Link to={PATH.CUSTOMER_DETAIL.replace(":customerId", encodeURIComponent(order.userId))}>
        Khách hàng đăng ký
      </Link>
    );
  const email = order.shippingInfo.email?.trim();
  if (!email) return "Khách vãng lai";
  return (
    <Link to={`${PATH.GUEST_BUYER_DETAIL}?${new URLSearchParams({ email })}`}>Khách vãng lai</Link>
  );
}
