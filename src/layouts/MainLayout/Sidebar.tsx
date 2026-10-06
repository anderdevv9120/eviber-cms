import { useState } from "react";
import { Layout, Menu, Button, Flex, Tooltip } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  DesktopOutlined,
  ContainerOutlined,
  MailOutlined,
  AppstoreOutlined
} from "@ant-design/icons";
import { matchPath, useLocation, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import { safeOrderReturnTo } from "@/pages/Orders/order-list-query";

const { Sider } = Layout;

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const orderDetail = !!matchPath(PATH.ORDER_DETAIL, pathname);
  const returnTo = safeOrderReturnTo(
    params.getAll("returnTo").length === 1 ? params.get("returnTo") : null
  );
  const paymentsSelected =
    pathname === PATH.PAYMENTS || (orderDetail && returnTo.split("?")[0] === PATH.PAYMENTS);
  const catalogSelected =
    pathname === PATH.ATTRIBUTES || !!matchPath(PATH.ATTRIBUTE_DETAIL, pathname);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const customersSelected =
    pathname === PATH.CUSTOMERS || pathname.startsWith(`${PATH.CUSTOMERS}/`);
  const selectedKey = customersSelected
    ? "customers"
    : catalogSelected
      ? "attributes"
      : pathname === PATH.PRODUCT
        ? "2"
        : paymentsSelected
          ? "payments"
          : pathname === PATH.ORDER || orderDetail
            ? "3"
            : "1";

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
      key: "payments",
      icon: <ContainerOutlined />,
      label: "Quản lý Thanh toán",
      onClick: () => navigate(PATH.PAYMENTS)
    },
    {
      key: "catalog",
      label: "Danh mục",
      icon: <AppstoreOutlined />,
      children: [
        { key: "attributes", label: "Thuộc tính", onClick: () => navigate(PATH.ATTRIBUTES) }
      ]
    },
    {
      key: "customers",
      label: "Khách hàng",
      icon: <MailOutlined />,
      onClick: () => navigate(PATH.CUSTOMERS)
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
      <Tooltip title={collapsed ? "Mở menu" : "Thu gọn menu"} placement='right'>
        <Button
          type='text'
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Mở menu" : "Thu gọn menu"}
          className='w-16! h-16 absolute right-[-84px] top-0'
        />
      </Tooltip>
      <Menu
        theme='dark'
        mode='inline'
        selectedKeys={[selectedKey]}
        openKeys={
          catalogSelected && !collapsed ? Array.from(new Set([...openKeys, "catalog"])) : openKeys
        }
        onOpenChange={setOpenKeys}
        items={items}
      />
    </Sider>
  );
};

export default Sidebar;
