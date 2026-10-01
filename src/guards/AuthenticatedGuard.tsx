import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PATH_AUTH } from "../constants/paths";
import { hasSession } from "../utils/session";

interface Props {
  children: ReactNode;
}

const AuthenticatedGuard = ({ children }: Props) => {
  const location = useLocation();

  return hasSession() ? (
    <>{children}</>
  ) : (
    <Navigate to={PATH_AUTH.LOGIN} replace state={{ from: location }} />
  );
};

export default AuthenticatedGuard;
