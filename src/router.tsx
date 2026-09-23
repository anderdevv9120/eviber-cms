import { lazy, Suspense } from "react";
import { Navigate, useRoutes } from "react-router-dom";
import { PATH, PATH_AUTH } from "./constants/paths";
import PublicGuard from "./guards/PublicGuard";
import AuthenticatedGuard from "./guards/AuthenticatedGuard";
import NotFound from "./layouts/NotFound";
import MainLayout from "./layouts/MainLayout";

const ForgetPassword = lazy(() => import("./pages/auth/ForgetPassword"));
const Login = lazy(() => import("./pages/auth/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

const RouterConfig = () => {
  const createRoutes = useRoutes([
    {
      path: PATH_AUTH.AUTH,
      element: <PublicGuard />,
      children: [
        {
          path: PATH_AUTH.AUTH,
          element: <Navigate to={PATH_AUTH.LOGIN} />
        },
        {
          path: PATH_AUTH.LOGIN,
          element: <Login />
        },
        {
          path: PATH_AUTH.FORGET_PASSWORD,
          element: <ForgetPassword />
        }
      ]
    },
    {
      path: PATH.HOME,
      element: (
        <AuthenticatedGuard>
          <MainLayout />
        </AuthenticatedGuard>
      ),
      children: [
        {
          path: PATH.HOME,
          element: <Navigate to={PATH.DASHBOARD} />
        },
        {
          path: PATH.DASHBOARD,
          element: <Dashboard />
        },
        {
          path: PATH.PRODUCT,
          element: <Dashboard />
        },
        {
          path: PATH.ORDER,
          element: <Dashboard />
        }
      ]
    },
    {
      path: "*",
      element: <NotFound />
    }
  ]);
  return <Suspense fallback={<div>Loading...</div>}>{createRoutes}</Suspense>;
};

export default RouterConfig;
