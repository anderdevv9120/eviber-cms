import { ReactNode } from "react";
import { Layout, Card, Flex } from "antd";

interface Props {
  children: ReactNode;
}

const AuthLayout = ({ children }: Props) => {
  return (
    <Layout className='w-screen h-screen flex justify-center items-center bg-gray-100'>
      <Card className='w-full max-w-[500px] shadow-2xl rounded-2xl bg-white'>
        <Flex justify='start' align='center' gap={12} className='mb-6'>
          <img src='/images/logo1.png' alt='logo1' className='h-20 object-contain' />
          <img src='/images/logo.png' alt='logo' className='h-20 object-contain' />
        </Flex>

        {children}
      </Card>
    </Layout>
  );
};

export default AuthLayout;
