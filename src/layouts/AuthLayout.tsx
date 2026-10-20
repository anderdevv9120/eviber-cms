import { ReactNode } from "react";
import { Card, theme } from "antd";
import Brand from "./Brand";

interface Props {
  children: ReactNode;
}

const AuthLayout = ({ children }: Props) => {
  const { token } = theme.useToken();
  return (
    <main
      className='min-h-screen w-full flex flex-col items-center justify-center gap-6 px-4 py-10'
      style={{ background: token.colorBgLayout }}
    >
      <Brand />
      <Card
        variant='outlined'
        className='w-full max-w-106 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]'
        styles={{ body: { padding: 32 } }}
      >
        {children}
      </Card>
      <p className='m-0 text-xs' style={{ color: token.colorTextTertiary }}>
        Chỉ dành cho tài khoản quản trị
      </p>
    </main>
  );
};

export default AuthLayout;
