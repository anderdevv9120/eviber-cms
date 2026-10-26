import { useRef, useState } from "react";
import { Alert, Button, Flex, Form, Input, Select } from "antd";
import type {
  RegisteredCustomerDetail,
  CreateCustomerInput,
  UpdateCustomerInput
} from "@/services/customers";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

interface Props {
  customer?: RegisteredCustomerDetail;
  disabled?: boolean;
  onSubmit: (input: CreateCustomerInput | UpdateCustomerInput) => Promise<void>;
  onCancel: () => void;
}
type Fields = CreateCustomerInput;

export default function CustomerForm({ customer, disabled = false, onSubmit, onCancel }: Props) {
  const profile = useAppStore(state => state.profile);
  const permission = customer ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE";
  const allowed = !!profile && canAccess(profile, { anyOf: [permission] });
  const [form] = Form.useForm<Fields>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const submit = async (fields: Fields) => {
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: [permission] }) ||
      disabled ||
      submittingRef.current
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const profile: UpdateCustomerInput = {
        ...(fields.firstName !== undefined ? { firstName: fields.firstName.trim() } : {}),
        ...(fields.lastName !== undefined ? { lastName: fields.lastName.trim() } : {}),
        ...(fields.phone?.trim() ? { phone: fields.phone.trim() } : {}),
        ...(fields.gender ? { gender: fields.gender } : {}),
        ...(fields.imgUrl !== undefined ? { imgUrl: fields.imgUrl.trim() } : {})
      };
      await onSubmit(
        customer
          ? profile
          : {
              email: fields.email.trim().toLowerCase(),
              password: fields.password,
              ...profile
            }
      );
      form.setFieldValue("password", "");
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Form<Fields>
      form={form}
      layout='vertical'
      initialValues={
        customer
          ? {
              firstName: customer.firstName,
              lastName: customer.lastName,
              phone: customer.phone,
              gender: customer.gender,
              imgUrl: customer.imgUrl
            }
          : undefined
      }
      onFinish={submit}
      disabled={!allowed || disabled || submitting}
    >
      {error && <Alert type='error' showIcon title={error} className='mb-4' />}
      {!customer && (
        <>
          <Form.Item
            name='email'
            label='Email'
            rules={[
              { required: true, message: "Nhập email" },
              {
                type: "email",
                transform: (value: string) => value?.trim(),
                message: "Email không hợp lệ"
              },
              {
                max: 100,
                transform: (value: string) => value?.trim(),
                message: "Email tối đa 100 ký tự"
              }
            ]}
          >
            <Input autoFocus autoComplete='off' maxLength={100} />
          </Form.Item>
          <Form.Item
            name='password'
            label='Mật khẩu'
            rules={[
              { required: true, message: "Nhập mật khẩu" },
              { min: 8, max: 128, message: "Mật khẩu từ 8 đến 128 ký tự" },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                message: "Mật khẩu cần chữ hoa, chữ thường, số và ký tự @$!%*?&"
              }
            ]}
          >
            <Input.Password autoComplete='new-password' maxLength={128} />
          </Form.Item>
        </>
      )}
      <Form.Item
        name='firstName'
        label='Tên'
        rules={[{ max: 255, transform: (value: string) => value?.trim() }]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item
        name='lastName'
        label='Họ'
        rules={[{ max: 255, transform: (value: string) => value?.trim() }]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item
        name='phone'
        label='Số điện thoại'
        rules={[
          {
            validator: (_, value?: string) =>
              !value?.trim() ||
              (value.trim().length >= 8 &&
                value.trim().length <= 14 &&
                /^[0-9+\-\s()]+$/.test(value.trim()))
                ? Promise.resolve()
                : Promise.reject(
                    new Error(
                      "Số điện thoại từ 8 đến 14 ký tự, chỉ chứa số, +, -, khoảng trắng và dấu ngoặc"
                    )
                  )
          }
        ]}
      >
        <Input maxLength={14} />
      </Form.Item>
      <Form.Item name='gender' label='Giới tính'>
        <Select
          allowClear
          options={[
            { value: "MALE", label: "Nam" },
            { value: "FEMALE", label: "Nữ" },
            { value: "OTHER", label: "Khác" }
          ]}
        />
      </Form.Item>
      <Form.Item
        name='imgUrl'
        label='URL ảnh đại diện'
        rules={[{ max: 255, transform: (value: string) => value?.trim() }]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Flex gap={8} wrap justify='end'>
        <Button onClick={onCancel} disabled={submitting}>
          Hủy
        </Button>
        <Button type='primary' htmlType='submit' loading={submitting}>
          {customer ? "Lưu hồ sơ" : "Tạo khách hàng"}
        </Button>
      </Flex>
    </Form>
  );
}
