/* eslint-disable react-refresh/only-export-components -- Data router exports route objects containing lazy page elements. */
import { lazy, Suspense } from "react";
import { Navigate, type RouteObject } from "react-router";
import { PATH, PATH_AUTH } from "./constants/paths";
import PublicGuard from "./guards/PublicGuard";
import AuthenticatedGuard from "./guards/AuthenticatedGuard";
import NotFound from "./layouts/NotFound";
import MainLayout from "./layouts/MainLayout";

const ForgetPassword = lazy(() => import("./pages/auth/ForgetPassword"));
const Login = lazy(() => import("./pages/auth/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const ProductEditor = lazy(() => import("./pages/Products/ProductEditor"));
const Attributes = lazy(() => import("./pages/Attributes"));
const AttributeDetail = lazy(() => import("./pages/Attributes/AttributeDetail"));
const OrderDetail = lazy(() => import("./pages/Orders/OrderDetail"));
const Orders = lazy(() => import("./pages/Orders"));
const Payments = lazy(() => import("./pages/Payments"));
const Customers = lazy(() => import("./pages/Customers"));
const RegisteredCustomerDetail = lazy(() => import("./pages/Customers/RegisteredCustomerDetail"));
const GuestBuyerDetail = lazy(() => import("./pages/Customers/GuestBuyerDetail"));
const Categories = lazy(() => import("./pages/Categories"));
const Banners = lazy(() => import("./pages/Banners"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Reports = lazy(() => import("./pages/Reports"));
const Vouchers = lazy(() => import("./pages/Vouchers"));
const StoreContent = lazy(() => import("./pages/StoreContent"));
const Policies = lazy(() => import("./pages/Policies"));

export const routes: RouteObject[] = [
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
      { path: PATH.HOME, element: <Navigate to={PATH.DASHBOARD} /> },
      { path: PATH.DASHBOARD, element: <Dashboard /> },
      { path: PATH.PRODUCTS, element: <Products /> },
      { path: PATH.PRODUCT_NEW, element: <ProductEditor /> },
      { path: PATH.PRODUCT_DETAIL, element: <ProductEditor /> },
      { path: PATH.ORDER, element: <Orders /> },
      { path: PATH.PAYMENTS, element: <Payments /> },
      { path: PATH.CUSTOMERS, element: <Customers /> },
      { path: PATH.CUSTOMER_DETAIL, element: <RegisteredCustomerDetail /> },
      { path: PATH.GUEST_BUYER_DETAIL, element: <GuestBuyerDetail /> },
      { path: PATH.ORDER_DETAIL, element: <OrderDetail /> },
      { path: PATH.CATEGORIES, element: <Categories /> },
      { path: PATH.ATTRIBUTES, element: <Attributes /> },
      { path: PATH.ATTRIBUTE_DETAIL, element: <AttributeDetail /> },
      { path: PATH.BANNERS, element: <Banners /> },
      { path: PATH.REVIEWS, element: <Reviews /> },
      { path: PATH.VOUCHERS, element: <Vouchers /> },
      { path: PATH.STORE_CONTENT, element: <StoreContent /> },
      { path: PATH.POLICIES, element: <Policies /> },
      { path: PATH.REPORTS, element: <Reports /> }
    ]
  },
  { path: "*", element: <NotFound /> }
];
