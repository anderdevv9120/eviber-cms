import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Select,
  Typography
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import RemoteSelect, { type RemoteSelectQuery } from "@/components/RemoteSelect";
import {
  listVoucherCategoryTargetsAPI,
  listVoucherProductTargetsAPI,
  type AdminCouponDetail,
  type CouponInput,
  type CouponScope,
  type CouponTarget
} from "@/services/vouchers";
import { getErrorMessage } from "@/utils/getErrorMessage";
import {
  checkVoucherPage,
  voucherDateFormat,
  voucherInstant,
  voucherLocalDate
} from "./voucher-query";

// ponytail: the picker edits wall-clock fields only; the form keeps the shop-local (UTC+07:00)
// string that voucherInstant converts, so the browser time zone never shifts the instant.
const dateField = {
  getValueProps: (value?: string) => ({ value: value ? dayjs(value) : null }),
  normalize: (value: Dayjs | null) => (value ? value.format("YYYY-MM-DDTHH:mm:ss") : "")
};
const datePicker = (time: "startOf" | "endOf") => (
  <DatePicker
    className='w-full!'
    format={voucherDateFormat}
    placeholder='Chọn thời điểm'
    needConfirm={false}
    showTime={{ defaultOpenValue: dayjs()[time]("day") }}
  />
);

const moneyInput = {
  className: "w-full!",
  formatter: (value?: string | number) => `${value ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  parser: (value?: string) => (value ?? "").replace(/,/g, "") as unknown as number,
  // The formatter re-adds a deleted separator, so step over it and delete the digit instead.
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const at = input.selectionStart;
    if (at === null || at !== input.selectionEnd) return;
    if (event.key === "Backspace" && input.value[at - 1] === ",")
      input.setSelectionRange(at - 1, at - 1);
    if (event.key === "Delete" && input.value[at] === ",") input.setSelectionRange(at + 1, at + 1);
  }
};

const loadVoucherProducts = async (query: RemoteSelectQuery, signal: AbortSignal) =>
  checkVoucherPage((await listVoucherProductTargetsAPI(query, signal)).data, query);
const loadVoucherCategories = async (query: RemoteSelectQuery, signal: AbortSignal) =>
  checkVoucherPage((await listVoucherCategoryTargetsAPI(query, signal)).data, query);

export default function VoucherForm({
  voucher,
  busy,
  onSubmit
}: {
  voucher: AdminCouponDetail | null;
  busy: boolean;
  onSubmit(input: CouponInput): Promise<void>;
}) {
  const profile = useAppStore(state => state.profile);
  const writePermission = voucher ? "COUPON_UPDATE" : "COUPON_CREATE";
  const canWrite = !!profile && canAccess(profile, { anyOf: [writePermission] });
  const [form] = Form.useForm<CouponInput>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [scope, setScope] = useState<CouponScope>(voucher?.scopeType ?? "all");
  const loadTargets = useCallback(
    async (query: RemoteSelectQuery, signal: AbortSignal) => {
      const latest = useAppStore.getState().profile;
      if (!canWrite || !latest || !canAccess(latest, { anyOf: [writePermission] }))
        return { data: [], total: 0, page: query.page, pageSize: query.pageSize };
      return (scope === "products" ? loadVoucherProducts : loadVoucherCategories)(query, signal);
    },
    [canWrite, scope, writePermission]
  );
  const [type, setType] = useState(voucher?.discountType ?? "percentage");
  const integer = (min: number, max = Number.MAX_SAFE_INTEGER, nullable = false) => ({
    validator: (_: unknown, value?: number | null) =>
      (nullable && (value === null || value === undefined)) ||
      (Number.isSafeInteger(value) && value! >= min && value! <= max)
        ? Promise.resolve()
        : Promise.reject(new Error(`Số nguyên từ ${min} đến ${max}`))
  });
  const dateRule = {
    validator: (_: unknown, value: string) => {
      try {
        voucherInstant(value);
        return Promise.resolve();
      } catch {
        return Promise.reject(new Error("Ngày không hợp lệ"));
      }
    }
  };
  const submit = async (fields: CouponInput) => {
    const latest = useAppStore.getState().profile;
    if (
      !latest ||
      !canAccess(latest, { anyOf: [voucher ? "COUPON_UPDATE" : "COUPON_CREATE"] }) ||
      busy ||
      saving.current
    )
      return;
    saving.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        code: fields.code.trim().toUpperCase(),
        name: fields.name.trim(),
        discountType: fields.discountType,
        discountValue: fields.discountValue,
        maxDiscountAmount:
          fields.discountType === "percentage" ? (fields.maxDiscountAmount ?? null) : null,
        minOrderAmount: fields.minOrderAmount ?? 0,
        scopeType: fields.scopeType,
        scopeProductIds:
          fields.scopeType === "products" ? [...new Set(fields.scopeProductIds)] : [],
        scopeCategoryIds:
          fields.scopeType === "categories" ? [...new Set(fields.scopeCategoryIds)] : [],
        startDate: voucherInstant(fields.startDate),
        endDate: voucherInstant(fields.endDate),
        usageLimit: fields.usageLimit ?? null,
        perUserLimit: fields.perUserLimit ?? null,
        isActive: voucher ? voucher.isActive : fields.isActive
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Form<CouponInput>
      form={form}
      layout='vertical'
      disabled={busy || submitting || !canWrite}
      onFinish={submit}
      initialValues={
        voucher
          ? {
              ...voucher,
              startDate: voucherLocalDate(voucher.startDate),
              endDate: voucherLocalDate(voucher.endDate)
            }
          : {
              code: "",
              name: "",
              discountType: "percentage",
              discountValue: 20,
              maxDiscountAmount: null,
              minOrderAmount: 0,
              scopeType: "all",
              scopeProductIds: [],
              scopeCategoryIds: [],
              usageLimit: null,
              perUserLimit: 1,
              isActive: true
            }
      }
    >
      {error && <Alert type='error' title={error} className='mb-4' />}
      <Form.Item
        name='code'
        label='Mã voucher'
        rules={[
          {
            required: true,
            pattern: /^[A-Za-z0-9_-]{1,100}$/,
            transform: (value: string) => value?.trim(),
            message: "Mã gồm 1–100 chữ, số, _ hoặc -"
          }
        ]}
      >
        <Input disabled={!!voucher || busy || submitting || !canWrite} maxLength={100} />
      </Form.Item>
      <Form.Item
        name='name'
        label='Tên voucher'
        rules={[
          {
            required: true,
            whitespace: true,
            max: 255,
            transform: (value: string) => value?.trim(),
            message: "Nhập tên từ 1–255 ký tự"
          }
        ]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item name='discountType' label='Loại giảm'>
        <Select
          options={[
            { value: "percentage", label: "Phần trăm" },
            { value: "fixed_amount", label: "Số tiền cố định" }
          ]}
          onChange={value => {
            setType(value);
            form.setFieldValue("maxDiscountAmount", null);
          }}
        />
      </Form.Item>
      <Form.Item
        name='discountValue'
        label='Giá trị giảm'
        extra={type === "percentage" ? "Phần trăm (%)" : "VND"}
        dependencies={["discountType"]}
        rules={[integer(1, type === "percentage" ? 100 : Number.MAX_SAFE_INTEGER)]}
      >
        <InputNumber {...moneyInput} />
      </Form.Item>
      {type === "percentage" && (
        <Form.Item
          name='maxDiscountAmount'
          label='Giảm tối đa (VND)'
          rules={[integer(1, Number.MAX_SAFE_INTEGER, true)]}
        >
          <InputNumber {...moneyInput} placeholder='Không giới hạn' />
        </Form.Item>
      )}
      <Form.Item name='minOrderAmount' label='Đơn tối thiểu (VND)' rules={[integer(0)]}>
        <InputNumber {...moneyInput} />
      </Form.Item>
      <Form.Item name='scopeType' label='Phạm vi'>
        <Select
          options={[
            { value: "all", label: "Toàn bộ hàng hóa" },
            { value: "products", label: "Sản phẩm đã chọn" },
            { value: "categories", label: "Danh mục đã chọn" }
          ]}
          onChange={value => {
            setScope(value);
            form.setFieldsValue({ scopeProductIds: [], scopeCategoryIds: [] });
          }}
        />
      </Form.Item>
      {scope !== "all" && (
        <Form.Item
          name={scope === "products" ? "scopeProductIds" : "scopeCategoryIds"}
          label={scope === "products" ? "Sản phẩm áp dụng" : "Danh mục áp dụng"}
          rules={[
            {
              validator: (_, ids?: string[]) =>
                ids?.length && ids.every(id => /^[a-f\d]{24}$/i.test(id))
                  ? Promise.resolve()
                  : Promise.reject(new Error("Chọn ít nhất một mục"))
            }
          ]}
        >
          <RemoteSelect<CouponTarget>
            key={scope}
            load={loadTargets}
            label={target => target.name}
            mode='multiple'
            ariaLabel={scope === "products" ? "Sản phẩm áp dụng" : "Danh mục áp dụng"}
            placeholder={scope === "products" ? "Tìm và chọn sản phẩm" : "Tìm và chọn danh mục"}
            retryLabel='Thử lại mục áp dụng'
            selected={(scope === "products"
              ? (voucher?.selectedProducts ?? [])
              : (voucher?.selectedCategories ?? [])
            ).map(target => ({
              _id: target._id,
              label: target.unavailable
                ? `Không còn khả dụng (${target._id})`
                : (target.name ?? target._id)
            }))}
          />
        </Form.Item>
      )}
      <Flex gap={16}>
        <Form.Item
          name='startDate'
          label='Thời điểm có hiệu lực'
          className='flex-1'
          rules={[dateRule]}
          {...dateField}
        >
          {datePicker("startOf")}
        </Form.Item>
        <Form.Item
          name='endDate'
          label='Thời điểm kết thúc'
          className='flex-1'
          dependencies={["startDate"]}
          {...dateField}
          rules={[
            dateRule,
            {
              validator: (_, value: string) => {
                try {
                  return voucherInstant(value) > voucherInstant(form.getFieldValue("startDate"))
                    ? Promise.resolve()
                    : Promise.reject(new Error("Kết thúc phải sau bắt đầu"));
                } catch {
                  return Promise.resolve();
                }
              }
            }
          ]}
        >
          {datePicker("endOf")}
        </Form.Item>
      </Flex>
      <Typography.Paragraph>
        Để trống giới hạn để không giới hạn. Mặc định mỗi tài khoản dùng một lần.
      </Typography.Paragraph>
      <Form.Item
        name='usageLimit'
        label='Giới hạn toàn bộ'
        rules={[
          integer(1, Number.MAX_SAFE_INTEGER, true),
          {
            validator: (_, value?: number | null) =>
              !voucher || value == null || value >= voucher.usedCount
                ? Promise.resolve()
                : Promise.reject(new Error("Giới hạn không được thấp hơn số lượt đã dùng"))
          }
        ]}
      >
        <InputNumber className='w-full!' placeholder='Không giới hạn' />
      </Form.Item>
      <Form.Item
        name='perUserLimit'
        label='Giới hạn mỗi tài khoản'
        rules={[integer(1, Number.MAX_SAFE_INTEGER, true)]}
      >
        <InputNumber className='w-full!' placeholder='Không giới hạn' />
      </Form.Item>
      {!voucher && (
        <Form.Item name='isActive' valuePropName='checked'>
          <Checkbox>Bật voucher khi tạo</Checkbox>
        </Form.Item>
      )}
      <Button htmlType='submit' type='primary' loading={submitting}>
        {voucher ? "Lưu voucher" : "Tạo voucher"}
      </Button>
    </Form>
  );
}
