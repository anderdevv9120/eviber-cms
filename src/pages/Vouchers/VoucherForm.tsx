import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Pagination,
  Select,
  Typography
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  listVoucherCategoryTargetsAPI,
  listVoucherProductTargetsAPI,
  type AdminCouponDetail,
  type CouponInput,
  type CouponScope,
  type CouponTarget,
  type SelectedCouponTarget,
  type VoucherPage
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

function TargetPicker({
  scope,
  selected,
  value = [],
  onChange
}: {
  scope: "products" | "categories";
  selected: SelectedCouponTarget[];
  value?: string[];
  onChange?: (value: string[]) => void;
}) {
  const [query, setQuery] = useState({ search: "", page: 1, pageSize: 10 });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ result?: VoucherPage<CouponTarget>; error?: string }>({});
  const [retained, setRetained] = useState(selected);
  const label = scope === "products" ? "Sản phẩm áp dụng" : "Danh mục áp dụng";
  useEffect(() => {
    const controller = new AbortController();
    const read =
      scope === "products" ? listVoucherProductTargetsAPI : listVoucherCategoryTargetsAPI;
    read(query, controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setView({ result: checkVoucherPage(data, query) });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setView({ error: getErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [scope, query, attempt]);
  const targets = new Map(retained.map(target => [target._id, target]));
  for (const target of view.result?.data ?? [])
    targets.set(target._id, { ...target, unavailable: false });
  for (const id of value)
    if (!targets.has(id)) targets.set(id, { _id: id, name: null, unavailable: true });
  const options = [...targets.values()].map(target => ({
    value: target._id,
    label: target.unavailable ? `Không còn khả dụng (${target._id})` : (target.name ?? target._id)
  }));
  const changeQuery = (search: string, page = 1) => {
    setView({});
    setQuery({ ...query, search, page });
  };
  return (
    <Flex vertical gap={8}>
      {view.error && (
        <Alert
          type='error'
          title={view.error}
          action={
            <Button
              onClick={() => {
                setView({});
                setAttempt(n => n + 1);
              }}
            >
              Thử lại mục áp dụng
            </Button>
          }
        />
      )}
      <Select
        aria-label={label}
        mode='multiple'
        placeholder={scope === "products" ? "Tìm và chọn sản phẩm" : "Tìm và chọn danh mục"}
        // Server-side search: the API pages targets, so the Select must not filter locally.
        showSearch={{
          searchValue: query.search,
          onSearch: search => changeQuery(search.slice(0, 255)),
          filterOption: false,
          autoClearSearchValue: false
        }}
        loading={!view.result && !view.error}
        value={value}
        options={options}
        onChange={ids => {
          setRetained(ids.map((id: string) => targets.get(id)!).filter(Boolean));
          onChange?.(ids);
        }}
        popupRender={menu => (
          <>
            {menu}
            {view.result && view.result.total > query.pageSize && (
              // Keep focus in the Select so paging does not close the popup.
              <div className='px-2 pt-2' onMouseDown={event => event.preventDefault()}>
                <Pagination
                  size='small'
                  current={query.page}
                  pageSize={query.pageSize}
                  total={view.result.total}
                  showSizeChanger={false}
                  onChange={page => changeQuery(query.search, page)}
                />
              </div>
            )}
          </>
        )}
      />
    </Flex>
  );
}

export default function VoucherForm({
  voucher,
  busy,
  onSubmit
}: {
  voucher: AdminCouponDetail | null;
  busy: boolean;
  onSubmit(input: CouponInput): Promise<void>;
}) {
  const [form] = Form.useForm<CouponInput>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [scope, setScope] = useState<CouponScope>(voucher?.scopeType ?? "all");
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
    if (busy || saving.current) return;
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
      disabled={busy || submitting}
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
        <Input disabled={!!voucher || busy || submitting} maxLength={100} />
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
          <TargetPicker
            key={scope}
            scope={scope}
            selected={
              scope === "products"
                ? (voucher?.selectedProducts ?? [])
                : (voucher?.selectedCategories ?? [])
            }
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
