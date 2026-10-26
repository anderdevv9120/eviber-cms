import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Divider, Flex, Input, Modal, Select, Table, Typography } from "antd";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import {
  bulkInviteAPI,
  listAssignableRolesAPI,
  resendInvitationAPI,
  sendInvitationAPI,
  type AssignableRoleView,
  type InvitationRowInput,
  type InvitationView
} from "@/services/staff";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { useAppStore } from "@/store/useAppStore";
import { MAX_STAFF_ROWS, parsePastedStaffRows, validateStaffRows } from "./staff-rows";
import RoleEditor from "./RoleEditor";

type RowStatus = "draft" | "saved" | "sending" | "sent" | "failed" | "unknown";

interface RegistrationRow {
  clientRowId: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string | null;
  status: RowStatus;
  invitation: InvitationView | null;
  error: string | null;
}

const ROWS_WARNING = {
  title: "Danh sách mời chưa được lưu",
  content: "Rời trang sẽ bỏ các hàng chưa lưu."
};
const ROLE_DRAFT_WARNING = {
  title: "Vai trò chưa được lưu",
  content: "Rời trang sẽ bỏ thay đổi tên, mô tả và quyền chưa lưu."
};
// Gửi tối đa 4 thư song song (kế hoạch); server vẫn throttle từng endpoint
const SEND_CONCURRENCY = 4;

const statusText: Partial<Record<RowStatus, string>> = {
  sending: "Đang gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi mail",
  unknown: "Không rõ kết quả gửi"
};

const conflictMessage = (code: string): string =>
  code === "INVITATION_PENDING_EXISTS"
    ? "Đã có thư mời đang chờ cho email này"
    : "Không lưu được hàng này";

const preflightMessage = (code: string): string => {
  if (code === "DUPLICATE_EMAIL" || code === "DUPLICATE_CLIENT_ROW_ID")
    return "Email bị trùng trong danh sách mời";
  if (code === "ROLE_NOT_FOUND" || code === "ROLE_NOT_ASSIGNABLE")
    return "Vai trò không còn khả dụng, chọn lại vai trò";
  return "Dữ liệu hàng không hợp lệ";
};

const statusOfView = (view: InvitationView): RowStatus => {
  if (view.delivery === "sent") return "sent";
  if (view.delivery === "failed") return "failed";
  // HTTP trả về nhưng chưa rõ kết quả (đang gửi trên server) — không tự gửi lại
  return "unknown";
};

// ID hàng chỉ cần duy nhất trong phiên; counter module để không đọc ref lúc render
let rowSeq = 0;
const makeRow = (): RegistrationRow => {
  rowSeq += 1;
  return {
    clientRowId: `row-${rowSeq}`,
    firstName: "",
    lastName: "",
    email: "",
    roleId: null,
    status: "draft",
    invitation: null,
    error: null
  };
};

export default function StaffRegistration() {
  return (
    <App component={false}>
      <RegistrationForm />
    </App>
  );
}

function RegistrationForm() {
  const profile = useAppStore(state => state.profile);
  const isOwner = profile?.access.isOwner === true;
  const active = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const [rows, setRows] = useState<RegistrationRow[]>(() => [makeRow()]);
  const [roleOptions, setRoleOptions] = useState<AssignableRoleView[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesAttempt, setRolesAttempt] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submittingUi, setSubmittingUi] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [creatingRowId, setCreatingRowId] = useState<string | null>(null);
  const [roleDraftDirty, setRoleDraftDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listAssignableRolesAPI(controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setRoleOptions(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setRolesError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [rolesAttempt]);

  const hasUnsavedRows = rows.some(
    row =>
      !row.invitation &&
      (row.email.trim() !== "" ||
        row.firstName.trim() !== "" ||
        row.lastName.trim() !== "" ||
        !!row.roleId)
  );
  // Một blocker duy nhất: hàng chưa lưu hoặc bản nháp vai trò (editor tắt blocker nội bộ của nó)
  useUnsavedOrderWarning(
    hasUnsavedRows || roleDraftDirty,
    roleDraftDirty ? ROLE_DRAFT_WARNING : ROWS_WARNING
  );

  const updateRow = (clientRowId: string, patch: Partial<RegistrationRow>) =>
    setRows(current =>
      current.map(row => (row.clientRowId === clientRowId ? { ...row, ...patch } : row))
    );

  const applyView = (view: InvitationView) => {
    if (!active.current) return;
    setRows(current =>
      current.map(row =>
        row.invitation && row.invitation.id === view.id
          ? { ...row, invitation: view, status: statusOfView(view) }
          : row
      )
    );
  };

  const addRow = () => {
    if (rows.length >= MAX_STAFF_ROWS) {
      setPageError(`Tối đa ${MAX_STAFF_ROWS} hàng mỗi lần mời.`);
      return;
    }
    setPageError(null);
    setRows(current => [...current, makeRow()]);
  };

  const removeRow = (clientRowId: string) =>
    setRows(current => current.filter(row => row.clientRowId !== clientRowId));

  const applyPaste = () => {
    const parsed = parsePastedStaffRows(pasteText);
    const room = Math.max(MAX_STAFF_ROWS - rows.length, 0);
    const take = parsed.slice(0, room);
    if (parsed.length > room)
      setPageError(
        `Tối đa ${MAX_STAFF_ROWS} hàng mỗi lần mời, chỉ thêm được ${take.length} hàng mới.`
      );
    else setPageError(null);
    if (take.length)
      setRows(current => [...current, ...take.map(cells => ({ ...makeRow(), ...cells }))]);
    setPasteOpen(false);
    setPasteText("");
  };

  const closeEditor = () => {
    setCreatingRowId(null);
    setRoleDraftDirty(false);
  };

  const sendRow = async (row: RegistrationRow, resend: boolean) => {
    if (!row.invitation) return;
    updateRow(row.clientRowId, { status: "sending", error: null });
    try {
      const { data } = resend
        ? await resendInvitationAPI(row.invitation.id, row.invitation.revision)
        : await sendInvitationAPI(row.invitation.id, row.invitation.revision);
      applyView(data);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && cause.status === 409) {
        updateRow(row.clientRowId, {
          error: "Thư mời vừa được thay đổi. Quản lý thư mời trong trang Nhân viên."
        });
        return;
      }
      // Timeout/mạng lỗi: kết quả gửi là "không rõ", không tự gửi lại
      updateRow(row.clientRowId, { status: "unknown" });
    }
  };

  const sendSaved = async (saved: RegistrationRow[]) => {
    const queue = [...saved];
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) await sendRow(row, false);
    };
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, worker));
  };

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSubmittingUi(true);
    try {
      const pending = rows.filter(row => !row.invitation);
      if (!pending.length) {
        setPageError("Thêm ít nhất một nhân viên để mời.");
        return;
      }
      const violations = validateStaffRows(pending);
      setRows(current =>
        current.map(row => ({
          ...row,
          error: row.invitation ? row.error : (violations.get(row.clientRowId) ?? null)
        }))
      );
      if (violations.size) return;

      setPageError(null);
      const input: InvitationRowInput[] = pending.map(row => {
        const payload: InvitationRowInput = {
          clientRowId: row.clientRowId,
          email: row.email.trim(),
          roleId: row.roleId!
        };
        const firstName = row.firstName.trim();
        const lastName = row.lastName.trim();
        if (firstName) payload.firstName = firstName;
        if (lastName) payload.lastName = lastName;
        return payload;
      });
      const { data } = await bulkInviteAPI(input);
      if (!active.current) return;

      const byRow = new Map(data.rows.map(result => [result.clientRowId, result]));
      const nextRows = rows.map(row => {
        const result = byRow.get(row.clientRowId);
        if (!result) return row;
        return result.outcome === "saved"
          ? { ...row, invitation: result.invitation, status: "saved" as RowStatus, error: null }
          : {
              ...row,
              invitation: null,
              status: "draft" as RowStatus,
              error: conflictMessage(result.code)
            };
      });
      setRows(nextRows);
      await sendSaved(nextRows.filter(row => row.invitation));
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && Array.isArray(cause.errors?.rows)) {
        const preflight = new Map(
          (cause.errors.rows as { clientRowId: string; code: string }[]).map(entry => [
            entry.clientRowId,
            preflightMessage(entry.code)
          ])
        );
        setRows(current =>
          current.map(row =>
            row.invitation ? row : { ...row, error: preflight.get(row.clientRowId) ?? null }
          )
        );
      } else {
        setPageError(getErrorMessage(cause));
      }
    } finally {
      submitting.current = false;
      if (active.current) setSubmittingUi(false);
    }
  };

  if (rolesError)
    return (
      <Flex vertical gap={16}>
        <Typography.Title level={2} className='mb-0!'>
          Mời nhân viên
        </Typography.Title>
        <Alert
          type='error'
          showIcon
          title={rolesError}
          action={
            <Button
              onClick={() => {
                setRoleOptions(null);
                setRolesError(null);
                setRolesAttempt(value => value + 1);
              }}
            >
              Thử lại
            </Button>
          }
        />
      </Flex>
    );

  if (creatingRowId)
    return (
      <Flex vertical gap={16}>
        <Typography.Title level={2} className='mb-0!'>
          Mời nhân viên
        </Typography.Title>
        <RoleEditor
          manageUnsavedWarning={false}
          onDirtyChange={setRoleDraftDirty}
          onCancel={closeEditor}
          onSaved={role => {
            setRoleOptions(current =>
              current?.some(option => option.id === role.id) ? current : [...(current ?? []), role]
            );
            updateRow(creatingRowId, { roleId: role.id });
            closeEditor();
          }}
        />
      </Flex>
    );

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2} className='mb-0!'>
        Mời nhân viên
      </Typography.Title>
      <Typography.Text type='secondary'>
        Mời qua email — người được mời tự đặt mật khẩu khi nhận thư. Mời một khách hàng hiện hữu vẫn
        giữ nguyên tài khoản khách hàng, mật khẩu và lịch sử đơn hàng của họ.
      </Typography.Text>
      <Flex align='center' justify='space-between' gap={16}>
        <Flex gap={8}>
          <Button onClick={() => setPasteOpen(true)}>Dán từ bảng tính</Button>
          <Button onClick={addRow}>Thêm hàng</Button>
        </Flex>
        <Button type='primary' loading={submittingUi} onClick={() => void submit()}>
          Lưu và gửi thư mời
        </Button>
      </Flex>
      {pageError && <Alert type='warning' showIcon title={pageError} />}
      <Table<RegistrationRow>
        rowKey='clientRowId'
        pagination={false}
        dataSource={rows}
        scroll={{ x: "max-content" }}
        columns={[
          {
            title: "Họ",
            render: (_, row) =>
              row.invitation ? (
                <Typography.Text>{row.lastName || "—"}</Typography.Text>
              ) : (
                <Input
                  aria-label='Họ'
                  value={row.lastName}
                  maxLength={255}
                  disabled={submittingUi}
                  onChange={event => updateRow(row.clientRowId, { lastName: event.target.value })}
                />
              )
          },
          {
            title: "Tên",
            render: (_, row) =>
              row.invitation ? (
                <Typography.Text>{row.firstName || "—"}</Typography.Text>
              ) : (
                <Input
                  aria-label='Tên'
                  value={row.firstName}
                  maxLength={255}
                  disabled={submittingUi}
                  onChange={event => updateRow(row.clientRowId, { firstName: event.target.value })}
                />
              )
          },
          {
            title: "Email",
            render: (_, row) =>
              row.invitation ? (
                <Typography.Text>{row.email}</Typography.Text>
              ) : (
                <Input
                  aria-label='Email'
                  value={row.email}
                  maxLength={320}
                  disabled={submittingUi}
                  status={row.error ? "error" : undefined}
                  onChange={event => {
                    updateRow(row.clientRowId, { email: event.target.value, error: null });
                  }}
                />
              )
          },
          {
            title: "Vai trò",
            render: (_, row) =>
              row.invitation ? (
                <Typography.Text>{row.invitation.role.name}</Typography.Text>
              ) : (
                <Select<AssignableRoleView["id"]>
                  style={{ minWidth: 180 }}
                  placeholder='Chọn vai trò'
                  value={row.roleId ?? undefined}
                  status={row.error ? "error" : undefined}
                  disabled={submittingUi}
                  options={(roleOptions ?? []).map(option => ({
                    value: option.id,
                    label: option.name
                  }))}
                  onChange={roleId => updateRow(row.clientRowId, { roleId, error: null })}
                  {...(isOwner
                    ? {
                        dropdownRender: menu => (
                          <>
                            {menu}
                            <Divider style={{ margin: "4px 0" }} />
                            <Button
                              block
                              type='link'
                              onClick={() => setCreatingRowId(row.clientRowId)}
                            >
                              Tạo vai trò mới
                            </Button>
                          </>
                        )
                      }
                    : {})}
                />
              )
          },
          {
            title: "Trạng thái",
            render: (_, row) => (
              <Flex vertical gap={4}>
                <Typography.Text
                  type={row.error ? "danger" : row.status === "sent" ? "success" : undefined}
                >
                  {row.error ?? statusText[row.status] ?? (row.invitation ? "Đã lưu" : "—")}
                </Typography.Text>
              </Flex>
            )
          },
          {
            title: "Thao tác",
            render: (_, row) => (
              <Flex gap={8}>
                {row.status === "failed" && row.invitation && (
                  <Button onClick={() => void sendRow(row, true)}>Gửi lại</Button>
                )}
                {row.status === "unknown" && row.invitation && (
                  <Button onClick={() => void sendRow(row, false)}>Kiểm tra kết quả</Button>
                )}
                <Button danger onClick={() => removeRow(row.clientRowId)}>
                  Xóa
                </Button>
              </Flex>
            )
          }
        ]}
      />
      <Modal
        title='Dán danh sách từ bảng tính'
        open={pasteOpen}
        destroyOnHidden
        okText='Dán vào bảng'
        cancelText='Hủy'
        onOk={applyPaste}
        onCancel={() => {
          setPasteOpen(false);
          setPasteText("");
        }}
      >
        <Typography.Paragraph type='secondary'>
          Mỗi dòng một người, ba cột cách nhau bằng dấu Tab: Tên, Họ, Email. Cột khác (kể cả vai
          trò) sẽ bị bỏ qua.
        </Typography.Paragraph>
        <Input.TextArea
          rows={8}
          value={pasteText}
          onChange={event => setPasteText(event.target.value)}
          placeholder={"An\tNguyễn\tan@example.test"}
        />
      </Modal>
    </Flex>
  );
}
