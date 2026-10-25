import type { PermissionCatalogEntry, RoleView } from "@/services/roles";

export const productReadId = "000000000000000000000002";
export const productUpdateId = "000000000000000000000004";
export const catalog: PermissionCatalogEntry[] = [
  {
    id: productReadId,
    code: "PRODUCT_READ",
    label: "Xem sản phẩm",
    group: "Sản phẩm",
    description: "Xem danh sách và chi tiết",
    requires: []
  },
  {
    id: productUpdateId,
    code: "PRODUCT_UPDATE",
    label: "Sửa sản phẩm",
    group: "Sản phẩm",
    description: "Sửa sản phẩm và trạng thái",
    requires: ["PRODUCT_READ"]
  },
  {
    id: "refund-read",
    code: "ORDER_READ",
    label: "Xem đơn hàng",
    group: "Đơn hàng",
    description: "Xem đơn hàng",
    requires: []
  },
  {
    id: "refund-pay",
    code: "ORDER_REFUND_PAY",
    label: "Chi trả hoàn tiền",
    group: "Đơn hàng",
    description: "Ghi nhận chi trả",
    requires: ["ORDER_READ"]
  },
  {
    id: "invite",
    code: "USER_CREATE",
    label: "Mời nhân viên",
    group: "Nhân viên",
    description: "Mời vào vai trò được phép giao",
    requires: []
  }
];
export const adminRole: RoleView = {
  id: "admin-role",
  code: "ADMIN",
  name: "Nhân viên",
  description: null,
  scope: "CMS",
  permissionIds: [],
  revision: 3,
  assignedStaffCount: 7
};
export const customRole: RoleView = {
  ...adminRole,
  id: "custom-role",
  code: "EDITOR",
  name: "Biên tập viên",
  assignedStaffCount: 0
};
export const ownerRole: RoleView = {
  ...adminRole,
  id: "owner-role",
  code: "SUPER_ADMIN",
  name: "Chủ cửa hàng",
  assignedStaffCount: 1
};
export const roleList = (
  data: RoleView[] = [ownerRole, adminRole, customRole],
  page = 1,
  total = data.length
) => ({
  data,
  page,
  pageSize: 10,
  total,
  totalPage: Math.max(1, Math.ceil(total / 10))
});
export const catalogList = {
  data: catalog,
  page: 1,
  pageSize: 100,
  total: catalog.length,
  totalPage: 1
};
