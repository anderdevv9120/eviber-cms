/* eslint-disable react-refresh/only-export-components -- Data router exports route objects containing lazy page elements. */
import { lazy, Suspense } from "react";
import { Navigate, type RouteObject } from "react-router";
import { PATH, PATH_AUTH } from "./constants/paths";
import PublicGuard from "./guards/PublicGuard";
import AuthenticatedGuard from "./guards/AuthenticatedGuard";
import PermissionGuard from "./guards/PermissionGuard";
import { ROUTE_POLICIES } from "./utils/access";
import NotFound from "./layouts/NotFound";
import MainLayout from "./layouts/MainLayout";

const ForgetPassword = lazy(() => import("./pages/auth/ForgetPassword"));
const Login = lazy(() => import("./pages/auth/Login"));
const AcceptStaffInvitation = lazy(() => import("./pages/auth/AcceptStaffInvitation"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Combos = lazy(() => import("./pages/Combos"));
const ComboEditor = lazy(() => import("./pages/Combos/ComboEditor"));
const Inventory = lazy(() => import("./pages/Inventory"));
const ProductEditor = lazy(() => import("./pages/Products/ProductEditor"));
const Attributes = lazy(() => import("./pages/Attributes"));
const AttributeDetail = lazy(() => import("./pages/Attributes/AttributeDetail"));
const OrderDetail = lazy(() => import("./pages/Orders/OrderDetail"));
const Orders = lazy(() => import("./pages/Orders"));
const Customers = lazy(() => import("./pages/Customers"));
const RegisteredCustomerDetail = lazy(() => import("./pages/Customers/RegisteredCustomerDetail"));
const GuestBuyerDetail = lazy(() => import("./pages/Customers/GuestBuyerDetail"));
const Categories = lazy(() => import("./pages/Categories"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Reports = lazy(() => import("./pages/Reports"));
const Vouchers = lazy(() => import("./pages/Vouchers"));
const ContentHome = lazy(() => import("./pages/ContentHome"));
const StoreInfo = lazy(() => import("./pages/StoreInfo"));
const CheckoutSettings = lazy(() => import("./pages/Settings/CheckoutSettings"));
const RoleSettings = lazy(() => import("./pages/Staff/RoleSettings"));
const StaffManagement = lazy(() => import("./pages/Staff"));
const StaffRegistration = lazy(() => import("./pages/Staff/StaffRegistration"));
const PaymentSettings = lazy(() => import("./pages/PaymentSettings"));
const Policies = lazy(() => import("./pages/Policies"));

export const routes: RouteObject[] = [
  {
    path: PATH_AUTH.STAFF_INVITATION,
    element: (
      <Suspense fallback={<div>Đang tải lời mời...</div>}>
        <AcceptStaffInvitation />
      </Suspense>
    )
  },
  {
    path: PATH_AUTH.AUTH,
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <PublicGuard />
      </Suspense>
    ),
    children: [
      { path: PATH_AUTH.AUTH, element: <Navigate to={PATH_AUTH.LOGIN} /> },
      { path: PATH_AUTH.LOGIN, element: <Login /> },
      { path: PATH_AUTH.FORGET_PASSWORD, element: <ForgetPassword /> }
    ]
  },
  {
    path: PATH.HOME,
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <AuthenticatedGuard>
          <MainLayout />
        </AuthenticatedGuard>
      </Suspense>
    ),
    children: [
      { path: PATH.HOME, element: <PermissionGuard /> },
      {
        path: PATH.NOTIFICATIONS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.NOTIFICATIONS]}>
            <Notifications />
          </PermissionGuard>
        )
      },
      {
        path: PATH.SETTINGS_ROLES,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.SETTINGS_ROLES]}>
            <RoleSettings />
          </PermissionGuard>
        )
      },
      {
        path: PATH.SETTINGS_ACCESS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.SETTINGS_ACCESS]}>
            <StaffManagement />
          </PermissionGuard>
        )
      },
      {
        path: PATH.SETTINGS_ACCESS_NEW,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.SETTINGS_ACCESS_NEW]}>
            <StaffRegistration />
          </PermissionGuard>
        )
      },
      {
        path: PATH.DASHBOARD,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.DASHBOARD]}>
            <Dashboard />
          </PermissionGuard>
        )
      },
      {
        path: PATH.PRODUCTS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.PRODUCTS]}>
            <Products />
          </PermissionGuard>
        )
      },
      {
        path: PATH.COMBOS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.COMBOS]}>
            <Combos />
          </PermissionGuard>
        )
      },
      {
        path: PATH.COMBO_NEW,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.COMBO_NEW]}>
            <ComboEditor />
          </PermissionGuard>
        )
      },
      {
        path: PATH.COMBO_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.COMBO_DETAIL]}>
            <ComboEditor />
          </PermissionGuard>
        )
      },
      {
        path: PATH.INVENTORY,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.INVENTORY]}>
            <Inventory />
          </PermissionGuard>
        )
      },
      {
        path: PATH.PRODUCT_NEW,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.PRODUCT_NEW]}>
            <ProductEditor />
          </PermissionGuard>
        )
      },
      {
        path: PATH.PRODUCT_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.PRODUCT_DETAIL]}>
            <ProductEditor />
          </PermissionGuard>
        )
      },
      {
        path: PATH.ORDER,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.ORDER]}>
            <Orders />
          </PermissionGuard>
        )
      },
      {
        path: PATH.CUSTOMERS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.CUSTOMERS]}>
            <Customers />
          </PermissionGuard>
        )
      },
      {
        path: PATH.CUSTOMER_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.CUSTOMER_DETAIL]}>
            <RegisteredCustomerDetail />
          </PermissionGuard>
        )
      },
      {
        path: PATH.GUEST_BUYER_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.GUEST_BUYER_DETAIL]}>
            <GuestBuyerDetail />
          </PermissionGuard>
        )
      },
      {
        path: PATH.ORDER_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.ORDER_DETAIL]}>
            <OrderDetail />
          </PermissionGuard>
        )
      },
      {
        path: PATH.CATEGORIES,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.CATEGORIES]}>
            <Categories />
          </PermissionGuard>
        )
      },
      {
        path: PATH.ATTRIBUTES,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.ATTRIBUTES]}>
            <Attributes />
          </PermissionGuard>
        )
      },
      {
        path: PATH.ATTRIBUTE_DETAIL,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.ATTRIBUTE_DETAIL]}>
            <AttributeDetail />
          </PermissionGuard>
        )
      },
      {
        path: PATH.REVIEWS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.REVIEWS]}>
            <Reviews />
          </PermissionGuard>
        )
      },
      {
        path: PATH.VOUCHERS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.VOUCHERS]}>
            <Vouchers />
          </PermissionGuard>
        )
      },
      {
        path: PATH.CONTENT_HOME,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.CONTENT_HOME]}>
            <ContentHome />
          </PermissionGuard>
        )
      },
      {
        path: PATH.CONTENT_INFO,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.CONTENT_INFO]}>
            <StoreInfo />
          </PermissionGuard>
        )
      },
      {
        path: PATH.POLICIES,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.POLICIES]}>
            <Policies />
          </PermissionGuard>
        )
      },
      {
        path: PATH.REPORTS,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.REPORTS]}>
            <Reports />
          </PermissionGuard>
        )
      },
      {
        path: PATH.SETTINGS_CHECKOUT,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.SETTINGS_CHECKOUT]}>
            <CheckoutSettings />
          </PermissionGuard>
        )
      },
      {
        path: PATH.SETTINGS_PAYMENT,
        element: (
          <PermissionGuard policy={ROUTE_POLICIES[PATH.SETTINGS_PAYMENT]}>
            <PaymentSettings />
          </PermissionGuard>
        )
      }
    ]
  },
  { path: "*", element: <NotFound /> }
];
