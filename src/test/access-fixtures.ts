import type { Profile } from "@/store/useAppStore";
import type { PermissionCode } from "@/constants/permissions";

export const ownerProfile: Profile = {
  _id: "owner",
  email: "owner@example.test",
  phone: "",
  firstName: "Owner",
  lastName: "User",
  status: "ACTIVE",
  roles: ["SUPER_ADMIN"],
  access: {
    role: { id: "owner-role", code: "SUPER_ADMIN", name: "Chủ cửa hàng", revision: 0 },
    isOwner: true,
    permissions: []
  }
};

export const staffProfile = (permissions: PermissionCode[]): Profile => ({
  ...ownerProfile,
  _id: "staff",
  email: "staff@example.test",
  roles: ["WAREHOUSE"],
  access: {
    role: { id: "warehouse-role", code: "WAREHOUSE", name: "Kho", revision: 1 },
    isOwner: false,
    permissions
  }
});
