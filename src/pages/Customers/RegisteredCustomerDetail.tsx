import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Descriptions, Flex, Modal, Result, Spin, Typography } from "antd";
import { useParams } from "react-router";
import {
  getCustomerAPI,
  updateCustomerAPI,
  type RegisteredCustomerDetail as Customer,
  type UpdateCustomerInput
} from "@/services/customers";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderDate } from "@/pages/Orders/order-display";
import CustomerForm from "./CustomerForm";
import CustomerAddresses from "./CustomerAddresses";
import CustomerOrders from "./CustomerOrders";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

export default function RegisteredCustomerDetail() {
  const { customerId = "" } = useParams();
  return <CustomerRead key={customerId} customerId={customerId} />;
}

// Keyed loading/cancellation follows OrderDetail; profile writes require a fresh detail read.
function CustomerRead({ customerId }: { customerId: string }) {
  const profile = useAppStore(state => state.profile);
  const canUpdate = !!profile && canAccess(profile, { anyOf: ["CUSTOMER_UPDATE"] });
  const [view, setView] = useState<{ customer?: Customer; error?: string; unavailable?: boolean }>(
    {}
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return getCustomerAPI(customerId, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data?._id !== customerId || !Array.isArray(data.addresses))
          throw new Error("Không tải được dữ liệu khách hàng");
        setView({ customer: data });
      })
      .catch(cause => {
        if (!controller.signal.aborted)
          setView({
            error: getErrorMessage(cause),
            unavailable: cause instanceof ApiError && [400, 404].includes(cause.status ?? 0)
          });
      });
  }, [customerId]);
  useEffect(() => {
    mounted.current = true;
    reload().catch(() => {
      /* Active read failures remain inline. */
    });
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, [reload]);
  const retry = () => {
    setView({});
    reload().catch(() => {
      /* Active read failures remain inline. */
    });
  };
  const save = async (input: UpdateCustomerInput) => {
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] }) ||
      inFlight.current ||
      !view.customer
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      try {
        const { data } = await updateCustomerAPI(customerId, input);
        if (data?._id !== customerId) throw new Error("Chưa xác nhận được kết quả lưu hồ sơ");
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 403) throw cause;
        if (mounted.current)
          setNotice(
            `${getErrorMessage(cause)}. Kết quả lưu chưa được xác nhận; kiểm tra hồ sơ đã tải lại trước khi thao tác tiếp.`
          );
      }
      if (mounted.current) {
        setEditing(false);
        setView({});
        await reload();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const customer = view.customer;
  const text = (value?: string) => value?.trim() || "—";
  const date = (value?: string) =>
    value && !Number.isNaN(new Date(value).getTime()) ? formatOrderDate(value) : "—";
  return (
    <section className='min-w-0'>
      <Flex justify='flex-end' align='center' gap={8} wrap>
        <Button disabled={saving || (!customer && !view.error)} onClick={retry}>
          Tải lại
        </Button>
      </Flex>
      {notice && <Alert type='warning' showIcon title={notice} className='mt-4' />}
      {!customer && !view.error && <Spin aria-label='Đang tải khách hàng' />}
      {view.unavailable ? (
        <Result status='404' title='Khách hàng không còn khả dụng' />
      ) : (
        view.error && (
          <Alert
            type='error'
            showIcon
            title={view.error}
            action={<Button onClick={retry}>Thử lại</Button>}
          />
        )
      )}
      {customer && (
        <>
          <Flex justify='space-between' align='center' gap={8} wrap>
            <Typography.Title level={2}>Khách hàng đã đăng ký</Typography.Title>
            <Button
              disabled={!canUpdate || saving}
              onClick={() => {
                const current = useAppStore.getState().profile;
                if (current && canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] })) setEditing(true);
              }}
            >
              Sửa hồ sơ
            </Button>
          </Flex>
          <Descriptions
            bordered
            column={2}
            items={[
              { key: "email", label: "Email đăng nhập", children: text(customer.email) },
              {
                key: "status",
                label: "Trạng thái tài khoản",
                children:
                  { VERIFIED: "Đã xác minh", UNVERIFIED: "Chưa xác minh", DELETED: "Đã xóa" }[
                    customer.status
                  ] ?? "—"
              },
              {
                key: "type",
                label: "Loại tài khoản",
                children:
                  customer.accountType === "DEFAULT"
                    ? "Email / mật khẩu"
                    : customer.accountType === "GOOGLE"
                      ? "Google"
                      : "—"
              },
              { key: "firstName", label: "Tên", children: text(customer.firstName) },
              { key: "lastName", label: "Họ", children: text(customer.lastName) },
              { key: "phone", label: "Số điện thoại", children: text(customer.phone) },
              {
                key: "gender",
                label: "Giới tính",
                children: customer.gender
                  ? ({ MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác" }[customer.gender] ?? "—")
                  : "—"
              },
              { key: "avatar", label: "URL ảnh đại diện", children: text(customer.imgUrl) },
              { key: "created", label: "Ngày tạo", children: date(customer.created_at) },
              { key: "updated", label: "Ngày cập nhật", children: date(customer.updated_at) },
              { key: "login", label: "Đăng nhập gần nhất", children: date(customer.lastLogin) }
            ]}
          />
          <CustomerAddresses customerId={customerId} />
          <CustomerOrders buyer={{ kind: "registered", id: customerId }} />
          {editing && (
            <Modal
              open
              title='Sửa hồ sơ'
              footer={null}
              closable={!saving}
              keyboard={!saving}
              mask={{ closable: !saving }}
              onCancel={() => {
                if (!inFlight.current) setEditing(false);
              }}
            >
              <CustomerForm
                customer={customer}
                disabled={!canUpdate || saving}
                onSubmit={save}
                onCancel={() => {
                  if (!inFlight.current) setEditing(false);
                }}
              />
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
