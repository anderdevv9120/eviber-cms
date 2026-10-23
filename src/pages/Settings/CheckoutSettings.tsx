import { Card, Flex, Typography } from "antd";
import GuestCheckoutSwitch from "./GuestCheckoutSwitch";

export default function CheckoutSettings() {
  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={2} className='mb-1!'>
          Đặt hàng
        </Typography.Title>
        <Typography.Text type='secondary'>
          Quy định áp dụng cho mọi lượt mua trên cửa hàng.
        </Typography.Text>
      </div>
      <Card title='Khách vãng lai'>
        <GuestCheckoutSwitch />
      </Card>
    </Flex>
  );
}
