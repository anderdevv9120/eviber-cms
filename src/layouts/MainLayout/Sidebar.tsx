import { useState } from "react";
import { Layout, Menu, Button, Flex, Tooltip } from "antd";
import { matchPath, useLocation, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import { readOrderReturnTo } from "@/pages/Orders/order-list-query";
import Brand from "../Brand";
import { MENU_ITEMS, menuKeyOf } from "./menu";

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
  const fromCustomer =
    !!matchPath(PATH.ORDER_DETAIL, pathname) && readOrderReturnTo(search).fromCustomer;
  const selectedKey = menuKeyOf(fromCustomer ? PATH.CUSTOMERS : pathname) ?? PATH.DASHBOARD;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // bỏ qua: chỉ mất phần nhớ trạng thái
    }
  };

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
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS}
          className='cms-sider-menu'
        />
      </div>
    </Sider>
  );
};

export default Sidebar;
