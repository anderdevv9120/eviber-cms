import { PATH } from "@/constants/paths";
import type { CmsAccessPolicy } from "@/constants/permissions";
import type { Profile } from "@/store/useAppStore";

export const canAccess = (profile: Profile, policy: CmsAccessPolicy): boolean => {
  if (!profile.access.role) return false;
  if (profile.access.isOwner) return true;
  if ("ownerOnly" in policy) return false;
  if ("authenticated" in policy) return true;
  return policy.anyOf.some(permission => profile.access.permissions.includes(permission));
};

export const NAVIGATION_POLICIES: Record<string, CmsAccessPolicy> = {
  [PATH.DASHBOARD]: { anyOf: ["DASHBOARD_READ"] },
  [PATH.REPORTS]: { anyOf: ["REPORT_READ"] },
  [PATH.ORDER]: { anyOf: ["ORDER_READ"] },
  [PATH.CUSTOMERS]: { anyOf: ["CUSTOMER_READ"] },
  [PATH.REVIEWS]: { anyOf: ["REVIEW_READ"] },
  [PATH.VOUCHERS]: { anyOf: ["COUPON_READ"] },
  [PATH.PRODUCTS]: { anyOf: ["PRODUCT_READ"] },
  [PATH.COMBOS]: { anyOf: ["COMBO_READ"] },
  [PATH.INVENTORY]: { anyOf: ["INVENTORY_READ"] },
  [PATH.CATEGORIES]: { anyOf: ["CATEGORY_READ"] },
  [PATH.ATTRIBUTES]: { anyOf: ["ATTRIBUTE_READ"] },
  [PATH.CONTENT_HOME]: { anyOf: ["CONTENT_HOME_READ"] },
  [PATH.CONTENT_INFO]: { anyOf: ["STORE_INFO_READ"] },
  [PATH.POLICIES]: { anyOf: ["POLICY_READ", "REFUND_POLICY_READ"] },
  [PATH.SETTINGS_CHECKOUT]: { anyOf: ["CHECKOUT_SETTINGS_READ"] },
  [PATH.SETTINGS_PAYMENT]: { ownerOnly: true },
  [PATH.SETTINGS_ROLES]: { ownerOnly: true },
  [PATH.SETTINGS_ACCESS]: { anyOf: ["USER_CREATE"] },
  [PATH.SETTINGS_ACCESS_NEW]: { anyOf: ["USER_CREATE"] }
};

export const ROUTE_POLICIES: Record<string, CmsAccessPolicy> = {
  ...NAVIGATION_POLICIES,
  [PATH.NOTIFICATIONS]: { authenticated: true },
  [PATH.COMBO_NEW]: { anyOf: ["COMBO_CREATE"] },
  [PATH.COMBO_DETAIL]: { anyOf: ["COMBO_READ"] },
  [PATH.PRODUCT_NEW]: { anyOf: ["PRODUCT_CREATE"] },
  [PATH.PRODUCT_DETAIL]: { anyOf: ["PRODUCT_READ"] },
  [PATH.CUSTOMER_DETAIL]: { anyOf: ["CUSTOMER_READ"] },
  [PATH.GUEST_BUYER_DETAIL]: { anyOf: ["CUSTOMER_READ"] },
  [PATH.ORDER_DETAIL]: { anyOf: ["ORDER_READ"] },
  [PATH.ATTRIBUTE_DETAIL]: { anyOf: ["ATTRIBUTE_READ"] }
};

export const firstAllowedPath = (profile: Profile): string | null =>
  Object.keys(NAVIGATION_POLICIES).find(path => canAccess(profile, NAVIGATION_POLICIES[path])) ??
  null;
