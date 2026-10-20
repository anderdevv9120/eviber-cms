import { Badge, Button, Dropdown } from "antd";
import { BellOutlined } from "@ant-design/icons";

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
    <Dropdown menu={{ items: menuItems }} trigger={["hover", "click"]} placement='bottomRight'>
      <Badge count={notifications.length} size='small' offset={[-6, 6]} overflowCount={99}>
        <Button
          type='text'
          shape='circle'
          size='large'
          aria-label='Thông báo'
          icon={<BellOutlined />}
          className='text-(--ant-color-text-secondary)'
        />
      </Badge>
    </Dropdown>
  );
};

export default Notification;
