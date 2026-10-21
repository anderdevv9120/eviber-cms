import { Alert, Card, Flex, InputNumber, Radio, Typography } from "antd";
import type { ComboPricing } from "@/services/combos";
import type { Totals } from "./combo-pricing";

const vnd = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;

export default function ComboPriceSection({
  pricing,
  cheapest,
  priciest,
  fixedAboveCheapest,
  disabled,
  onChange
}: {
  pricing: ComboPricing;
  cheapest: Totals | null;
  priciest: Totals | null;
  fixedAboveCheapest: boolean;
  disabled: boolean;
  onChange: (pricing: ComboPricing) => void;
}) {
  return (
    <Card title='Giá combo'>
      <Flex vertical gap={12}>
        <Radio.Group
          aria-label='Cách tính giá'
          value={pricing.mode}
          disabled={disabled}
          onChange={event =>
            onChange({ mode: event.target.value as ComboPricing["mode"], value: pricing.value })
          }
          options={[
            { label: "Giảm theo %", value: "PERCENT" },
            { label: "Giá cố định", value: "FIXED" }
          ]}
        />
        <InputNumber
          aria-label={pricing.mode === "PERCENT" ? "Phần trăm giảm" : "Giá cố định (VND)"}
          value={pricing.value}
          min={1}
          max={pricing.mode === "PERCENT" ? undefined : Number.MAX_SAFE_INTEGER}
          precision={0}
          disabled={disabled}
          className='w-full'
          addonAfter={pricing.mode === "PERCENT" ? "%" : "₫"}
          onChange={value => onChange({ ...pricing, value: value ?? 0 })}
        />
        <Typography.Text type='secondary'>
          Giá gốc tính từ giá bán hiện tại của biến thể; không tính tồn kho.
        </Typography.Text>
        {cheapest && priciest ? (
          <Flex vertical gap={4}>
            <span>
              Rẻ nhất: {vnd(cheapest.normal)} → {vnd(cheapest.combo)}
            </span>
            <span>
              Đắt nhất: {vnd(priciest.normal)} → {vnd(priciest.combo)}
            </span>
          </Flex>
        ) : (
          <Typography.Text type='secondary'>
            Chọn các món và biến thể đang hoạt động để xem giá.
          </Typography.Text>
        )}
        {fixedAboveCheapest && (
          <Alert
            type='warning'
            showIcon
            title='Giá cố định cao hơn tổng giá thường rẻ nhất; giá bán sẽ tự giới hạn ở tổng giá thường.'
          />
        )}
      </Flex>
    </Card>
  );
}
