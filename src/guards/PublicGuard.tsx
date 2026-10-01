import { Navigate, Outlet, useLocation } from "react-router";
import { PATH } from "../constants/paths";
import { hasSession } from "../utils/session";

const PublicGuard = () => {
  const location = useLocation();

  return !hasSession() ? (
    <Outlet />
  ) : (
    <Navigate to={PATH.HOME} replace state={{ from: location }} />
  );
};

export default PublicGuard;
