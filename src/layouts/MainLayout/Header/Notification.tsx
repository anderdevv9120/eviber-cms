import { Badge, Dropdown, Flex } from "antd";
import { BellFilled } from "@ant-design/icons";

const Notification = () => {
  const notifications = [
    { id: 1, content: "Bạn có đơn hàng mới" },
    { id: 2, content: "Sản phẩm X đã hết hàng" },
    { id: 3, content: "Đơn hàng #1234 đã được xác nhận" }
  ];

  const menuItems = notifications.map(notification => ({
    key: notification.id,
    label: notification.content
  }));

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["hover"]} placement='bottom'>
      <Flex align='center' className='mr-6'>
        <Badge count={notifications.length} offset={[1, 0]} overflowCount={99}>
          <BellFilled className='text-xl cursor-pointer' />
        </Badge>
      </Flex>
    </Dropdown>
  );
};

export default Notification;
