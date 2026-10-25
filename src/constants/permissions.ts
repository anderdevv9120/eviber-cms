export const PERMISSIONS = [
  "USER_CREATE",
  "PRODUCT_READ",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "COMBO_READ",
  "COMBO_CREATE",
  "COMBO_UPDATE",
  "CATEGORY_READ",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "CATEGORY_DELETE",
  "ATTRIBUTE_READ",
  "ATTRIBUTE_CREATE",
  "ATTRIBUTE_UPDATE",
  "ATTRIBUTE_DELETE",
  "INVENTORY_READ",
  "INVENTORY_ADJUST",
  "ORDER_READ",
  "ORDER_UPDATE",
  "ORDER_PAYMENT_UPDATE",
  "ORDER_REFUND_REVIEW",
  "ORDER_REFUND_PAY",
  "CUSTOMER_READ",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
  "REVIEW_READ",
  "REVIEW_UPDATE",
  "COUPON_READ",
  "COUPON_CREATE",
  "COUPON_UPDATE",
  "CONTENT_HOME_READ",
  "CONTENT_HOME_UPDATE",
  "STORE_INFO_READ",
  "STORE_INFO_UPDATE",
  "POLICY_READ",
  "POLICY_UPDATE",
  "CHECKOUT_SETTINGS_READ",
  "CHECKOUT_SETTINGS_UPDATE",
  "REFUND_POLICY_READ",
  "REFUND_POLICY_UPDATE",
  "REPORT_READ",
  "DASHBOARD_READ"
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

export interface CmsAccess {
  role: { id: string; code: string; name: string; revision: number } | null;
  isOwner: boolean;
  permissions: PermissionCode[];
}

export type CmsAccessPolicy =
  { ownerOnly: true } | { authenticated: true } | { anyOf: PermissionCode[] };
