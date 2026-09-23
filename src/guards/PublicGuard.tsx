import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PATH } from "../constants/paths";
import { getCookies } from "../utils/cookies";
import { ACCESS_TOKEN_KEY } from "../constants";

const PublicGuard = () => {
  const location = useLocation();

  return !getCookies(ACCESS_TOKEN_KEY) ? (
    <Outlet />
  ) : (
    <Navigate to={PATH.HOME} replace state={{ from: location }} />
  );
};

export default PublicGuard;
