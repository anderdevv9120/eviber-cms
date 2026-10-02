import AuthLayout from "@/layouts/AuthLayout";
import { Form, Input, Button, Switch } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
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
      <div className='text-center font-bold my-3 text-2xl'>Đăng nhập vào CMS</div>

      <Form
        form={form}
        name='login'
        layout='vertical'
        onFinish={onFinish}
        requiredMark={false}
        disabled={isSubmitting}
      >
        <Form.Item
          label={<label className='text-base'>Email</label>}
          name='email'
          rules={[
            { required: true, message: EMAIL_REQUIRED_MESSAGE },
            { type: "email", message: EMAIL_INVALID_MESSAGE }
          ]}
        >
          <Input prefix={<UserOutlined />} placeholder='Email' className='text-base h-12' />
        </Form.Item>

        <Form.Item
          label={<label className='text-base '>Mật khẩu</label>}
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
            prefix={<LockOutlined />}
            placeholder='Mật khẩu'
            className='text-base h-12'
          />
        </Form.Item>

        <Form.Item name='remember' valuePropName='checked' className='mb-0'>
          <div className='mb-4'>
            <Switch className='mr-2' />
            <span>Lưu tài khoản</span>
          </div>
        </Form.Item>

        <Form.Item className='mb-0'>
          <Button type='primary' htmlType='submit' block size='large' loading={isSubmitting}>
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </Form.Item>
      </Form>
      <div className='text-center mt-3'>
        <Link to={PATH_AUTH.FORGET_PASSWORD} className='text-blue-500 underline block mb-2'>
          Quên mật khẩu?
        </Link>
      </div>
    </AuthLayout>
  );
};

export default Login;
