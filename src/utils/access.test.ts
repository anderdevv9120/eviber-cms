import { describe, expect, it } from "vitest";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { canAccess, firstAllowedPath } from "./access";

describe("CMS access", () => {
  it("uses effective permissions rather than legacy role names", () => {
    const inventoryProfile = staffProfile(["INVENTORY_READ"]);
    expect(firstAllowedPath(inventoryProfile)).toBe("/inventory");
    expect(canAccess(inventoryProfile, { anyOf: ["PRODUCT_READ"] })).toBe(false);
    expect(canAccess(inventoryProfile, { anyOf: ["PRODUCT_READ", "INVENTORY_READ"] })).toBe(true);
    expect(canAccess(inventoryProfile, { ownerOnly: true })).toBe(false);
  });

  it("keeps empty staff authenticated without an accessible feature", () => {
    const emptyProfile = staffProfile([]);
    expect(firstAllowedPath(emptyProfile)).toBeNull();
    expect(canAccess(emptyProfile, { authenticated: true })).toBe(true);
  });

  it("grants owners all explicit policies but denies absent membership", () => {
    expect(firstAllowedPath(ownerProfile)).toBe("/dashboard");
    expect(canAccess(ownerProfile, { ownerOnly: true })).toBe(true);
    expect(canAccess(ownerProfile, { anyOf: ["INVENTORY_READ"] })).toBe(true);
    expect(
      canAccess(
        { ...ownerProfile, access: { ...ownerProfile.access, role: null } },
        { authenticated: true }
      )
    ).toBe(false);
  });
});
