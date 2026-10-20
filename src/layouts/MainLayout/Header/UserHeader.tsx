import type { MenuProps } from "antd";
import { Avatar, Dropdown, Flex, theme } from "antd";
import { UserOutlined, LogoutOutlined, LockOutlined } from "@ant-design/icons";
import { useRef } from "react";
import { useNavigate } from "react-router";
import { useAppStore } from "@/store/useAppStore";
import { getCookies } from "@/utils/cookies";
import { REFRESH_TOKEN_KEY } from "@/constants";
import { clearSession } from "@/utils/session";
import { logoutAPI } from "@/services/auth";
import { successNotification } from "@/utils/notification";
import { PATH_AUTH } from "@/constants/paths";

const UserHeader = () => {
  const { profile } = useAppStore();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const isLoggingOutRef = useRef(false);
  const safeProfile = profile || {
    firstName: "",
    lastName: "",
    email: "",
    _id: "",
    phone: "",
    status: "",
    roles: []
  };

  const handleLogout = async () => {
    // ref thay vì state: 2 click trong cùng 1 tick chưa kịp thấy state mới
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    const refreshToken = getCookies(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      // Thu hồi phiên phía server trước; lỗi mạng hay token hết hạn vẫn dọn phiên local
      await logoutAPI({ refreshToken }).catch(() => undefined);
    }
    clearSession();
    successNotification("Đăng xuất thành công!");
    navigate(PATH_AUTH.LOGIN, { replace: true });
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "profile",
      label: "Thông tin cá nhân",
      icon: <UserOutlined />,
      onClick: () => {
        console.log("Navigate to profile");
      }
    },
    {
      key: "changePassword",
      label: "Đổi mật khẩu",
      icon: <LockOutlined />,
      onClick: () => {
        console.log("Navigate to change password");
      }
    },
    {
      type: "divider"
    },
    {
      key: "logout",
      label: "Đăng xuất",
      icon: <LogoutOutlined />,
      onClick: handleLogout,
      danger: true
    }
  ];

  const displayName =
    safeProfile.firstName && safeProfile.lastName
      ? `${safeProfile.firstName} ${safeProfile.lastName}`
      : safeProfile.email || "Admin";

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["hover"]} placement='bottomRight'>
      <Flex
        align='center'
        gap={10}
        className='ml-1 h-10 cursor-pointer rounded-lg py-1 pr-2 pl-1 hover:bg-(--ant-color-fill-quaternary)'
      >
        <Avatar
          size={32}
          className='shrink-0 font-semibold'
          style={{ background: token.colorPrimaryBg, color: token.colorPrimaryText, fontSize: 14 }}
        >
          {displayName.charAt(0).toUpperCase()}
        </Avatar>
        <div className='min-w-0 leading-tight'>
          <div className='max-w-40 truncate text-sm font-medium'>{displayName}</div>
          {safeProfile.email && displayName !== safeProfile.email && (
            <div className='max-w-40 truncate text-xs text-(--ant-color-text-tertiary)'>
              {safeProfile.email}
            </div>
          )}
        </div>
      </Flex>
    </Dropdown>
  );
};

export default UserHeader;
