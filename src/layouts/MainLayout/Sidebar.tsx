import { useState } from "react";
import { Layout, Menu, Button, Flex, Tooltip } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  DesktopOutlined,
  ContainerOutlined,
  MailOutlined,
  AppstoreOutlined,
  PictureOutlined,
  StarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  InboxOutlined
} from "@ant-design/icons";
import { matchPath, useLocation, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import { safeOrderReturnTo } from "@/pages/Orders/order-list-query";

const { Sider } = Layout;
const COLLAPSED_KEY = "cms.sidebarCollapsed";

// Storage có thể bị chặn (private mode, site data tắt) → mặc định mở, không lưu
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(readCollapsed);
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
    pathname === PATH.CATEGORIES ||
    pathname === PATH.ATTRIBUTES ||
    !!matchPath(PATH.ATTRIBUTE_DETAIL, pathname);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const customersSelected =
    pathname === PATH.CUSTOMERS || pathname.startsWith(`${PATH.CUSTOMERS}/`);
  const productsSelected = pathname === PATH.PRODUCTS || pathname.startsWith(`${PATH.PRODUCTS}/`);
  const contentSelected = pathname === PATH.STORE_CONTENT || pathname === PATH.POLICIES;
  const selectedKey =
    pathname === PATH.STORE_CONTENT
      ? "store-content"
      : pathname === PATH.POLICIES
        ? "policies"
        : pathname === PATH.REPORTS
          ? "reports"
          : pathname === PATH.REVIEWS
            ? "reviews"
            : pathname === PATH.BANNERS
              ? "banners"
              : customersSelected
                ? "customers"
                : pathname === PATH.CATEGORIES
                  ? "categories"
                  : catalogSelected
                    ? "attributes"
                    : productsSelected
                      ? "2"
                      : pathname === PATH.INVENTORY
                        ? "inventory"
                        : paymentsSelected
                          ? "payments"
                          : pathname === PATH.ORDER || orderDetail
                            ? "3"
                            : pathname === PATH.VOUCHERS
                              ? "vouchers"
                              : "1";

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // bỏ qua: chỉ mất phần nhớ trạng thái
    }
  };

  const items = [
    { key: "1", icon: <PieChartOutlined />, label: "Trang chủ", onClick: () => navigate("/") },
    {
      key: "2",
      icon: <DesktopOutlined />,
      label: "Quản lý Sản phẩm",
      onClick: () => navigate(PATH.PRODUCTS)
    },
    {
      key: "inventory",
      icon: <InboxOutlined />,
      label: "Tồn kho",
      onClick: () => navigate(PATH.INVENTORY)
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
        {
          key: "categories",
          label: "Danh mục sản phẩm",
          onClick: () => navigate(PATH.CATEGORIES)
        },
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
      key: "vouchers",
      label: "Voucher",
      icon: <ContainerOutlined />,
      onClick: () => navigate(PATH.VOUCHERS)
    },
    {
      key: "banners",
      label: "Banner",
      icon: <PictureOutlined />,
      onClick: () => navigate(PATH.BANNERS)
    },
    {
      key: "content",
      label: "Nội dung",
      icon: <FileTextOutlined />,
      children: [
        {
          key: "store-content",
          label: "Nội dung cửa hàng",
          onClick: () => navigate(PATH.STORE_CONTENT)
        },
        { key: "policies", label: "Trang chính sách", onClick: () => navigate(PATH.POLICIES) }
      ]
    },
    {
      key: "reviews",
      label: "Đánh giá",
      icon: <StarOutlined />,
      onClick: () => navigate(PATH.REVIEWS)
    },
    {
      key: "reports",
      label: "Báo cáo bán hàng",
      icon: <BarChartOutlined />,
      onClick: () => navigate(PATH.REPORTS)
    }
  ];

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={230}
      collapsedWidth={80}
      className='sticky top-0 z-20 self-start h-screen'
    >
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
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mở menu" : "Thu gọn menu"}
          className='w-16! h-16 absolute right-[-84px] top-0'
        />
      </Tooltip>
      <Menu
        theme='dark'
        mode='inline'
        selectedKeys={[selectedKey]}
        openKeys={
          collapsed
            ? openKeys
            : Array.from(
                new Set([
                  ...openKeys,
                  ...(catalogSelected ? ["catalog"] : []),
                  ...(contentSelected ? ["content"] : [])
                ])
              )
        }
        onOpenChange={setOpenKeys}
        items={items}
      />
    </Sider>
  );
};

export default Sidebar;
