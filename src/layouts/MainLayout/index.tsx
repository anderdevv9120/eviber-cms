import { Suspense, useEffect, useState } from "react";
import { Layout, Breadcrumb, Spin, Flex, Result, Button } from "antd";
import { Link, matchPath, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { getProfileAPI } from "@/services/auth";
import { clearSession, hasSession } from "@/utils/session";
import { ApiError } from "@/utils/request";
import { PATH, PATH_AUTH } from "@/constants/paths";
import Sidebar from "./Sidebar";
import HeaderMain from "./Header";
import { safeOrderReturnTo } from "@/pages/Orders/order-list-query";
import { safeCustomerReturnTo } from "@/pages/Customers/customer-list-query";

const { Content } = Layout;

const MainLayout = () => {
  const { profile, setProfile } = useAppStore();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const attributeDetail = !!matchPath(PATH.ATTRIBUTE_DETAIL, pathname);
  const orderDetail = !!matchPath(PATH.ORDER_DETAIL, pathname);
  const customerDetail = !!matchPath(PATH.CUSTOMER_DETAIL, pathname);
  const guestDetail = pathname === PATH.GUEST_BUYER_DETAIL;
  const params = new URLSearchParams(search);
  const returnTo = safeOrderReturnTo(
    params.getAll("returnTo").length === 1 ? params.get("returnTo") : null
  );
  const paymentsOrigin =
    pathname === PATH.PAYMENTS || (orderDetail && returnTo.split("?")[0] === PATH.PAYMENTS);
  const breadcrumbs =
    pathname === PATH.CUSTOMERS || customerDetail || guestDetail
      ? [
          {
            title:
              customerDetail || guestDetail ? (
                <Link
                  to={safeCustomerReturnTo(
                    params.getAll("returnTo").length === 1 ? params.get("returnTo") : null
                  )}
                >
                  Khách hàng
                </Link>
              ) : (
                "Khách hàng"
              )
          },
          ...(customerDetail ? [{ title: "Khách hàng đã đăng ký" }] : []),
          ...(guestDetail ? [{ title: "Khách vãng lai" }] : [])
        ]
      : pathname === PATH.ATTRIBUTES || attributeDetail
        ? [
            { title: "Danh mục" },
            {
              title: attributeDetail ? <Link to={PATH.ATTRIBUTES}>Thuộc tính</Link> : "Thuộc tính"
            },
            ...(attributeDetail ? [{ title: "Chi tiết thuộc tính" }] : [])
          ]
        : orderDetail || pathname === PATH.ORDER || pathname === PATH.PAYMENTS
          ? [
              {
                title: orderDetail ? (
                  <Link to={returnTo}>
                    {paymentsOrigin ? "Quản lý Thanh toán" : "Quản lý Đơn hàng"}
                  </Link>
                ) : paymentsOrigin ? (
                  "Quản lý Thanh toán"
                ) : (
                  "Quản lý Đơn hàng"
                )
              },
              ...(orderDetail ? [{ title: "Chi tiết đơn hàng" }] : [])
            ]
          : pathname === PATH.STORE_CONTENT
            ? [{ title: "Nội dung" }, { title: "Nội dung cửa hàng" }]
            : pathname === PATH.POLICIES
              ? [{ title: "Nội dung" }, { title: "Trang chính sách" }]
              : pathname === PATH.BANNERS
                ? [{ title: "Banner" }]
                : pathname === PATH.REVIEWS
                  ? [{ title: "Đánh giá" }]
                  : pathname === PATH.REPORTS
                    ? [{ title: "Báo cáo bán hàng" }]
                    : pathname === PATH.INVENTORY
                      ? [{ title: "Tồn kho" }]
                      : pathname === PATH.VOUCHERS
                        ? [{ title: "Voucher" }]
                        : pathname === PATH.DASHBOARD
                          ? [{ title: "Trang chủ" }]
                          : [{ title: "Trang chủ" }, { title: "Sản phẩm" }];
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProfileAPI()
      .then(res => {
        // Đăng xuất trong lúc request còn bay: không ghi lại profile vừa dọn
        if (cancelled || !hasSession()) return;
        if (!res?.data?._id) throw new Error("Invalid profile response");
        setProfile(res.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Server từ chối phiên (chưa đăng nhập / hết hạn / mất quyền) → về login thay vì màn lỗi
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearSession();
        }
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, setProfile]);

  const handleRetry = () => {
    setLoadFailed(false);
    setAttempt(value => value + 1);
  };

  const handleRelogin = () => {
    clearSession();
    navigate(PATH_AUTH.LOGIN, { replace: true });
  };

  // Phiên bị dọn ở bất kỳ request nào (refresh bị từ chối) → không còn cookie, về login
  if (!profile && !hasSession()) {
    return <Navigate to={PATH_AUTH.LOGIN} replace />;
  }

  if (!profile && loadFailed) {
    return (
      <Flex justify='center' align='center' className='min-h-screen'>
        <Result
          status='error'
          title='Không tải được thông tin tài khoản'
          subTitle='Kiểm tra kết nối tới máy chủ quản trị rồi thử lại.'
          extra={[
            <Button key='retry' type='primary' onClick={handleRetry}>
              Thử lại
            </Button>,
            <Button key='relogin' onClick={handleRelogin}>
              Đăng nhập lại
            </Button>
          ]}
        />
      </Flex>
    );
  }

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
      <Layout className='min-w-0'>
        <HeaderMain />
        <Breadcrumb items={breadcrumbs} className='p-6 py-4' />
        <Content className='min-w-0 m-5 p-5 mt-0 bg-white rounded-lg shadow-md'>
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
