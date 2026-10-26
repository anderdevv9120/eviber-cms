import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useRef, useState } from "react";
import { Alert, Button, Flex, Form, Input } from "antd";
import type {
  AttributeSummary,
  CreateAttributeInput,
  UpdateAttributeInput
} from "@/services/attributes";
import { getErrorMessage } from "@/utils/getErrorMessage";

interface Props {
  attribute?: AttributeSummary;
  disabled?: boolean;
  onSubmit: (input: CreateAttributeInput | UpdateAttributeInput) => Promise<void>;
  onCancel: () => void;
}
interface Fields {
  name: string;
  code: string;
}

export default function AttributeForm({ attribute, disabled = false, onSubmit, onCancel }: Props) {
  const profile = useAppStore(state => state.profile);
  const permitted =
    !!profile &&
    canAccess(profile, { anyOf: [attribute ? "ATTRIBUTE_UPDATE" : "ATTRIBUTE_CREATE"] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const submit = async (fields: Fields) => {
    const latest = useAppStore.getState().profile;
    if (
      !latest ||
      !canAccess(latest, { anyOf: [attribute ? "ATTRIBUTE_UPDATE" : "ATTRIBUTE_CREATE"] }) ||
      disabled ||
      submittingRef.current
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        attribute ? { name: fields.name, expectedRevision: attribute.revision } : fields
      );
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Form<Fields>
      layout='vertical'
      initialValues={attribute ? { name: attribute.name, code: attribute.code } : undefined}
      onFinish={submit}
      disabled={disabled || submitting || !permitted}
    >
      {error && <Alert type='error' showIcon title={error} className='mb-4' />}
      {attribute && (
        <Alert
          type='info'
          showIcon
          className='mb-4'
          title='Đổi tên sẽ cập nhật nhãn trên các sản phẩm đang tham chiếu. Nhãn trong đơn hàng đã mua được giữ nguyên.'
        />
      )}
      <Form.Item
        name='name'
        label='Tên thuộc tính'
        rules={[
          {
            validator: (_, input: string | undefined) => {
              const label = (input ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");
              return label.length >= 1 && label.length <= 255
                ? Promise.resolve()
                : Promise.reject(new Error("Tên thuộc tính phải có từ 1 đến 255 ký tự"));
            }
          }
        ]}
      >
        <Input autoFocus />
      </Form.Item>
      <Form.Item
        name='code'
        label='Mã thuộc tính'
        rules={
          attribute
            ? []
            : [
                {
                  validator: (_, input: string | undefined) =>
                    /^[a-z][a-z0-9_-]{0,254}$/i.test((input ?? "").trim())
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(
                            "Mã phải bắt đầu bằng chữ cái, chỉ chứa chữ, số, dấu - hoặc _, tối đa 255 ký tự"
                          )
                        )
                }
              ]
        }
      >
        <Input readOnly={!!attribute} />
      </Form.Item>
      <Flex gap={8} wrap justify='end'>
        <Button onClick={onCancel}>Hủy</Button>
        <Button type='primary' htmlType='submit' loading={submitting}>
          {attribute ? "Lưu tên" : "Tạo thuộc tính"}
        </Button>
      </Flex>
    </Form>
  );
}
