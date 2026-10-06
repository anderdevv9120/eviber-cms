import { Layout, Flex } from "antd";
import Notification from "./Notification";
import UserHeader from "./UserHeader";
import ThemeToggle from "./ThemeToggle";

const { Header } = Layout;

const HeaderMain = () => {
  return (
    <Header className='sticky top-0 z-10 flex bg-white shadow-md px-0'>
      <Flex justify='end' className='w-full pr-6'>
        <ThemeToggle />
        <Notification />
        <UserHeader />
      </Flex>
    </Header>
  );
};

export default HeaderMain;
