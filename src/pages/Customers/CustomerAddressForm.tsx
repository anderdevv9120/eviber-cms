import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Flex, Form, Input } from "antd";
import type { CustomerAddress, CustomerAddressInput } from "@/services/customers";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

interface Props {
  address?: CustomerAddress;
  disabled?: boolean;
  onSubmit(input: CustomerAddressInput): Promise<void>;
  onCancel(): void;
}
const fields = [
  ["name", "Tên người nhận", 255, true],
  ["country", "Quốc gia", 100, false],
  ["city", "Tỉnh / Thành phố", 100, true],
  ["district", "Quận / Huyện", 100, false],
  ["ward", "Phường / Xã", 100, true],
  ["specificAddress", "Địa chỉ cụ thể", 500, true],
  ["phoneNumber", "Số điện thoại nhận hàng", 20, true],
  ["zip", "Mã bưu chính", 10, false]
] as const;

export default function CustomerAddressForm({ address, disabled, onSubmit, onCancel }: Props) {
  const profile = useAppStore(state => state.profile);
  const allowed = !!profile && canAccess(profile, { anyOf: ["CUSTOMER_UPDATE"] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const submit = async (values: CustomerAddressInput) => {
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] }) ||
      disabled ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit({
        name: values.name.trim(),
        country: values.country?.trim(),
        city: values.city.trim(),
        district: values.district?.trim(),
        ward: values.ward.trim(),
        specificAddress: values.specificAddress.trim(),
        phoneNumber: values.phoneNumber.trim(),
        zip: values.zip?.trim(),
        primary: values.primary ?? false
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <Form<CustomerAddressInput>
      layout='vertical'
      initialValues={address ?? { primary: false }}
      onFinish={submit}
      disabled={!allowed || disabled || saving}
    >
      {error && <Alert type='error' showIcon title={error} className='mb-4' />}
      {fields.map(([name, label, max, required]) => (
        <Form.Item
          key={name}
          name={name}
          label={label}
          rules={[
            { required, whitespace: required, message: `Nhập ${label.toLowerCase()}` },
            { max, transform: (value: string) => value?.trim(), message: `Tối đa ${max} ký tự` }
          ]}
        >
          <Input maxLength={max} />
        </Form.Item>
      ))}
      <Form.Item name='primary' valuePropName='checked'>
        <Checkbox>Địa chỉ chính</Checkbox>
      </Form.Item>
      <Flex gap={8} justify='end'>
        <Button onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
        <Button type='primary' htmlType='submit' loading={saving}>
          Lưu địa chỉ
        </Button>
      </Flex>
    </Form>
  );
}
