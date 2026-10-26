import type { ReactNode } from "react";
import { Button, Result } from "antd";
import { Navigate, useNavigate } from "react-router";
import type { CmsAccessPolicy } from "@/constants/permissions";
import { REFRESH_TOKEN_KEY } from "@/constants";
import { logoutAPI } from "@/services/auth";
import { useAppStore } from "@/store/useAppStore";
import { canAccess, firstAllowedPath } from "@/utils/access";
import { getCookies } from "@/utils/cookies";
import { clearSession } from "@/utils/session";

const PermissionGuard = ({
  policy,
  children
}: {
  policy?: CmsAccessPolicy;
  children?: ReactNode;
}) => {
  const profile = useAppStore(state => state.profile);
  const navigate = useNavigate();
  if (!profile) return null;
  const firstPath = firstAllowedPath(profile);
  if (!policy && firstPath) return <Navigate to={firstPath} replace />;
  if (policy && canAccess(profile, policy)) return children;

  const signOut = () => {
    const refreshToken = getCookies(REFRESH_TOKEN_KEY);
    if (refreshToken) void logoutAPI({ refreshToken }).catch(() => undefined);
    clearSession();
  };

  return (
    <Result
      status='403'
      title={
        policy ? "Bạn không có quyền truy cập trang này" : "Bạn chưa được cấp quyền sử dụng CMS"
      }
      subTitle='Liên hệ chủ cửa hàng để được cấp quyền phù hợp.'
      extra={[
        ...(firstPath
          ? [
              <Button key='home' type='primary' onClick={() => navigate(firstPath)}>
                Về trang được phép
              </Button>
            ]
          : []),
        <Button key='logout' onClick={signOut}>
          Đăng xuất
        </Button>
      ]}
    />
  );
};

export default PermissionGuard;
