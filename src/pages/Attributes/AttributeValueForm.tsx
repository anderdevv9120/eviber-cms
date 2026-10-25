import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useRef, useState } from "react";
import { Alert, Button, ColorPicker, Flex, Form, Input, Switch } from "antd";
import type { AttributeValueSummary, CreateAttributeValueInput } from "@/services/attributes";
import { getErrorMessage } from "@/utils/getErrorMessage";

interface Props {
  value?: AttributeValueSummary;
  expectedRevision: number;
  disabled?: boolean;
  onSubmit: (input: CreateAttributeValueInput) => Promise<void>;
  onCancel: () => void;
}
export default function AttributeValueForm({
  value,
  expectedRevision,
  disabled = false,
  onSubmit,
  onCancel
}: Props) {
  const [colorEnabled, setColorEnabled] = useState(!!value?.meta);
  const [color, setColor] = useState(value?.meta ?? "#000000");
  const profile = useAppStore(state => state.profile);
  const permitted = !!profile && canAccess(profile, { anyOf: ["ATTRIBUTE_UPDATE"] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const submit = async ({ label }: { label: string }) => {
    const latest = useAppStore.getState().profile;
    if (
      !latest ||
      !canAccess(latest, { anyOf: ["ATTRIBUTE_UPDATE"] }) ||
      disabled ||
      submittingRef.current
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        value: label,
        expectedRevision,
        ...(colorEnabled ? { meta: color } : value ? { meta: null } : {})
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Form
      layout='vertical'
      initialValues={{ label: value?.value }}
      onFinish={submit}
      disabled={disabled || submitting || !permitted}
    >
      {error && <Alert type='error' showIcon title={error} className='mb-4' />}
      {value && (
        <Alert
          type='info'
          showIcon
          className='mb-4'
          title='Đổi tên sẽ cập nhật nhãn trên các sản phẩm đang tham chiếu. Nhãn trong đơn hàng đã mua được giữ nguyên.'
        />
      )}
      <Form.Item
        name='label'
        label='Tên giá trị'
        rules={[
          {
            validator: (_, input: string | undefined) => {
              const label = (input ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");
              return label.length >= 1 && label.length <= 255
                ? Promise.resolve()
                : Promise.reject(new Error("Tên giá trị phải có từ 1 đến 255 ký tự"));
            }
          }
        ]}
      >
        <Input autoFocus />
      </Form.Item>
      <Form.Item label='Sử dụng màu'>
        <Switch aria-label='Sử dụng màu' checked={colorEnabled} onChange={setColorEnabled} />
      </Form.Item>
      {colorEnabled && (
        <Flex align='center' gap={12} className='mb-4'>
          <ColorPicker
            value={color}
            disabled={disabled || submitting || !permitted}
            disabledAlpha
            format='hex'
            onChange={selected => setColor(selected.toHexString().toUpperCase())}
          >
            <Button
              disabled={disabled || submitting || !permitted}
              aria-label={`Chọn màu ${color}`}
            >
              {color}
            </Button>
          </ColorPicker>
          <span
            aria-label={`Màu ${color}`}
            style={{ width: 24, height: 24, backgroundColor: color, border: "1px solid #999" }}
          />
        </Flex>
      )}
      <Flex gap={8} justify='end'>
        <Button disabled={submitting} onClick={onCancel}>
          Hủy
        </Button>
        <Button type='primary' htmlType='submit' loading={submitting}>
          {value ? "Lưu giá trị" : "Tạo giá trị"}
        </Button>
      </Flex>
    </Form>
  );
}
