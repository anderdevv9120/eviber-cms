import type { MenuProps } from "antd";
import { Dropdown, Flex } from "antd";
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
        // Navigate to profile page
        console.log("Navigate to profile");
      }
    },
    {
      key: "changePassword",
      label: "Đổi mật khẩu",
      icon: <LockOutlined />,
      onClick: () => {
        // Navigate to change password page
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
        gap={8}
        className='h-full cursor-pointer px-2 hover:bg-gray-100 rounded-sm'
      >
        <div className='rounded-full border-[#001529] border-[2px] p-1'>
          <div className='h-8 w-8 rounded-full bg-linear-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold'>
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className='text-base font-medium max-w-32 truncate'>{displayName}</div>
      </Flex>
    </Dropdown>
  );
};

export default UserHeader;
