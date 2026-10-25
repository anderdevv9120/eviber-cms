import type { ReactNode } from "react";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ShoppingOutlined,
  InboxOutlined,
  AppstoreOutlined,
  TagOutlined,
  StarOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ApartmentOutlined,
  LayoutOutlined,
  SettingOutlined,
  ShopOutlined,
  GiftOutlined,
  UserAddOutlined
} from "@ant-design/icons";
import type { Profile } from "@/store/useAppStore";
import { canAccess, NAVIGATION_POLICIES } from "@/utils/access";
import { PATH } from "@/constants/paths";

type MenuItem = { key: string; icon: ReactNode; label: string };

export const MENU_SECTIONS: { title: string | null; items: MenuItem[] }[] = [
  {
    title: null,
    items: [
      { key: PATH.DASHBOARD, icon: <HomeOutlined />, label: "Tổng quan" },
      { key: PATH.REPORTS, icon: <BarChartOutlined />, label: "Báo cáo bán hàng" }
    ]
  },
  {
    title: "Bán hàng",
    items: [
      { key: PATH.ORDER, icon: <ShoppingCartOutlined />, label: "Đơn hàng" },
      { key: PATH.CUSTOMERS, icon: <TeamOutlined />, label: "Khách hàng" },
      { key: PATH.REVIEWS, icon: <StarOutlined />, label: "Đánh giá" },
      { key: PATH.VOUCHERS, icon: <TagOutlined />, label: "Voucher" }
    ]
  },
  {
    title: "Catalog",
    items: [
      { key: PATH.PRODUCTS, icon: <ShoppingOutlined />, label: "Sản phẩm" },
      { key: PATH.COMBOS, icon: <GiftOutlined />, label: "Combo" },
      { key: PATH.INVENTORY, icon: <InboxOutlined />, label: "Tồn kho" },
      { key: PATH.CATEGORIES, icon: <AppstoreOutlined />, label: "Danh mục sản phẩm" },
      { key: PATH.ATTRIBUTES, icon: <ApartmentOutlined />, label: "Thuộc tính" }
    ]
  },
  {
    title: "Nội dung",
    items: [
      { key: PATH.CONTENT_HOME, icon: <LayoutOutlined />, label: "Trang chủ" },
      { key: PATH.CONTENT_INFO, icon: <ShopOutlined />, label: "Thông tin cửa hàng" },
      { key: PATH.POLICIES, icon: <FileTextOutlined />, label: "Trang chính sách" }
    ]
  },
  {
    title: "Cài đặt",
    items: [
      { key: PATH.SETTINGS_CHECKOUT, icon: <SettingOutlined />, label: "Đặt hàng" },
      // "Vai trò" đứng trước "Nhân viên": menuKeyOf khớp tiền tố đầu tiên,
      // /settings/access/roles phải khớp đúng mục Vai trò chứ không phải /settings/access
      { key: PATH.SETTINGS_ROLES, icon: <TeamOutlined />, label: "Vai trò" },
      { key: PATH.SETTINGS_ACCESS, icon: <UserAddOutlined />, label: "Nhân viên" }
    ]
  }
];

export const menuItemsFor = (profile: Profile): MenuProps["items"] =>
  MENU_SECTIONS.flatMap<NonNullable<MenuProps["items"]>[number]>(({ title, items }, index) => {
    const allowed = items.filter(item => canAccess(profile, NAVIGATION_POLICIES[item.key]));
    if (!allowed.length) return [];
    return title
      ? [{ type: "group", key: `group-${index}`, label: title, children: allowed }]
      : allowed;
  });

const MENU_PATHS = MENU_SECTIONS.flatMap(({ items }) => items.map(({ key }) => key));

// Key = path danh sách; route con (chi tiết, "/" cuối) thuộc về mục cha
export const menuKeyOf = (pathname: string): string | undefined =>
  MENU_PATHS.find(path => pathname === path || pathname.startsWith(`${path}/`));
