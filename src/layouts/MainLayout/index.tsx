import { Suspense, useEffect, useState } from "react";
import { Layout, Breadcrumb, Spin, Flex, Result, Button, theme } from "antd";
import { Link, matchPath, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { refreshProfile } from "@/services/auth";
import { clearSession, hasSession } from "@/utils/session";
import { PATH, PATH_AUTH } from "@/constants/paths";
import Sidebar from "./Sidebar";
import HeaderMain from "./Header";
import { menuKeyOf } from "./menu";
import { readOrderReturnTo } from "@/pages/Orders/order-list-query";
import { safeCustomerReturnTo } from "@/pages/Customers/customer-list-query";

const { Content } = Layout;

// Tra theo mục menu đang sáng nên route con dùng crumb của mục cha; màn chưa khai thì không hiện crumb
const STATIC_BREADCRUMBS: Record<string, string[]> = {
  [PATH.PRODUCTS]: ["Catalog", "Sản phẩm"],
  [PATH.COMBOS]: ["Catalog", "Combo"],
  [PATH.CATEGORIES]: ["Catalog", "Danh mục sản phẩm"],
  [PATH.CONTENT_HOME]: ["Nội dung", "Trang chủ"],
  [PATH.CONTENT_INFO]: ["Nội dung", "Thông tin cửa hàng"],
  [PATH.POLICIES]: ["Nội dung", "Trang chính sách"],
  [PATH.SETTINGS_CHECKOUT]: ["Cài đặt", "Đặt hàng"],
  [PATH.SETTINGS_ROLES]: ["Cài đặt", "Tài khoản & phân quyền", "Vai trò"],
  [PATH.SETTINGS_ACCESS]: ["Cài đặt", "Tài khoản & phân quyền", "Nhân viên"],
  [PATH.SETTINGS_PAYMENT]: ["Cài đặt", "Thanh toán"],
  [PATH.REVIEWS]: ["Bán hàng", "Đánh giá"],
  [PATH.REPORTS]: ["Báo cáo bán hàng"],
  [PATH.INVENTORY]: ["Catalog", "Tồn kho"],
  [PATH.VOUCHERS]: ["Bán hàng", "Voucher"],
  [PATH.DASHBOARD]: ["Tổng quan"]
};

const MainLayout = () => {
  const profile = useAppStore(state => state.profile);
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { pathname, search, key: locationKey } = useLocation();
  const attributeDetail = !!matchPath(PATH.ATTRIBUTE_DETAIL, pathname);
  const orderDetail = !!matchPath(PATH.ORDER_DETAIL, pathname);
  const customerDetail = !!matchPath(PATH.CUSTOMER_DETAIL, pathname);
  const guestDetail = pathname === PATH.GUEST_BUYER_DETAIL;
  const params = new URLSearchParams(search);
  const { returnTo, fromCustomer } = readOrderReturnTo(search);
  const customerOrigin = orderDetail && fromCustomer;
  const breadcrumbs =
    pathname === PATH.CUSTOMERS || customerDetail || guestDetail
      ? [
          { title: "Bán hàng" },
          {
            title:
              customerDetail || guestDetail ? (
                <Link
                  to={safeCustomerReturnTo(
                    params.getAll("returnTo").length === 1
                      ? params.get("returnTo")
                      : guestDetail
                        ? `${PATH.CUSTOMERS}?tab=guests`
                        : null
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
            { title: "Catalog" },
            {
              title: attributeDetail ? <Link to={PATH.ATTRIBUTES}>Thuộc tính</Link> : "Thuộc tính"
            },
            ...(attributeDetail ? [{ title: "Chi tiết thuộc tính" }] : [])
          ]
        : orderDetail || pathname === PATH.ORDER
          ? [
              { title: "Bán hàng" },
              {
                title: orderDetail ? (
                  <Link to={returnTo}>{customerOrigin ? "Khách hàng" : "Quản lý Đơn hàng"}</Link>
                ) : (
                  "Quản lý Đơn hàng"
                )
              },
              ...(orderDetail ? [{ title: "Chi tiết đơn hàng" }] : [])
            ]
          : (STATIC_BREADCRUMBS[menuKeyOf(pathname) ?? ""] ?? []).map(title => ({ title }));
  const productEditor = !!matchPath(PATH.PRODUCT_DETAIL, pathname);
  const comboEditor = !!matchPath(PATH.COMBO_DETAIL, pathname);
  if (productEditor || comboEditor) {
    breadcrumbs[1] = {
      title: (
        <Link to={productEditor ? PATH.PRODUCTS : PATH.COMBOS}>
          {productEditor ? "Sản phẩm" : "Combo"}
        </Link>
      )
    };
    breadcrumbs.push({
      title: productEditor
        ? pathname === PATH.PRODUCT_NEW
          ? "Thêm sản phẩm"
          : "Chi tiết sản phẩm"
        : pathname === PATH.COMBO_NEW
          ? "Thêm combo"
          : "Chi tiết combo"
    });
  }
  // Trang đăng ký nằm dưới mục Nhân viên: giữ crumb cha dạng link về trang danh sách
  if (pathname === PATH.SETTINGS_ACCESS_NEW) {
    breadcrumbs[2] = { title: <Link to={PATH.SETTINGS_ACCESS}>Nhân viên</Link> };
    breadcrumbs.push({ title: "Mời nhân viên" });
  }
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [checkedPath, setCheckedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      refreshProfile().catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    void refresh().finally(() => {
      if (!cancelled) setCheckedPath(pathname);
    });
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [attempt, locationKey, pathname]);

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
      <Flex
        justify='center'
        align='center'
        className='min-h-screen'
        style={{ background: token.colorBgLayout }}
      >
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

  if (!profile || checkedPath !== pathname) {
    return (
      <Flex
        justify='center'
        align='center'
        className='min-h-screen'
        style={{ background: token.colorBgLayout }}
      >
        <Spin size='large' />
      </Flex>
    );
  }

  return (
    <div className='min-h-screen flex' style={{ background: token.colorBgLayout }}>
      <Sidebar />
      <Layout className='sticky top-2 my-2 mr-2 h-[calc(100vh-16px)] min-w-0 overflow-hidden rounded-[14px] shadow-[0_1px_3px_rgba(17,24,39,0.06),0_0_0_1px_var(--ant-color-border-secondary)]'>
        <HeaderMain breadcrumb={<Breadcrumb items={breadcrumbs} />} />
        <Content className='min-w-0 overflow-y-auto p-6'>
          <div className='mx-auto max-w-7xl'>
            <Suspense
              fallback={
                <Flex justify='center' align='center' className='min-h-full'>
                  <Spin size='large' />
                </Flex>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </Content>
      </Layout>
    </div>
  );
};

export default MainLayout;
