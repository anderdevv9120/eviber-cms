import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Flex,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Table,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { Link } from "react-router";
import {
  createVoucherAPI,
  getVoucherAPI,
  listVoucherRedemptionsAPI,
  updateVoucherAPI,
  type AdminCouponDetail,
  type AdminCouponRedemption,
  type CouponInput,
  type CouponPatchInput,
  type VoucherPage,
  type VoucherRedemptionQuery
} from "@/services/vouchers";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderAmount } from "@/pages/Orders/order-display";
import { availabilityLabels, checkVoucherPage, voucherLocalDate } from "./voucher-query";
import VoucherForm from "./VoucherForm";

function checkVoucher(voucher: AdminCouponDetail, id?: string | null): AdminCouponDetail {
  if (
    !voucher ||
    !voucher._id ||
    (id && voucher._id !== id) ||
    !Number.isSafeInteger(voucher.revision) ||
    voucher.revision < 0 ||
    !Number.isSafeInteger(voucher.usedCount) ||
    voucher.usedCount < 0 ||
    !(
      voucher.remainingUses === null ||
      (Number.isSafeInteger(voucher.remainingUses) && voucher.remainingUses >= 0)
    ) ||
    typeof voucher.isActive !== "boolean" ||
    !Array.isArray(voucher.selectedProducts) ||
    !Array.isArray(voucher.selectedCategories) ||
    !Array.isArray(voucher.scopeProductIds) ||
    !Array.isArray(voucher.scopeCategoryIds)
  )
    throw new Error("Không nhận được voucher hợp lệ. Vui lòng thử lại.");
  voucherLocalDate(voucher.startDate);
  voucherLocalDate(voucher.endDate);
  return voucher;
}

function VoucherHistory({ voucherId }: { voucherId: string }) {
  const [query, setQuery] = useState<VoucherRedemptionQuery>({ page: 1, pageSize: 10 });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
  const [view, setView] = useState<{
    key: string;
    result?: VoucherPage<AdminCouponRedemption>;
    error?: string;
  }>({ key });
  useEffect(() => {
    const controller = new AbortController();
    listVoucherRedemptionsAPI(voucherId, query, controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setView({ key, result: checkVoucherPage(data, query) });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setView({ key, error: getErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [voucherId, query, key, attempt]);
  const current = view.key === key ? view : { key };
  const columns: TableColumnsType<AdminCouponRedemption> = [
    {
      title: "Đơn hàng",
      key: "order",
      render: (_, row) => (
        <Link to={`/orders/${encodeURIComponent(row.orderId)}`}>{row.orderNumber}</Link>
      )
    },
    {
      title: "Khách hàng",
      key: "customer",
      render: (_, row) => (
        <>
          <div>{row.displayName}</div>
          <div>{row.email}</div>
        </>
      )
    },
    {
      title: "Tiền hàng đủ điều kiện",
      key: "subtotal",
      render: (_, row) => formatOrderAmount(row.eligibleSubtotal, "VND")
    },
    {
      title: "Đã giảm",
      key: "discount",
      render: (_, row) => formatOrderAmount(row.discountAmount, "VND")
    },
    {
      title: "Sử dụng (UTC+07:00)",
      key: "used",
      render: (_, row) => voucherLocalDate(row.consumedAt).replace("T", " ")
    },
    {
      title: "Trạng thái",
      key: "state",
      render: (_, row) => (row.state === "counted" ? "Đang tính lượt" : "Đã hoàn lượt")
    },
    {
      title: "Hoàn lượt (UTC+07:00)",
      key: "released",
      render: (_, row) => (
        <>
          {row.releasedAt ? voucherLocalDate(row.releasedAt).replace("T", " ") : "—"}
          <div>{row.releaseReason ?? "—"}</div>
        </>
      )
    }
  ];
  return (
    <section aria-label='Lịch sử sử dụng voucher' className='mt-6'>
      <Typography.Title level={4}>Lịch sử sử dụng</Typography.Title>
      <Select
        aria-label='Lọc lượt sử dụng'
        allowClear
        placeholder='Tất cả lượt sử dụng'
        value={query.state}
        style={{ width: 220 }}
        options={[
          { value: "counted", label: "Đang tính lượt" },
          { value: "released", label: "Đã hoàn lượt" }
        ]}
        onChange={state => setQuery({ ...query, page: 1, state })}
      />
      {current.error ? (
        <Alert
          type='error'
          title={current.error}
          action={
            <Button
              onClick={() => {
                setView({ key });
                setAttempt(n => n + 1);
              }}
            >
              Thử lại lịch sử
            </Button>
          }
        />
      ) : !current.result ? (
        <Spin aria-label='Đang tải lịch sử' />
      ) : (
        <>
          <Table
            rowKey='_id'
            columns={columns}
            dataSource={current.result.data}
            pagination={false}
            scroll={{ x: 1000 }}
            locale={{ emptyText: "Chưa có lượt sử dụng" }}
          />
          <Flex justify='space-between' wrap gap={12}>
            <Typography.Text>Tổng {current.result.total} lượt sử dụng</Typography.Text>
            <Pagination
              current={query.page}
              pageSize={query.pageSize}
              total={current.result.total}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              onChange={(page, pageSize) =>
                setQuery({ ...query, page: query.pageSize === pageSize ? page : 1, pageSize })
              }
            />
          </Flex>
        </>
      )}
    </section>
  );
}

export default function VoucherDrawer({
  voucherId,
  onClose,
  onChanged
}: {
  voucherId: string | null;
  onClose(): void;
  onChanged(): void;
}) {
  const [voucher, setVoucher] = useState<AdminCouponDetail | null>(null);
  const [fresh, setFresh] = useState<AdminCouponDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (voucherId)
      getVoucherAPI(voucherId, controller.signal)
        .then(({ data }) => {
          if (!controller.signal.aborted) setVoucher(checkVoucher(data, voucherId));
        })
        .catch(cause => {
          if (!controller.signal.aborted) setError(getErrorMessage(cause));
        });
    return () => controller.abort();
  }, [voucherId, attempt]);

  const write = async (input: CouponInput | CouponPatchInput) => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || saving.current || conflict) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data } = voucherId
        ? await updateVoucherAPI(voucherId, input as CouponPatchInput)
        : await createVoucherAPI(input as CouponInput);
      if (controller.signal.aborted) return;
      const saved = checkVoucher(data, voucherId);
      setVoucher(saved);
      setFresh(null);
      onChanged();
      if (!voucherId) onClose();
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (voucherId && cause instanceof ApiError && cause.status === 409) {
        setConflict(true);
        setError(
          "Voucher đã thay đổi. Xem thông tin mới, rồi tải lại để bỏ bản nháp trước khi lưu."
        );
        try {
          const { data } = await getVoucherAPI(voucherId, controller.signal);
          if (!controller.signal.aborted) setFresh(checkVoucher(data, voucherId));
        } catch (recoveryError) {
          if (!controller.signal.aborted)
            setError(`Không tải được phiên bản mới: ${getErrorMessage(recoveryError)}`);
        }
      }
      throw cause;
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const submit = async (input: CouponInput) => {
    if (voucherId && voucher) {
      const { code: _code, ...rules } = input;
      await write({ ...rules, expectedRevision: voucher.revision });
    } else await write(input);
  };
  const reload = () => {
    setVoucher(null);
    setFresh(null);
    setConflict(false);
    setError(null);
    setAttempt(n => n + 1);
  };
  const metadata = conflict ? fresh : voucher;
  return (
    <Drawer
      open
      title={voucherId ? "Chi tiết voucher" : "Thêm voucher"}
      size={900}
      onClose={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
    >
      {error && <Alert type='error' title={error} className='mb-4' />}
      {voucherId && !voucher ? (
        error ? (
          <Button onClick={reload}>Thử lại voucher</Button>
        ) : (
          <Spin aria-label='Đang tải chi tiết voucher' />
        )
      ) : (
        <>
          {metadata && (
            <Flex vertical gap={8} className='mb-4'>
              <Typography.Text>Phiên bản hiện tại: {metadata.revision}</Typography.Text>
              <Typography.Text>
                Tình trạng: {availabilityLabels[metadata.availability]}
              </Typography.Text>
              <Typography.Text>Đã dùng: {metadata.usedCount}</Typography.Text>
              <Typography.Text>
                Còn lại:{" "}
                {metadata.remainingUses === null ? "Không giới hạn" : metadata.remainingUses}
              </Typography.Text>
              {fresh && <Typography.Text>Tên hiện tại: {fresh.name}</Typography.Text>}
              <Flex gap={8} wrap>
                <Popconfirm
                  title={metadata.isActive ? "Tắt voucher này?" : "Bật voucher này?"}
                  okText='Xác nhận'
                  cancelText='Hủy'
                  onConfirm={async () => {
                    try {
                      await write({
                        expectedRevision: voucher!.revision,
                        isActive: !voucher!.isActive
                      });
                    } catch (cause) {
                      if (
                        !lifetime.current?.signal.aborted &&
                        !(cause instanceof ApiError && cause.status === 409)
                      )
                        setError(getErrorMessage(cause));
                    }
                  }}
                >
                  <Button disabled={busy || conflict}>
                    {metadata.isActive ? "Tắt voucher" : "Bật voucher"}
                  </Button>
                </Popconfirm>
              </Flex>
            </Flex>
          )}
          {voucherId && (
            <Button className='mb-4' disabled={busy} onClick={reload}>
              Tải lại và bỏ bản nháp
            </Button>
          )}
          <VoucherForm
            key={`form:${voucher?._id ?? "new"}:${voucher?.revision ?? "new"}`}
            voucher={voucher}
            busy={busy || conflict}
            onSubmit={submit}
          />
          {voucherId && (
            <VoucherHistory
              key={`history:${voucherId}:${voucher?.revision}`}
              voucherId={voucherId}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
