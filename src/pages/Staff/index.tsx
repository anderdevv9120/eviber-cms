import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Flex, Modal, Select, Space, Table, Typography } from "antd";
import { Link } from "react-router";
import { PATH } from "@/constants/paths";
import {
  assignStaffRoleAPI,
  listAssignableRolesAPI,
  listInvitationsAPI,
  listStaffAPI,
  resendInvitationAPI,
  revokeStaffAccessAPI,
  sendInvitationAPI,
  revokeInvitationAPI,
  type AssignableRoleView,
  type InvitationView,
  type StaffView
} from "@/services/staff";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { useAppStore } from "@/store/useAppStore";

const INVITATION_STALE = "invitation00003";

const isExpired = (view: InvitationView): boolean =>
  view.state === "pending" && new Date(view.expiresAt).getTime() <= Date.now();

const stateText = (view: InvitationView): string => {
  if (view.state === "accepted") return "Đã nhận";
  if (view.state === "revoked") return "Đã hủy";
  return isExpired(view) ? "Đã hết hạn" : "Đang chờ";
};

const deliveryText = (view: InvitationView): string => {
  if (view.state !== "pending") return "—";
  switch (view.delivery) {
    case "sent":
      return "Đã gửi";
    case "sending":
      return "Đang gửi";
    case "failed":
      return "Lỗi gửi mail";
    case "unknown":
      return "Không rõ";
    default:
      return "Chưa gửi";
  }
};

export default function StaffManagement() {
  return (
    <App component={false}>
      <ManagementSections />
    </App>
  );
}

function ManagementSections() {
  const profile = useAppStore(state => state.profile);
  const isOwner = profile?.access.isOwner === true;
  return (
    <Flex vertical gap={24}>
      <Flex align='center' justify='space-between' gap={16} wrap='wrap'>
        <Typography.Title level={2} className='mb-0!'>
          Nhân viên & phân quyền
        </Typography.Title>
        <Space>
          <Link to={PATH.SETTINGS_ACCESS_NEW}>
            <Button type='primary'>Mời nhân viên</Button>
          </Link>
          {isOwner && (
            <Link to={PATH.SETTINGS_ROLES}>
              <Button>Vai trò</Button>
            </Link>
          )}
        </Space>
      </Flex>
      <Alert
        type='info'
        showIcon
        title='Về thư mời và quyền CMS'
        description={
          <ul className='m-0 list-disc pl-5'>
            <li>
              Mời một khách hàng hiện hữu vẫn giữ nguyên tài khoản khách hàng, mật khẩu và lịch sử
              đơn hàng của họ.
            </li>
            <li>
              Thư mời đang chờ chưa phải là nhân viên: người được mời phải nhận thư và kích hoạt tài
              khoản.
            </li>
            <li>Thu hồi quyền CMS không xóa tài khoản khách hàng hay lịch sử mua hàng của họ.</li>
            <li>
              Gửi mail thành công chỉ nghĩa là máy chủ thư đã nhận thư, chưa chắc thư đã đến hộp
              thư.
            </li>
          </ul>
        }
      />
      <InvitationsSection />
      {isOwner && <StaffSection />}
    </Flex>
  );
}

function InvitationsSection() {
  const [invitations, setInvitations] = useState<InvitationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    listInvitationsAPI(controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setInvitations(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = () => {
    setInvitations(null);
    setError(null);
    setStale(false);
    setAttempt(value => value + 1);
  };

  const act = async (view: InvitationView, action: "send" | "resend" | "revoke") => {
    if (busyId) return;
    setBusyId(view.id);
    try {
      const { data } =
        action === "send"
          ? await sendInvitationAPI(view.id, view.revision)
          : action === "resend"
            ? await resendInvitationAPI(view.id, view.revision)
            : await revokeInvitationAPI(view.id, view.revision);
      if (!active.current) return;
      setInvitations(current => (current ?? []).map(item => (item.id === data.id ? data : item)));
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && cause.errors?.code === INVITATION_STALE) setStale(true);
      else setError(getErrorMessage(cause));
    } finally {
      if (active.current) setBusyId(null);
    }
  };

  return (
    <section>
      <Typography.Title level={3}>Thư mời</Typography.Title>
      {stale && (
        <Alert
          type='warning'
          showIcon
          title='Thư mời vừa được thay đổi bởi người khác.'
          action={<Button onClick={reload}>Tải lại</Button>}
        />
      )}
      {error && !stale && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      )}
      <Table<InvitationView>
        rowKey='id'
        loading={!invitations && !error}
        pagination={false}
        dataSource={invitations ?? []}
        scroll={{ x: "max-content" }}
        columns={[
          { title: "Email", dataIndex: "email" },
          { title: "Vai trò", render: (_, view) => view.role.name },
          { title: "Trạng thái", render: (_, view) => stateText(view) },
          {
            title: "Hết hạn",
            render: (_, view) => new Date(view.expiresAt).toLocaleString("vi-VN")
          },
          { title: "Gửi mail", render: (_, view) => deliveryText(view) },
          {
            title: "Thao tác",
            render: (_, view) => {
              if (view.state !== "pending") return null;
              const attempted = view.delivery !== "pending" && view.delivery !== "sending";
              return (
                <Flex gap={8}>
                  {view.delivery === "pending" && (
                    <Button disabled={!!busyId} onClick={() => void act(view, "send")}>
                      Gửi
                    </Button>
                  )}
                  {attempted && (
                    <Button disabled={!!busyId} onClick={() => void act(view, "resend")}>
                      Gửi lại
                    </Button>
                  )}
                  <Button danger disabled={!!busyId} onClick={() => void act(view, "revoke")}>
                    Hủy
                  </Button>
                </Flex>
              );
            }
          }
        ]}
      />
    </section>
  );
}

function StaffSection() {
  const [staff, setStaff] = useState<StaffView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [assigning, setAssigning] = useState<StaffView | null>(null);
  const [assignRoles, setAssignRoles] = useState<AssignableRoleView[] | null>(null);
  const [assignRoleId, setAssignRoleId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignStale, setAssignStale] = useState(false);
  const [revoking, setRevoking] = useState<StaffView | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    listStaffAPI(controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setStaff(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = () => {
    setStaff(null);
    setError(null);
    setAttempt(value => value + 1);
  };

  const openAssigning = (member: StaffView) => {
    setAssigning(member);
    setAssignRoleId(null);
    setAssignError(null);
    setAssignStale(false);
    if (!assignRoles)
      listAssignableRolesAPI()
        .then(({ data }) => {
          if (active.current) setAssignRoles(data);
        })
        .catch((cause: unknown) => {
          if (active.current) setAssignError(getErrorMessage(cause));
        });
  };

  const saveRole = async () => {
    if (!assigning?.role || !assignRoleId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setAssignError(null);
    try {
      const { data } = await assignStaffRoleAPI(assigning.id, assignRoleId, assigning.role.id);
      if (!active.current) return;
      setStaff(current => (current ?? []).map(item => (item.id === data.id ? data : item)));
      setAssigning(null);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && cause.errors?.code === "STAFF_STALE_ROLE")
        setAssignStale(true);
      else setAssignError(getErrorMessage(cause));
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };

  const revokeAccess = async () => {
    if (!revoking?.role || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setRevokeError(null);
    try {
      await revokeStaffAccessAPI(revoking.id, revoking.role.id);
      if (!active.current) return;
      setRevoking(null);
      reload();
    } catch (cause) {
      if (!active.current) return;
      setRevokeError(
        cause instanceof ApiError && cause.errors?.code === "STAFF_LAST_OWNER"
          ? "Không thể bỏ quyền của chủ cửa hàng cuối cùng."
          : getErrorMessage(cause)
      );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };

  return (
    <section>
      <Typography.Title level={3}>Nhân viên CMS</Typography.Title>
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      )}
      <Table<StaffView>
        rowKey='id'
        loading={!staff && !error}
        pagination={false}
        dataSource={staff ?? []}
        scroll={{ x: "max-content" }}
        columns={[
          { title: "Email", dataIndex: "email" },
          {
            title: "Tên",
            render: (_, member) =>
              [member.lastName, member.firstName].filter(Boolean).join(" ") || "—"
          },
          { title: "Vai trò", render: (_, member) => member.role?.name ?? "—" },
          {
            title: "Đăng nhập cuối",
            render: (_, member) =>
              member.lastLogin ? new Date(member.lastLogin).toLocaleString("vi-VN") : "—"
          },
          {
            title: "Thao tác",
            render: (_, member) =>
              member.role ? (
                <Flex gap={8}>
                  <Button onClick={() => openAssigning(member)}>Đổi vai trò</Button>
                  <Button
                    danger
                    onClick={() => {
                      setRevoking(member);
                      setRevokeError(null);
                    }}
                  >
                    Thu hồi quyền CMS
                  </Button>
                </Flex>
              ) : null
          }
        ]}
      />
      <Modal
        title='Đổi vai trò nhân viên'
        open={!!assigning}
        destroyOnHidden
        okText='Lưu vai trò'
        cancelText='Hủy'
        confirmLoading={saving}
        onOk={() => void saveRole()}
        okButtonProps={{ disabled: !assignRoleId || !!assignStale }}
        onCancel={() => {
          if (!saving) setAssigning(null);
        }}
      >
        <Typography.Paragraph>
          Đổi vai trò của {assigning?.email} từ “{assigning?.role?.name}”.
        </Typography.Paragraph>
        <Select
          style={{ width: "100%" }}
          placeholder='Chọn vai trò mới'
          value={assignRoleId ?? undefined}
          loading={!assignRoles}
          options={(assignRoles ?? []).map(role => ({ value: role.id, label: role.name }))}
          onChange={value => setAssignRoleId(value)}
        />
        {assignError && !assignStale && (
          <Alert type='error' showIcon className='mt-4' title={assignError} />
        )}
        {assignStale && (
          <Alert
            type='warning'
            showIcon
            className='mt-4'
            title='Thông tin nhân viên vừa được thay đổi, vui lòng tải lại danh sách.'
            action={
              <Button
                onClick={() => {
                  setAssigning(null);
                  reload();
                }}
              >
                Tải lại danh sách
              </Button>
            }
          />
        )}
      </Modal>
      <Modal
        title='Thu hồi quyền CMS'
        open={!!revoking}
        destroyOnHidden
        okText='Thu hồi'
        cancelText='Hủy'
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onOk={() => void revokeAccess()}
        onCancel={() => {
          if (!saving) setRevoking(null);
        }}
      >
        <Typography.Paragraph>
          Thu hồi quyền CMS của {revoking?.email}? Người này vẫn giữ nguyên tài khoản khách hàng,
          lịch sử mua hàng và phiên mua sắm; họ chỉ mất quyền vào CMS.
        </Typography.Paragraph>
        {revokeError && <Alert type='error' showIcon title={revokeError} />}
      </Modal>
    </section>
  );
}
