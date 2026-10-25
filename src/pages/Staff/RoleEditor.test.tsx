import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { response } from "@/test/attribute-fixtures";
import {
  adminRole,
  catalog,
  catalogList,
  customRole,
  ownerRole,
  productReadId,
  productUpdateId
} from "@/test/role-fixtures";
import RoleEditor from "./RoleEditor";

const setup = (roleId?: string) => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/edit",
        element: <RoleEditor roleId={roleId} onSaved={onSaved} onCancel={onCancel} />
      },
      { path: "/other", element: <p>Trang khác</p> }
    ],
    { initialEntries: ["/other", "/edit"], initialIndex: 1 }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return { onSaved, onCancel, router };
};
const checkbox = (label: string) =>
  screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("shared role editor", () => {
  it("creates a custom role with grouped supported actions and the required read IDs", async () => {
    let submitted: Record<string, unknown> | undefined;
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "post") {
        submitted = JSON.parse(config.data);
        return response(config, customRole);
      }
      return response(config, catalogList);
    };
    const { onSaved } = setup();
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: "Biên tập viên" }
    });
    fireEvent.change(screen.getByLabelText("Mã vai trò"), { target: { value: "EDITOR" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(catalog.length);
    expect(screen.getByRole("group", { name: "Sản phẩm" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Đơn hàng" })).toBeTruthy();
    fireEvent.click(checkbox("Sửa sản phẩm"));
    expect(checkbox("Xem sản phẩm").checked).toBe(true);
    expect(checkbox("Xem sản phẩm").disabled).toBe(true);
    expect(checkbox("Chi trả hoàn tiền").checked).toBe(false);
    expect(screen.queryByRole("textbox", { name: /Mã quyền/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(customRole));
    expect(submitted?.permissionIds).toEqual([productReadId, productUpdateId]);
    expect(submitted).not.toHaveProperty("scope");
    expect(submitted).not.toHaveProperty("expectedRevision");
  });

  it.each([adminRole, customRole])(
    "edits shared $code permissions with the loaded revision and affected staff count",
    async role => {
      let submitted: Record<string, unknown> | undefined;
      axiosRequest.defaults.adapter = async config => {
        if (config.method === "put") {
          submitted = JSON.parse(config.data);
          return response(config, { ...role, revision: 4 });
        }
        return response(config, config.url === "/permissions" ? catalogList : role);
      };
      const { onSaved } = setup(role.id);
      await screen.findByLabelText("Tên vai trò");
      expect(
        screen.getByText(
          `Thay đổi áp dụng cho ${role.assignedStaffCount} nhân viên đang sử dụng vai trò này.`
        )
      ).toBeTruthy();
      expect((screen.getByLabelText("Mã vai trò") as HTMLInputElement).readOnly).toBe(true);
      fireEvent.click(checkbox("Sửa sản phẩm"));
      fireEvent.click(screen.getByRole("button", { name: "Lưu vai trò" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...role, revision: 4 }));
      expect(submitted?.permissionIds).toEqual([productReadId, productUpdateId]);
      expect(submitted?.expectedRevision).toBe(3);
      expect(submitted).not.toHaveProperty("code");
    }
  );

  it("keeps required reads until their dependent writes are removed", async () => {
    axiosRequest.defaults.adapter = async config => response(config, catalogList);
    setup();
    await screen.findByLabelText("Tên vai trò");
    fireEvent.click(checkbox("Chi trả hoàn tiền"));
    expect(checkbox("Xem đơn hàng").checked).toBe(true);
    expect(screen.getByText(/Yêu cầu: Xem đơn hàng/)).toBeTruthy();
    fireEvent.click(checkbox("Chi trả hoàn tiền"));
    expect(checkbox("Xem đơn hàng").disabled).toBe(false);
    fireEvent.click(checkbox("Xem đơn hàng"));
    expect(checkbox("Xem đơn hàng").checked).toBe(false);
  });

  it("keeps SUPER_ADMIN read-only and never sends a write", async () => {
    const writes = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.method !== "get") writes();
      return response(config, config.url === "/permissions" ? catalogList : ownerRole);
    };
    setup(ownerRole.id);
    await screen.findByText(/Chủ cửa hàng có toàn quyền/);
    expect((screen.getByLabelText("Tên vai trò") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Lưu vai trò" })).toBeNull();
    expect(writes).not.toHaveBeenCalled();
  });

  it("preserves a stale draft, blocks repeat save, and reloads only on explicit request", async () => {
    let reads = 0;
    const writes = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "put") {
        writes(JSON.parse(config.data));
        throw new AxiosError("conflict", "409", config, undefined, {
          ...response(config, null),
          status: 409,
          data: { message: "Vai trò vừa được thay đổi", errors: "ROLE_STALE_REVISION" }
        });
      }
      if (config.url === "/permissions") return response(config, catalogList);
      return response(
        config,
        ++reads === 1 ? adminRole : { ...adminRole, name: "Tên mới từ máy chủ", revision: 4 }
      );
    };
    setup(adminRole.id);
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: "Bản nháp chưa lưu" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vai trò" }));
    await screen.findByRole("button", { name: "Tải lại vai trò" });
    expect((screen.getByLabelText("Tên vai trò") as HTMLInputElement).value).toBe(
      "Bản nháp chưa lưu"
    );
    expect(screen.getByRole("button", { name: "Lưu vai trò" }).hasAttribute("disabled")).toBe(true);
    expect(reads).toBe(1);
    expect(writes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại vai trò" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Tên vai trò") as HTMLInputElement).value).toBe(
        "Tên mới từ máy chủ"
      )
    );
  });

  it("shows a retry for load failure instead of an empty editable permission set", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("offline", "ERR_NETWORK", config);
    };
    setup(adminRole.id);
    await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.queryByRole("button", { name: "Lưu vai trò" })).toBeNull();
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/permissions" ? catalogList : adminRole);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByLabelText("Tên vai trò");
  });

  it("does not load an editor for a restricted account", async () => {
    useAppStore.getState().setProfile(staffProfile(["USER_CREATE"]));
    const roleEditorLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      roleEditorLoad();
      return response(config, catalogList);
    };
    setup();
    await screen.findByText("Bạn không có quyền truy cập trang này");
    expect(roleEditorLoad).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Tên vai trò")).toBeNull();
  });

  it("lets the caller close an editor after its catalog fails to load", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("offline", "ERR_NETWORK", config);
    };
    const { onCancel } = setup();
    await screen.findByRole("button", { name: "Thử lại" });
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("protects changed permission drafts on back, navigation and reload, then clears on save", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/permissions" ? catalogList : adminRole);
    const { router, onSaved } = setup(adminRole.id);
    await screen.findByLabelText("Tên vai trò");
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.click(checkbox("Sửa sản phẩm"));
    expect(unload()).toBe(true);
    act(() => {
      void router.navigate(-1);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/edit");
    expect(checkbox("Sửa sản phẩm").checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Lưu vai trò" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(adminRole));
    expect(unload()).toBe(false);
    await act(() => router.navigate("/other"));
    await screen.findByText("Trang khác");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns for changed role fields and discards only after navigation confirmation", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/permissions" ? catalogList : adminRole);
    const { router } = setup(adminRole.id);
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: "Bản nháp" }
    });
    act(() => {
      void router.navigate("/other");
    });
    fireEvent.click(await screen.findByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    await screen.findByText("Trang khác");
    expect(router.state.location.pathname).toBe("/other");
  });
});
