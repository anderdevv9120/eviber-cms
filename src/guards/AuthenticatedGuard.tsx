import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PATH_AUTH } from "../constants/paths";
import { getCookies } from "../utils/cookies";
import { ACCESS_TOKEN_KEY } from "../constants";

interface Props {
  children: ReactNode;
}

const AuthenticatedGuard = ({ children }: Props) => {
  const location = useLocation();

  return getCookies(ACCESS_TOKEN_KEY) ? (
    <>{children}</>
  ) : (
    <Navigate to={PATH_AUTH.LOGIN} replace state={{ from: location }} />
  );
};

export default AuthenticatedGuard;
