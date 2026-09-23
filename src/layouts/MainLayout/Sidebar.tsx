import { useState } from "react";
import { Layout, Menu, Button, Flex } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  DesktopOutlined,
  ContainerOutlined,
  MailOutlined,
  AppstoreOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Sider } = Layout;

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const items = [
    { key: "1", icon: <PieChartOutlined />, label: "Trang chủ", onClick: () => navigate("/") },
    {
      key: "2",
      icon: <DesktopOutlined />,
      label: "Quản lý Sản phẩm",
      onClick: () => navigate("/product")
    },
    {
      key: "3",
      icon: <ContainerOutlined />,
      label: "Quản lý Đơn hàng",
      onClick: () => navigate("/orders")
    },
    {
      key: "sub1",
      label: "Quản lý Khách hàng",
      icon: <MailOutlined />,
      children: [
        { key: "5", label: "Danh sách Khách hàng", onClick: () => navigate("/customers") },
        { key: "6", label: "Thêm Khách hàng", onClick: () => navigate("/customers/add") }
      ]
    },
    {
      key: "sub2",
      label: "Báo cáo và Thống kê",
      icon: <AppstoreOutlined />,
      children: [
        { key: "9", label: "Báo cáo Doanh thu", onClick: () => navigate("/reports/revenue") },
        { key: "10", label: "Báo cáo Sản phẩm", onClick: () => navigate("/reports/products") }
      ]
    }
  ];

  return (
    <Sider trigger={null} collapsible collapsed={collapsed} width={230} collapsedWidth={80}>
      <Flex
        justify='center'
        align='center'
        className='h-16 text-white text-3xl font-bold relative border-b border-b-slate-500 mb-4'
      >
        CMS
      </Flex>
      <Button
        type='text'
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        className='!w-16 h-16 absolute right-[-84px] top-0'
      />
      <Menu theme='dark' mode='inline' defaultSelectedKeys={["1"]} items={items} />
    </Sider>
  );
};

export default Sidebar;
