import AuthLayout from "@/layouts/AuthLayout";
import { Form, Input, Button, Checkbox } from "antd";
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import { PASSWORD_REGEX } from "@/constants";
import { Link } from "react-router";
import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  PASSWORD_REQUIRED_MESSAGE,
  PASSWORD_RULE_MESSAGE
} from "@/constants/validate";
import { PATH_AUTH } from "@/constants/paths";
import { useState } from "react";
import { useNavigate } from "react-router";
import { loginAPI } from "@/services/auth";
import { saveTokens } from "@/utils/session";
import { useAppStore } from "@/store/useAppStore";
import { successNotification, errorNotification } from "@/utils/notification";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { PATH } from "@/constants/paths";

interface IFormInput {
  email: string;
  password: string;
  remember?: boolean;
}

const Login = () => {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: IFormInput) => {
    const { email, password } = values;

    try {
      setIsSubmitting(true);
      const response = await loginAPI({ email, password });

      useAppStore.getState().clearProfile();
      saveTokens(response.data);

      successNotification("Đăng nhập thành công!");
      navigate(PATH.DASHBOARD, { replace: true });
    } catch (error) {
      errorNotification(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className='m-0 text-[22px] leading-[30px] font-semibold'>Đăng nhập vào CMS</h1>
      <p className='mt-1 mb-6 text-(--ant-color-text-tertiary)'>
        Dùng tài khoản quản trị được cấp để vào bảng điều khiển.
      </p>

      <Form
        form={form}
        name='login'
        layout='vertical'
        size='large'
        onFinish={onFinish}
        requiredMark={false}
        disabled={isSubmitting}
      >
        <Form.Item
          label='Email'
          name='email'
          rules={[
            { required: true, message: EMAIL_REQUIRED_MESSAGE },
            { type: "email", message: EMAIL_INVALID_MESSAGE }
          ]}
        >
          <Input
            prefix={<MailOutlined className='text-(--ant-color-text-tertiary)' />}
            placeholder='admin@example.com'
          />
        </Form.Item>

        <div className='relative'>
          <Form.Item
            label='Mật khẩu'
            name='password'
            rules={[
              { required: true, message: PASSWORD_REQUIRED_MESSAGE },
              {
                pattern: PASSWORD_REGEX,
                message: PASSWORD_RULE_MESSAGE
              }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className='text-(--ant-color-text-tertiary)' />}
            />
          </Form.Item>
          {/* Ngoài <label>: nằm trong label thì tên đọc của ô mật khẩu dính chữ link, Tab vào link trước ô */}
          <Link
            to={PATH_AUTH.FORGET_PASSWORD}
            className='absolute top-0 right-0 flex h-10 items-center text-sm text-(--ant-color-link) hover:underline'
          >
            Quên mật khẩu?
          </Link>
        </div>

        <Form.Item name='remember' valuePropName='checked' className='mb-5'>
          <Checkbox>Ghi nhớ đăng nhập</Checkbox>
        </Form.Item>

        <Form.Item className='mb-0'>
          <Button type='primary' htmlType='submit' block loading={isSubmitting}>
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
};

export default Login;
