import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { response } from "@/test/attribute-fixtures";
import { adminRole, catalogList, customRole, roleList } from "@/test/role-fixtures";
import RoleSettings from "./RoleSettings";

const setup = () => {
  const router = createMemoryRouter([{ path: "/", element: <RoleSettings /> }]);
  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
};
beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("owner role settings", () => {
  it("opens a reusable inline editor and refreshes the list after creation", async () => {
    let created = false;
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "post") {
        created = true;
        return response(config, customRole);
      }
      return response(
        config,
        config.url === "/permissions"
          ? catalogList
          : roleList(created ? [adminRole, customRole] : [adminRole])
      );
    };
    setup();
    await screen.findByRole("button", { name: "Nhân viên" });
    fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: customRole.name }
    });
    fireEvent.change(screen.getByLabelText("Mã vai trò"), { target: { value: customRole.code } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
    await screen.findByRole("button", { name: "Biên tập viên" });
    expect(screen.queryByLabelText("Tên vai trò")).toBeNull();
  });

  it("protects reserved roles and shows assignment and pending-invitation deletion conflicts inline", async () => {
    const deleted = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "delete") {
        deleted(config.params);
        throw new AxiosError("in use", "409", config, undefined, {
          ...response(config, null),
          status: 409,
          data: {
            message: "Vai trò đang được sử dụng bởi nhân viên hoặc thư mời",
            errors: "ROLE_IN_USE"
          }
        });
      }
      return response(config, roleList());
    };
    setup();
    await screen.findByRole("button", { name: "Biên tập viên" });
    for (const name of ["Chủ cửa hàng", "Nhân viên"]) {
      const row = screen.getByRole("button", { name }).closest("tr")!;
      expect(within(row).queryByRole("button", { name: /Xóa/ })).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Xóa Biên tập viên" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa vai trò" }));
    await screen.findByText("Vai trò đang được sử dụng bởi nhân viên hoặc thư mời");
    expect(deleted).toHaveBeenCalledWith({ expectedRevision: 3 });
    expect(screen.getByRole("button", { name: "Biên tập viên" })).toBeTruthy();
  });

  it("paginates on the server and keeps failed list loads retryable", async () => {
    const pages: number[] = [];
    axiosRequest.defaults.adapter = async config => {
      pages.push(config.params.page);
      return response(
        config,
        roleList(config.params.page === 1 ? [adminRole] : [customRole], config.params.page, 11)
      );
    };
    setup();
    await screen.findByRole("button", { name: "Nhân viên" });
    fireEvent.click(screen.getByTitle("2"));
    await screen.findByRole("button", { name: "Biên tập viên" });
    expect(pages).toEqual([1, 2]);
  });

  it("does not mount configuration or fetch owner-only data for staff", async () => {
    useAppStore.getState().setProfile(staffProfile(["USER_CREATE", "PRODUCT_READ"]));
    const roleEditorLoad = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      roleEditorLoad();
      return response(config, roleList());
    };
    setup();
    await screen.findByText("Bạn không có quyền truy cập trang này");
    await waitFor(() => expect(roleEditorLoad).not.toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Vai trò" })).toBeNull();
  });
});
