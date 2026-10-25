import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { response } from "@/test/attribute-fixtures";
import { catalogList, customRole } from "@/test/role-fixtures";
import type {
  AssignableRoleView,
  InvitationBatchResultRow,
  InvitationView
} from "@/services/staff";
import StaffRegistration from "./StaffRegistration";

configure({ asyncUtilTimeout: 3000 });

const roles: AssignableRoleView[] = [
  { id: "admin-role", code: "ADMIN", name: "Nhân viên" },
  { id: "editor-role", code: "EDITOR", name: "Biên tập viên" }
];

const invitation = (
  id: string,
  email: string,
  over: Partial<InvitationView> = {}
): InvitationView => ({
  id,
  clientRowId: `client-${id}`,
  email,
  role: roles[0],
  state: "pending",
  expiresAt: new Date(Date.now() + 172_800_000).toISOString(),
  delivery: "pending",
  revision: 0,
  lastErrorCode: null,
  ...over
});

const setup = () => {
  const router = createMemoryRouter([
    { path: "/", element: <StaffRegistration /> },
    { path: "/khac", element: <div>trang khác</div> }
  ]);
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};

const navigateAway = async (router: ReturnType<typeof createMemoryRouter>) => {
  await act(async () => {
    await router.navigate("/khac");
  });
};

const draftRows = () =>
  screen.queryAllByRole("row").filter(row => row.className.includes("ant-table-row"));

const fillRow = (row: HTMLElement, email: string) => {
  fireEvent.change(within(row).getByLabelText("Email"), { target: { value: email } });
};

const chooseRole = async (row: HTMLElement, name: string) => {
  fireEvent.mouseDown(within(row).getByRole("combobox"));
  // Dropdown cũ đã đóng vẫn nằm trong DOM (hidden) — chỉ bấm option của dropdown đang mở
  const options = await screen.findAllByText(name, {
    selector: ".ant-select-item-option-content"
  });
  const open = options.filter(
    option =>
      option.closest(".ant-select-dropdown") &&
      !option.closest(".ant-select-dropdown")!.className.includes("ant-select-dropdown-hidden")
  );
  fireEvent.click(open[open.length - 1]);
};

// antd nút loading có accessible name "loading Lưu và gửi thư mời" — dùng regex
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Lưu và gửi thư mời/ }));

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
  axiosRequest.defaults.adapter = async config =>
    response(
      config,
      config.url === "/staff/assignable-roles"
        ? roles
        : config.url === "/permissions"
          ? catalogList
          : []
    );
});

describe("staff registration", () => {
  it("starts with one row for single registration and supports add, edit and remove", async () => {
    setup();
    expect(draftRows()).toHaveLength(1);
    expect(screen.getByText(/giữ nguyên tài khoản khách hàng/i)).toBeTruthy();
    fillRow(draftRows()[0], "an@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    expect(draftRows()).toHaveLength(2);
    fillRow(draftRows()[1], "truong@example.test");
    fireEvent.click(within(draftRows()[1]).getByRole("button", { name: "Xóa" }));
    expect(draftRows()).toHaveLength(1);
    expect(within(draftRows()[0]).getByDisplayValue("an@example.test")).toBeTruthy();
  });

  it("appends pasted CRLF/Unicode rows through the paste dialog and caps the table at 50", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Dán từ bảng tính" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: {
        value: "An\tNguyễn Thị\tan@example.test\r\nBùi\tTrường\ttruong@example.test\n \t\t \r\n"
      }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dán vào bảng" }));
    await waitFor(() => expect(draftRows()).toHaveLength(3));
    expect(within(draftRows()[1]).getByDisplayValue("an@example.test")).toBeTruthy();
    expect(within(draftRows()[2]).getByDisplayValue("truong@example.test")).toBeTruthy();
    expect(within(draftRows()[1]).getByDisplayValue("Nguyễn Thị")).toBeTruthy();

    const fifty = Array.from(
      { length: 50 },
      (_, i) => `Tên ${i}\tHọ ${i}\tstaff${i}@example.test`
    ).join("\r\n");
    fireEvent.click(screen.getByRole("button", { name: "Dán từ bảng tính" }));
    const again = await screen.findByRole("dialog");
    fireEvent.change(within(again).getByRole("textbox"), { target: { value: fifty } });
    fireEvent.click(within(again).getByRole("button", { name: "Dán vào bảng" }));
    await screen.findByText(/Tối đa 50 hàng/i);
    expect(draftRows()).toHaveLength(50);
  });

  it("rejects duplicate normalized emails and missing roles before any request", async () => {
    const requested = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      requested(config.url);
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fireEvent.click(within(draftRows()[0]).getByRole("button", { name: "Xóa" }));
    fireEvent.click(screen.getByRole("button", { name: "Dán từ bảng tính" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: {
        value: "An\tNguyễn\tAN@Example.TEST\r\nBùi\tTrường\tan@example.test\r\n"
      }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dán vào bảng" }));
    await waitFor(() => expect(draftRows()).toHaveLength(2));
    await chooseRole(draftRows()[0], "Nhân viên");
    await chooseRole(draftRows()[1], "Nhân viên");
    submit();
    await waitFor(() =>
      expect(within(draftRows()[0]).getByText("Email bị trùng trong danh sách mời")).toBeTruthy()
    );
    expect(within(draftRows()[1]).getByText("Email bị trùng trong danh sách mời")).toBeTruthy();
    expect(requested).toHaveBeenCalledTimes(1);
    expect(requested).toHaveBeenCalledWith("/staff/assignable-roles");
  });

  it("saves once, then sends saved rows with concurrency 4 and 60-second timeouts", async () => {
    const calls: { method?: string; url?: string; data?: unknown; timeout?: number }[] = [];
    let active = 0;
    let maxConcurrentSends = 0;
    axiosRequest.defaults.adapter = async config => {
      calls.push({
        method: config.method,
        url: config.url,
        data: config.data,
        timeout: config.timeout
      });
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/send")) {
        active++;
        maxConcurrentSends = Math.max(maxConcurrentSends, active);
        await new Promise(resolve => setTimeout(resolve, 0));
        active--;
        return response(
          config,
          invitation(config.url.split("/")[3], "sent@example.test", { delivery: "sent" })
        );
      }
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    for (let i = 1; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
      fillRow(draftRows()[i], `staff${i}@example.test`);
    }
    for (const row of draftRows()) await chooseRole(row, "Nhân viên");
    submit();
    await waitFor(() =>
      expect(draftRows().every(row => within(row).queryByText("Đã gửi"))).toBe(true)
    );
    const bulk = calls.filter(call => call.url === "/staff/invitations/bulk");
    expect(bulk).toHaveLength(1);
    const sentRows = JSON.parse(String(bulk[0].data)).rows as Record<string, string>[];
    expect(sentRows).toHaveLength(6);
    const allowedKeys = ["clientRowId", "email", "firstName", "lastName", "roleId"];
    for (const row of sentRows) {
      expect(Object.keys(row).every(key => allowedKeys.includes(key))).toBe(true);
      expect(row.roleId).toBe("admin-role");
    }
    expect(JSON.stringify(sentRows)).not.toMatch(/password|permission|scope/i);
    const sends = calls.filter(call => call.url?.endsWith("/send"));
    expect(sends).toHaveLength(6);
    expect(maxConcurrentSends).toBe(4);
    expect(sends.every(call => call.timeout === 60_000)).toBe(true);
    for (const call of sends)
      expect(JSON.parse(String(call.data))).toEqual({ expectedRevision: 0 });
  });

  it("maps server preflight errors by clientRowId and clears them on edit without sending", async () => {
    const sendRequested = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as { rows: { clientRowId: string }[] };
        throw new AxiosError("invalid", "400", config, undefined, {
          ...response(config, null),
          status: 400,
          data: {
            message: "Dữ liệu hàng mời không hợp lệ",
            errors: {
              rows: [
                { clientRowId: body.rows[1].clientRowId, field: "email", code: "DUPLICATE_EMAIL" }
              ]
            }
          }
        });
      }
      if (config.url?.endsWith("/send")) sendRequested(config.url);
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    fillRow(draftRows()[1], "truong@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    await chooseRole(draftRows()[1], "Biên tập viên");
    submit();
    await waitFor(() =>
      expect(within(draftRows()[1]).getByText("Email bị trùng trong danh sách mời")).toBeTruthy()
    );
    expect(within(draftRows()[0]).queryByText("Email bị trùng trong danh sách mời")).toBeNull();
    await waitFor(() => expect(sendRequested).not.toHaveBeenCalled());
    fireEvent.change(within(draftRows()[1]).getByLabelText("Email"), {
      target: { value: "truong2@example.test" }
    });
    await waitFor(() =>
      expect(within(draftRows()[1]).queryByText("Email bị trùng trong danh sách mời")).toBeNull()
    );
  });

  it("sends only saved rows and leaves pending-conflict rows untouched", async () => {
    const sentTo: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }, index) =>
            index === 1
              ? {
                  clientRowId,
                  outcome: "conflict",
                  code: "INVITATION_PENDING_EXISTS",
                  invitationId: "inv-cu"
                }
              : { clientRowId, outcome: "saved", invitation: invitation(clientRowId, email) }
          )
        });
      }
      if (config.url?.endsWith("/send")) {
        sentTo.push(config.url!);
        return response(config, invitation(config.url.split("/")[3], "", { delivery: "sent" }));
      }
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    fillRow(draftRows()[1], "truong@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    await chooseRole(draftRows()[1], "Nhân viên");
    submit();
    await waitFor(() => expect(within(draftRows()[0]).getByText("Đã gửi")).toBeTruthy());
    expect(within(draftRows()[1]).getByText("Đã có thư mời đang chờ cho email này")).toBeTruthy();
    expect(sentTo).toHaveLength(1);
  });

  it("resends only the failed row after a partial delivery failure", async () => {
    const savedIds: string[] = [];
    const resends: { url?: string; data?: unknown }[] = [];
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        savedIds.push(...body.rows.map(row => row.clientRowId));
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/resend")) {
        resends.push({ url: config.url, data: JSON.parse(config.data as string) });
        return response(
          config,
          invitation(config.url.split("/")[3], "", { delivery: "sent", revision: 2 })
        );
      }
      if (config.url?.endsWith("/send")) {
        const id = config.url.split("/")[3];
        const failed = id === savedIds[0];
        return response(
          config,
          invitation(
            id,
            "",
            failed
              ? { delivery: "failed", revision: 1, lastErrorCode: "SMTP_SEND_FAILED" }
              : { delivery: "sent", revision: 1 }
          )
        );
      }
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    fillRow(draftRows()[1], "truong@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    fillRow(draftRows()[2], "gia@example.test");
    for (const row of draftRows()) await chooseRole(row, "Nhân viên");
    submit();
    const failedRow = await waitFor(() => {
      const found = draftRows().find(row => within(row).queryByText("Lỗi gửi mail"));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(failedRow).toBe(draftRows()[0]);
    fireEvent.click(within(failedRow).getByRole("button", { name: "Gửi lại" }));
    await waitFor(() => expect(resends).toHaveLength(1));
    expect(resends[0].url).toBe(`/staff/invitations/${savedIds[0]}/resend`);
    expect(resends[0].data).toEqual({ expectedRevision: 1 });
    const successfulRowResends = resends.filter(
      call => call.url !== `/staff/invitations/${savedIds[0]}/resend`
    );
    expect(successfulRowResends).toHaveLength(0);
    await waitFor(() => expect(within(failedRow).queryByText("Đã gửi")).toBeTruthy());
  });

  it("treats a send timeout as unknown and reconciles via idempotent send, never resend", async () => {
    let timedOut = true;
    let sentId = "";
    const urls: string[] = [];
    axiosRequest.defaults.adapter = async config => {
      urls.push(config.url!);
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        sentId = body.rows[0].clientRowId;
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/send")) {
        if (timedOut)
          throw new AxiosError("timeout of 60000ms exceeded", AxiosError.ECONNABORTED, config);
        return response(config, invitation(sentId, "", { delivery: "sent", revision: 0 }));
      }
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    submit();
    await waitFor(() =>
      expect(within(draftRows()[0]).getByText("Không rõ kết quả gửi")).toBeTruthy()
    );
    expect(within(draftRows()[0]).getByRole("button", { name: "Kiểm tra kết quả" })).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(urls.filter(url => url.endsWith("/send"))).toHaveLength(1);
    timedOut = false;
    fireEvent.click(within(draftRows()[0]).getByRole("button", { name: "Kiểm tra kết quả" }));
    await waitFor(() => expect(within(draftRows()[0]).getByText("Đã gửi")).toBeTruthy());
    expect(urls.filter(url => url.endsWith("/resend"))).toHaveLength(0);
    expect(urls.filter(url => url.endsWith("/send"))).toHaveLength(2);
  });

  it("ignores a stale send completion after its row is removed", async () => {
    const savedIds: string[] = [];
    const pending = {
      resolve: undefined as ((value: unknown) => void) | undefined
    };
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        savedIds.push(...body.rows.map(row => row.clientRowId));
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/send")) {
        if (config.url.endsWith(`/${savedIds[0]}/send`)) {
          await new Promise<unknown>(resolve => {
            pending.resolve = resolve;
          });
          return response(config, invitation(savedIds[0], "", { delivery: "sent", revision: 1 }));
        }
        return response(config, invitation(savedIds[1], "", { delivery: "sent", revision: 1 }));
      }
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Thêm hàng" }));
    fillRow(draftRows()[1], "truong@example.test");
    for (const row of draftRows()) await chooseRole(row, "Nhân viên");
    submit();
    await waitFor(() => expect(within(draftRows()[0]).queryByText("Đang gửi")).toBeTruthy());
    fireEvent.click(within(draftRows()[0]).getByRole("button", { name: "Xóa" }));
    expect(draftRows()).toHaveLength(1);
    await act(async () => {
      pending.resolve?.(undefined);
    });
    await waitFor(() => expect(within(draftRows()[0]).getByText("Đã gửi")).toBeTruthy());
    expect(draftRows()).toHaveLength(1);
    expect(screen.queryByText("Unexpected Application Error!")).toBeNull();
  });

  it("submits the batch only once on repeated clicks", async () => {
    let bulkCalls = 0;
    let releaseBulk: (value: unknown) => void = () => undefined;
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        bulkCalls++;
        await new Promise(resolve => {
          releaseBulk = resolve;
        });
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/send"))
        return response(
          config,
          invitation(config.url.split("/")[3], "", { delivery: "sent", revision: 1 })
        );
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    submit();
    submit();
    await waitFor(() => expect(bulkCalls).toBe(1));
    releaseBulk(undefined);
    await waitFor(() => expect(within(draftRows()[0]).getByText("Đã gửi")).toBeTruthy());
    expect(bulkCalls).toBe(1);
  });

  it("creates a role inline and selects it without losing rows (owner)", async () => {
    setup();
    fillRow(draftRows()[0], "an@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    fireEvent.mouseDown(within(draftRows()[0]).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo vai trò mới" }));
    await screen.findByText("Tên vai trò");
    // Bảng nháp bị ẩn khi editor mở — hàng vẫn nằm trong state
    expect(draftRows()).toHaveLength(0);
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: customRole.name }
    });
    fireEvent.change(screen.getByLabelText("Mã vai trò"), { target: { value: customRole.code } });
    axiosRequest.defaults.adapter = async config =>
      response(
        config,
        config.url === "/permissions"
          ? catalogList
          : config.url === "/staff/assignable-roles"
            ? roles
            : customRole
      );
    fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm hàng" })).toBeTruthy());
    expect(within(draftRows()[0]).getByDisplayValue("an@example.test")).toBeTruthy();
    expect(within(draftRows()[0]).getByText("Biên tập viên")).toBeTruthy();
  });

  it("offers only server-filtered roles to a delegate and never mounts the owner editor", async () => {
    useAppStore.getState().setProfile(staffProfile(["USER_CREATE"]));
    const requested = vi.fn();
    axiosRequest.defaults.adapter = async config => {
      requested(config.url);
      return response(config, config.url === "/staff/assignable-roles" ? [roles[0]] : []);
    };
    setup();
    fireEvent.mouseDown(within(draftRows()[0]).getByRole("combobox"));
    expect(await screen.findByTitle("Nhân viên")).toBeTruthy();
    expect(screen.queryByTitle("Biên tập viên")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tạo vai trò mới" })).toBeNull();
    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
    expect(requested).toHaveBeenCalledWith("/staff/assignable-roles");
  });

  it("blocks navigation for unsaved rows, including while a clean inline editor is open", async () => {
    const router = setup();
    fillRow(draftRows()[0], "an@example.test");
    await navigateAway(router);
    // antd v6 confirm vẽ title ở hai node (.ant-modal-title + .ant-modal-confirm-title)
    await screen.findByText("Danh sách mời chưa được lưu", {
      selector: ".ant-modal-confirm-title"
    });
    fireEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    expect(router.state.location.pathname).toBe("/");

    fireEvent.mouseDown(within(draftRows()[0]).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo vai trò mới" }));
    await screen.findByText("Tên vai trò");
    // Editor sạch + hàng nháp bẩn: vẫn phải chặn bằng bản copy của danh sách mời
    await navigateAway(router);
    await screen.findByText("Danh sách mời chưa được lưu", {
      selector: ".ant-modal-confirm-title"
    });
    fireEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("coordinates with the inline role draft under one blocker", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    axiosRequest.defaults.adapter = async config =>
      response(config, config.url === "/permissions" ? catalogList : roles);
    const router = setup();
    fireEvent.mouseDown(within(draftRows()[0]).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("button", { name: "Tạo vai trò mới" }));
    fireEvent.change(await screen.findByLabelText("Tên vai trò"), {
      target: { value: "Kho hàng" }
    });
    await navigateAway(router);
    await screen.findByText("Vai trò chưa được lưu", {
      selector: ".ant-modal-confirm-title"
    });
    fireEvent.click(screen.getByRole("button", { name: "Ở lại" }));
    expect(router.state.location.pathname).toBe("/");
    expect(errorSpy.mock.calls.some(args => String(args[0]).includes("one blocker"))).toBe(false);
  });

  it("keeps row and invitation data out of localStorage", async () => {
    axiosRequest.defaults.adapter = async config => {
      if (config.url === "/staff/invitations/bulk") {
        const body = JSON.parse(config.data as string) as {
          rows: { clientRowId: string; email: string }[];
        };
        return response(config, {
          rows: body.rows.map<InvitationBatchResultRow>(({ clientRowId, email }) => ({
            clientRowId,
            outcome: "saved",
            invitation: invitation(clientRowId, email)
          }))
        });
      }
      if (config.url?.endsWith("/send"))
        return response(
          config,
          invitation(config.url.split("/")[3], "", { delivery: "sent", revision: 1 })
        );
      return response(config, config.url === "/staff/assignable-roles" ? roles : []);
    };
    setup();
    fillRow(draftRows()[0], "an@example.test");
    await chooseRole(draftRows()[0], "Nhân viên");
    submit();
    await waitFor(() => expect(within(draftRows()[0]).getByText("Đã gửi")).toBeTruthy());
    expect(Object.values(localStorage).join("")).not.toContain("an@example.test");
  });
});
