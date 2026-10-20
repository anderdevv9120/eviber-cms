import { useState } from "react";
import { Layout, Menu, Button, Flex, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  ShoppingCartOutlined,
  CreditCardOutlined,
  TeamOutlined,
  ShoppingOutlined,
  InboxOutlined,
  AppstoreOutlined,
  TagOutlined,
  PictureOutlined,
  StarOutlined,
  FileTextOutlined,
  BarChartOutlined
} from "@ant-design/icons";
import { matchPath, useLocation, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import { safeOrderReturnTo } from "@/pages/Orders/order-list-query";
import Brand from "../Brand";

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

  const sections: { title: string | null; items: NonNullable<MenuProps["items"]> }[] = [
    {
      title: null,
      items: [
        { key: "1", icon: <HomeOutlined />, label: "Trang chủ", onClick: () => navigate("/") }
      ]
    },
    {
      title: "Bán hàng",
      items: [
        {
          key: "3",
          icon: <ShoppingCartOutlined />,
          label: "Quản lý Đơn hàng",
          onClick: () => navigate("/orders")
        },
        {
          key: "payments",
          icon: <CreditCardOutlined />,
          label: "Quản lý Thanh toán",
          onClick: () => navigate(PATH.PAYMENTS)
        },
        {
          key: "customers",
          icon: <TeamOutlined />,
          label: "Khách hàng",
          onClick: () => navigate(PATH.CUSTOMERS)
        }
      ]
    },
    {
      title: "Catalog",
      items: [
        {
          key: "2",
          icon: <ShoppingOutlined />,
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
        }
      ]
    },
    {
      title: "Marketing",
      items: [
        {
          key: "vouchers",
          icon: <TagOutlined />,
          label: "Voucher",
          onClick: () => navigate(PATH.VOUCHERS)
        },
        {
          key: "banners",
          icon: <PictureOutlined />,
          label: "Banner",
          onClick: () => navigate(PATH.BANNERS)
        },
        {
          key: "reviews",
          icon: <StarOutlined />,
          label: "Đánh giá",
          onClick: () => navigate(PATH.REVIEWS)
        }
      ]
    },
    {
      title: "Nội dung",
      items: [
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
        }
      ]
    },
    {
      title: "Báo cáo",
      items: [
        {
          key: "reports",
          icon: <BarChartOutlined />,
          label: "Báo cáo bán hàng",
          onClick: () => navigate(PATH.REPORTS)
        }
      ]
    }
  ];

  const items: MenuProps["items"] = sections.flatMap(({ title, items: groupItems }, index) =>
    title
      ? [{ type: "group" as const, key: `group-${index}`, label: title, children: groupItems }]
      : groupItems
  );

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={280}
      collapsedWidth={68}
      className='sticky top-0 z-20 self-start h-screen [&>.ant-layout-sider-children]:flex [&>.ant-layout-sider-children]:flex-col'
    >
      <Flex align='center' className='mt-2 h-16 shrink-0 overflow-hidden px-4.5'>
        <Brand compact={collapsed} />
      </Flex>
      <Tooltip title={collapsed ? "Mở menu" : "Thu gọn menu"} placement='right'>
        <Button
          shape='circle'
          size='small'
          icon={
            <svg
              viewBox='0 0 24 24'
              aria-hidden
              className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "rotate-180" : ""}`}
              fill='none'
              stroke='currentColor'
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <path d='m15 18-6-6 6-6' />
            </svg>
          }
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mở menu" : "Thu gọn menu"}
          className='absolute! -right-4 top-6 z-30 size-8! text-(--ant-color-text-tertiary) shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:text-(--ant-color-primary-text)!'
        />
      </Tooltip>
      <div className='min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:thin]'>
        <Menu
          mode='inline'
          inlineIndent={14}
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
          className='cms-sider-menu'
        />
      </div>
    </Sider>
  );
};

export default Sidebar;
