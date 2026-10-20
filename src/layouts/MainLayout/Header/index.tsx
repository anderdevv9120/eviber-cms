import type { ReactNode } from "react";
import { Layout, Flex } from "antd";
import Notification from "./Notification";
import UserHeader from "./UserHeader";
import ThemeToggle from "./ThemeToggle";

const { Header } = Layout;

interface HeaderMainProps {
  breadcrumb: ReactNode;
}

const HeaderMain = ({ breadcrumb }: HeaderMainProps) => {
  return (
    <Header className='flex shrink-0 items-center gap-4 border-b border-(--ant-color-border-secondary)'>
      <div className='min-w-0 flex-1'>{breadcrumb}</div>
      <Flex align='center' gap={4}>
        <ThemeToggle />
        <Notification />
        <UserHeader />
      </Flex>
    </Header>
  );
};

export default HeaderMain;
