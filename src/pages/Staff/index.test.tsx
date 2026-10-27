import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { response } from "@/test/attribute-fixtures";
import type { AssignableRoleView, InvitationView, StaffView } from "@/services/staff";
import StaffManagement from ".";

configure({ asyncUtilTimeout: 3000 });

const roles: AssignableRoleView[] = [
  { id: "owner-role", code: "SUPER_ADMIN", name: "Chủ cửa hàng" },
  { id: "admin-role", code: "ADMIN", name: "Nhân viên" },
  { id: "editor-role", code: "EDITOR", name: "Biên tập viên" }
];

const staff = (over: Partial<StaffView> = {}): StaffView => ({
  id: "staff-1",
  email: "kho@example.test",
  firstName: "An",
  lastName: "Nguyễn",
  role: { id: "admin-role", code: "ADMIN", name: "Nhân viên", revision: 3 },
  lastLogin: "2026-10-24T10:00:00.000Z",
  ...over
});

const invitation = (id: string, over: Partial<InvitationView> = {}): InvitationView => ({
  id,
  clientRowId: `client-${id}`,
  email: `${id}@example.test`,
  role: roles[1],
  state: "pending",
  expiresAt: new Date(Date.now() + 172_800_000).toISOString(),
  delivery: "pending",
  revision: 0,
  lastErrorCode: null,
  ...over
});

const setup = () => {
  const router = createMemoryRouter([
    { path: "/", element: <StaffManagement /> },
    { path: "/settings/access/new", element: <div>trang mời</div> },
    { path: "/settings/access/roles", element: <div>trang vai trò</div> }
  ]);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
  axiosRequest.defaults.adapter = async config =>
    response(
      config,
      config.url === "/staff"
        ? [staff()]
        : config.url === "/staff/invitations"
          ? [invitation("inv-1")]
          : roles
    );
});

describe("staff management entry", () => {
  it("hides self-access actions while keeping other staff manageable", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/staff"
          ? [staff({ id: ownerProfile._id, email: ownerProfile.email }), staff()]
          : []
      );
    setup();
    const selfRow = (await screen.findByText(ownerProfile.email)).closest("tr")!;
    expect(within(selfRow).queryByRole("button", { name: "Đổi vai trò" })).toBeNull();
    expect(within(selfRow).queryByRole("button", { name: "Thu hồi quyền CMS" })).toBeNull();
    const otherRow = (await screen.findByText("kho@example.test")).closest("tr")!;
    expect(within(otherRow).getByRole("button", { name: "Đổi vai trò" })).toBeTruthy();
    expect(within(otherRow).getByRole("button", { name: "Thu hồi quyền CMS" })).toBeTruthy();
  });

  it("shows guidance from the header info button with a hover title", async () => {
    setup();
    await screen.findByText("kho@example.test");
    expect(await screen.findByText("inv-1@example.test")).toBeTruthy();
    expect(screen.queryByText(/giữ nguyên tài khoản khách hàng/i)).toBeNull();
    const info = screen.getByRole("button", { name: "Về thư mời và quyền CMS" });
    fireEvent.mouseOver(info);
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      "Về thư mời và quyền CMS"
    );
    fireEvent.mouseOut(info);
    fireEvent.click(info);
    const dialog = await screen.findByRole("dialog", { name: "Về thư mời và quyền CMS" });
    expect(within(dialog).getByText(/giữ nguyên tài khoản khách hàng/i)).toBeTruthy();
    expect(within(dialog).getByText(/chưa phải là nhân viên/i)).toBeTruthy();
    expect(
      within(dialog).getByText(/Thu hồi quyền CMS không xóa tài khoản khách hàng/i)
    ).toBeTruthy();
    expect(within(dialog).getByText(/Gửi mail thành công chỉ nghĩa/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a delegate only their invitations and never requests owner-only data", async () => {
    useAppStore.getState().setProfile(staffProfile(["USER_CREATE"]));
    const requested: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      requested.push(`${config.method} ${config.url}`);
      return response(config, config.url === "/staff/invitations" ? [invitation("inv-1")] : []);
    };
    setup();
    await screen.findByText("inv-1@example.test");
    expect(screen.queryByText("kho@example.test")).toBeNull();
    await waitFor(() => expect(requested).toEqual(["get /staff/invitations"]));
    expect(requested).not.toContain("get /staff");
    expect(requested).not.toContain("get /roles");
    expect(requested).not.toContain("get /permissions");
  });

  it("sends, resends and revokes pending invitations with expected revisions", async () => {
    const calls: { method?: string; url?: string; data?: unknown }[] = [];
    let revision = 0;
    axiosRequest.defaults.adapter = async config => {
      calls.push({ method: config.method, url: config.url, data: config.data });
      if (config.method === "post" || config.method === "delete") {
        revision += 1;
        return response(
          config,
          invitation(
            "inv-1",
            config.url?.endsWith("/revoke")
              ? { state: "revoked", delivery: "pending", revision }
              : { delivery: "sent", revision }
          )
        );
      }
      return response(config, config.url === "/staff" ? [staff()] : [invitation("inv-1")]);
    };
    setup();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("row")
        .find(tr => within(tr).queryByText("inv-1@example.test"));
      expect(found).toBeTruthy();
      return found!;
    });
    fireEvent.click(within(row).getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(within(row).getByText("Đã gửi")).toBeTruthy());
    fireEvent.click(within(row).getByRole("button", { name: "Gửi lại" }));
    await waitFor(() =>
      expect(calls.filter(call => call.url?.endsWith("/resend"))).toHaveLength(1)
    );
    fireEvent.click(within(row).getByRole("button", { name: "Hủy" }));
    await waitFor(() => expect(within(row).getByText("Đã hủy")).toBeTruthy());
    expect(
      calls
        .filter(call => call.method !== "get")
        .map(call => [call.url, JSON.parse(String(call.data))])
    ).toEqual([
      ["/staff/invitations/inv-1/send", { expectedRevision: 0 }],
      ["/staff/invitations/inv-1/resend", { expectedRevision: 1 }],
      ["/staff/invitations/inv-1/revoke", { expectedRevision: 2 }]
    ]);
    expect(calls.map(call => call.url)).toEqual(
      expect.arrayContaining(["/staff", "/staff/invitations"])
    );
  });

  it("marks expired pending invitations and keeps them manageable", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/staff"
          ? [staff()]
          : [
              invitation("inv-old", {
                expiresAt: "2026-10-01T00:00:00.000Z",
                delivery: "sent",
                revision: 4
              })
            ]
      );
    setup();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("row")
        .find(tr => within(tr).queryByText("inv-old@example.test"));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(within(row).getByText("Đã hết hạn")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Gửi lại" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Hủy" })).toBeTruthy();
  });

  it("reports stale invitation revisions with a reload path", async () => {
    const requested: string[] = [];
    let stale = false;
    axiosRequest.defaults.adapter = async config => {
      requested.push(config.url!);
      if (config.method === "post" && stale)
        throw new AxiosError("conflict", "409", config, undefined, {
          ...response(config, null),
          status: 409,
          data: { message: "Thư mời đã thay đổi", errors: { code: "invitation00003" } }
        });
      return response(config, config.url === "/staff" ? [staff()] : [invitation("inv-1")]);
    };
    setup();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("row")
        .find(tr => within(tr).queryByText("inv-1@example.test"));
      expect(found).toBeTruthy();
      return found!;
    });
    stale = true;
    fireEvent.click(within(row).getByRole("button", { name: "Gửi" }));
    await screen.findByText(/Thư mời vừa được thay đổi/i);
    stale = false;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() =>
      expect(requested.filter(url => url === "/staff/invitations").length).toBeGreaterThanOrEqual(2)
    );
  });

  it("changes a staff role with the exact expectedRoleId and reports concurrent changes", async () => {
    const puts: unknown[] = [];
    let stale = false;
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "put") {
        puts.push(JSON.parse(config.data as string));
        if (stale)
          throw new AxiosError("conflict", "409", config, undefined, {
            ...response(config, null),
            status: 409,
            data: { message: "Đã thay đổi", errors: "STAFF_STALE_ROLE" }
          });
        return response(config, staff({ role: { ...roles[2], revision: 3 } as StaffView["role"] }));
      }
      return response(
        config,
        config.url === "/staff" ? [staff()] : config.url === "/staff/invitations" ? [] : roles
      );
    };
    setup();
    await screen.findByText("kho@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Đổi vai trò" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByTitle("Biên tập viên"));
    stale = true;
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu vai trò" }));
    await screen.findByText(/vừa được thay đổi/i);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Tải lại danh sách" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    stale = false;
    fireEvent.click(screen.getByRole("button", { name: "Đổi vai trò" }));
    const retry = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(retry).getByRole("combobox"));
    fireEvent.click(await screen.findByTitle("Biên tập viên"));
    fireEvent.click(within(retry).getByRole("button", { name: "Lưu vai trò" }));
    await waitFor(() =>
      expect(puts).toEqual([
        { roleId: "editor-role", expectedRoleId: "admin-role" },
        { roleId: "editor-role", expectedRoleId: "admin-role" }
      ])
    );
  });

  it("revokes CMS access after confirmation and protects the last owner", async () => {
    const deletes: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      if (config.method === "delete") {
        deletes.push(JSON.parse(config.data as string));
        throw new AxiosError("conflict", "409", config, undefined, {
          ...response(config, null),
          status: 409,
          data: { message: "Chủ cuối cùng", errors: "STAFF_LAST_OWNER" }
        });
      }
      return response(config, config.url === "/staff" ? [staff()] : []);
    };
    setup();
    await screen.findByText("kho@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thu hồi quyền CMS" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/vẫn giữ nguyên tài khoản khách hàng/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Thu hồi" }));
    await screen.findByText(/chủ cửa hàng cuối cùng/i);
    expect(deletes).toEqual([{ expectedRoleId: "admin-role" }]);
  });

  it("links to registration and the owner-only role settings", async () => {
    const router = setup();
    await screen.findByText("kho@example.test");
    fireEvent.click(screen.getByRole("link", { name: "Mời nhân viên" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/access/new"));
    await act(async () => {
      await router.navigate("/");
    });
    await screen.findByText("kho@example.test");
    fireEvent.click(screen.getByRole("link", { name: "Vai trò" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/access/roles"));
  });
});
