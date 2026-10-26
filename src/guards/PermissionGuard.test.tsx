import "@/test/attribute-fixtures";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { staffProfile, ownerProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import PermissionGuard from "./PermissionGuard";

describe("PermissionGuard", () => {
  it("never mounts a forbidden fetching page", async () => {
    const forbiddenPageLoad = vi.fn();
    const ForbiddenPage = () => {
      forbiddenPageLoad();
      return <div>Private product data</div>;
    };
    useAppStore.getState().setProfile(staffProfile(["INVENTORY_READ"]));
    render(
      <MemoryRouter>
        <PermissionGuard policy={{ anyOf: ["PRODUCT_READ"] }}>
          <ForbiddenPage />
        </PermissionGuard>
      </MemoryRouter>
    );
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(forbiddenPageLoad).not.toHaveBeenCalled();
  });

  it("updates an already mounted route when permissions are removed", async () => {
    useAppStore.getState().setProfile(ownerProfile);
    render(
      <MemoryRouter>
        <PermissionGuard policy={{ anyOf: ["PRODUCT_READ"] }}>
          <div>Private product data</div>
        </PermissionGuard>
      </MemoryRouter>
    );
    expect(screen.getByText("Private product data")).toBeTruthy();
    const { act } = await import("@testing-library/react");
    await act(async () => useAppStore.getState().setProfile(staffProfile([])));
    expect(screen.queryByText("Private product data")).toBeNull();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeTruthy();
  });
});
