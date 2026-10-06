import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Flex, Result, Spin, Typography } from "antd";
import { Link, useSearchParams } from "react-router";
import { getGuestBuyerAPI, type GuestBuyerDetail as Guest } from "@/services/customers";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderDate } from "@/pages/Orders/order-display";
import { safeCustomerReturnTo } from "./customer-list-query";
import CustomerOrders from "./CustomerOrders";

export default function GuestBuyerDetail() {
  const [params] = useSearchParams();
  const email =
    params.getAll("email").length === 1 ? params.get("email")!.trim().toLowerCase() : "";
  const returnTo = safeCustomerReturnTo(
    params.getAll("returnTo").length === 1 ? params.get("returnTo") : "/customers?tab=guests"
  );
  if (!email || email.length > 255 || email.includes("\uFFFD"))
    return (
      <>
        <Link to={returnTo}>Về danh sách khách hàng</Link>
        <Result status='404' title='Khách vãng lai không còn khả dụng' />
      </>
    );
  return <GuestRead key={email} email={email} returnTo={returnTo} />;
}

function GuestRead({ email, returnTo }: { email: string; returnTo: string }) {
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ guest?: Guest; error?: string; unavailable?: boolean }>({});
  useEffect(() => {
    const controller = new AbortController();
    getGuestBuyerAPI(email, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data?.email !== email || !Number.isSafeInteger(data.orderCount) || data.orderCount < 1)
          throw new Error("Không tải được dữ liệu khách vãng lai");
        setView({ guest: data });
      })
      .catch(cause => {
        if (!controller.signal.aborted)
          setView({
            error: getErrorMessage(cause),
            unavailable: cause instanceof ApiError && [400, 404].includes(cause.status ?? 0)
          });
      });
    return () => controller.abort();
  }, [email, attempt]);
  const reload = () => {
    setView({});
    setAttempt(value => value + 1);
  };
  const guest = view.guest;
  const text = (value?: string) => value?.trim() || "—";
  const date = (value?: string) =>
    value && !Number.isNaN(new Date(value).getTime()) ? formatOrderDate(value) : "—";
  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center' gap={8} wrap>
        <Link to={returnTo}>Về danh sách khách hàng</Link>
        <Button disabled={!guest && !view.error} onClick={reload}>
          Tải lại
        </Button>
      </Flex>
      {!guest && !view.error && <Spin aria-label='Đang tải khách vãng lai' />}
      {view.unavailable ? (
        <Result status='404' title='Khách vãng lai không còn khả dụng' />
      ) : (
        view.error && (
          <Alert
            type='error'
            showIcon
            title={view.error}
            action={<Button onClick={reload}>Thử lại</Button>}
          />
        )
      )}
      {guest && (
        <>
          <Typography.Title level={2}>Khách vãng lai</Typography.Title>
          <Typography.Paragraph>Thông tin liên hệ từ đơn hàng gần nhất</Typography.Paragraph>
          <Descriptions
            bordered
            column={2}
            items={[
              { key: "email", label: "Email nhóm khách", children: email },
              { key: "name", label: "Tên liên hệ gần nhất", children: text(guest.name) },
              { key: "phone", label: "Số điện thoại gần nhất", children: text(guest.phoneNumber) },
              { key: "latest", label: "Đơn hàng gần nhất", children: date(guest.latestOrderAt) },
              { key: "count", label: "Số đơn hàng", children: guest.orderCount },
              {
                key: "specific",
                label: "Địa chỉ cụ thể",
                children: text(guest.shippingInfo?.specificAddress)
              },
              { key: "ward", label: "Phường / Xã", children: text(guest.shippingInfo?.ward) },
              {
                key: "district",
                label: "Quận / Huyện",
                children: text(guest.shippingInfo?.district)
              },
              { key: "city", label: "Tỉnh / Thành phố", children: text(guest.shippingInfo?.city) },
              { key: "note", label: "Ghi chú giao hàng", children: text(guest.shippingInfo?.note) }
            ]}
          />
          <CustomerOrders buyer={{ kind: "guest", email }} />
        </>
      )}
    </section>
  );
}
