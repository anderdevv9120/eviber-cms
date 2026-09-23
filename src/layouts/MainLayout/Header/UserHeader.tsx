import type { MenuProps } from "antd";
import { Dropdown, Flex } from "antd";
import { UserOutlined, LogoutOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { removeCookies } from "@/utils/cookies";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/constants";
import { successNotification } from "@/utils/notification";
import { PATH_AUTH } from "@/constants/paths";

const UserHeader = () => {
  const { clearProfile, profile } = useAppStore();
  const navigate = useNavigate();
  const safeProfile = profile || {
    firstName: "",
    lastName: "",
    email: "",
    _id: "",
    phone: "",
    status: ""
  };

  const handleLogout = async () => {
    removeCookies(ACCESS_TOKEN_KEY);
    removeCookies(REFRESH_TOKEN_KEY);
    clearProfile();
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
      <Flex align='center' gap={8} className='h-full cursor-pointer px-2 hover:bg-gray-100 rounded'>
        <div className='rounded-full border-[#001529] border-[2px] p-1'>
          <div className='h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold'>
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className='text-base font-medium max-w-32 truncate'>{displayName}</div>
      </Flex>
    </Dropdown>
  );
};

export default UserHeader;
