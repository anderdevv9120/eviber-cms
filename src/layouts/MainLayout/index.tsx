import { Suspense, useEffect } from "react";
import { Layout, Breadcrumb, Spin, Flex } from "antd";
import { Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { getProfileAPI } from "@/services/auth";
import Sidebar from "./Sidebar";
import HeaderMain from "./Header";

const { Content } = Layout;

const MainLayout = () => {
  const { profile, setProfile } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    getProfileAPI().then(res => {
      if (res && res.data) {
        setProfile(res.data);
      }
    });
  }, [navigate]);

  if (!profile) {
    return (
      <Flex justify='center' align='center' className='min-h-screen'>
        <Spin size='large' />
      </Flex>
    );
  }

  return (
    <div className='min-h-screen flex'>
      <Sidebar />
      <Layout>
        <HeaderMain />
        <Breadcrumb items={[{ title: "Trang chủ" }, { title: "Sản phẩm" }]} className='p-6 py-4' />
        <Content className='m-5 p-5 mt-0 bg-white rounded-lg shadow-md'>
          <Suspense
            fallback={
              <Flex justify='center' align='center' className='min-h-full'>
                <Spin size='large' />
              </Flex>
            }
          >
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </div>
  );
};

export default MainLayout;
