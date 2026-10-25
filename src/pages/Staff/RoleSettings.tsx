import { useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Modal, Typography } from "antd";
import DataTable from "@/components/DataTable";
import PermissionGuard from "@/guards/PermissionGuard";
import { deleteRoleAPI, listRolesAPI, type RoleListResult, type RoleView } from "@/services/roles";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import RoleEditor from "./RoleEditor";

export default function RoleSettings() {
  return (
    <PermissionGuard policy={{ ownerOnly: true }}>
      <OwnerRoleSettings />
    </PermissionGuard>
  );
}

function OwnerRoleSettings() {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RoleListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ roleId?: string } | null>(null);
  const [deleting, setDeleting] = useState<RoleView | null>(null);
  const [deletingError, setDeletingError] = useState<string | null>(null);
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
    listRolesAPI({ page, pageSize: 10 }, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.data.length === 0 && page > 1) {
          setPage(value => value - 1);
          return;
        }
        setResult(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(cause));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [page, attempt]);
  const reload = () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAttempt(value => value + 1);
  };
  const remove = async () => {
    if (!deleting || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setDeletingError(null);
    try {
      await deleteRoleAPI(deleting.id, deleting.revision);
      if (!active.current) return;
      setDeleting(null);
      reload();
    } catch (cause) {
      if (!active.current) return;
      setDeletingError(
        cause instanceof ApiError && cause.errors?.code === "ROLE_IN_USE"
          ? "Vai trò đang được sử dụng bởi nhân viên hoặc thư mời"
          : getErrorMessage(cause)
      );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2} className='mb-0!'>
        Vai trò
      </Typography.Title>
      {editing ? (
        <RoleEditor
          roleId={editing.roleId}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : (
        <>
          <Flex align='center' justify='space-between' gap={16}>
            <Typography.Text type='secondary'>
              Nhân viên cùng vai trò dùng chung một bộ quyền.
            </Typography.Text>
            <Flex gap={8}>
              <Button onClick={reload} disabled={loading}>
                Tải lại
              </Button>
              <Button type='primary' onClick={() => setEditing({})}>
                Tạo vai trò
              </Button>
            </Flex>
          </Flex>
          {error && (
            <Alert
              type='error'
              showIcon
              title={error}
              action={<Button onClick={reload}>Thử lại</Button>}
            />
          )}
          <DataTable<RoleView>
            rowKey='id'
            loading={loading}
            dataSource={result?.data ?? []}
            pagination={{
              current: page,
              pageSize: 10,
              total: result?.total ?? 0,
              showSizeChanger: false,
              onChange: next => {
                setLoading(true);
                setError(null);
                setResult(null);
                setPage(next);
              }
            }}
            columns={[
              {
                title: "Vai trò",
                key: "name",
                render: (_, role) => (
                  <Button
                    type='link'
                    className='p-0!'
                    onClick={() => setEditing({ roleId: role.id })}
                  >
                    {role.name}
                  </Button>
                )
              },
              { title: "Mã", dataIndex: "code", width: 180 },
              {
                title: "Mô tả",
                dataIndex: "description",
                render: description => description || "—"
              },
              { title: "Nhân viên đang sử dụng", dataIndex: "assignedStaffCount", width: 190 },
              {
                title: "Thao tác",
                key: "actions",
                width: 110,
                render: (_, role) =>
                  ["SUPER_ADMIN", "ADMIN"].includes(role.code) ? null : (
                    <Button
                      danger
                      aria-label={`Xóa ${role.name}`}
                      onClick={() => {
                        setDeleting(role);
                        setDeletingError(null);
                      }}
                    >
                      Xóa
                    </Button>
                  )
              }
            ]}
          />
        </>
      )}
      <Modal
        title='Xóa vai trò'
        open={!!deleting}
        onCancel={() => {
          if (!saving) setDeleting(null);
        }}
        onOk={() => void remove()}
        okText='Xóa vai trò'
        cancelText='Hủy'
        confirmLoading={saving}
        okButtonProps={{ danger: true, disabled: !!deletingError }}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={!saving}
      >
        <Typography.Paragraph>
          Xóa vai trò {deleting?.name}? Vai trò có nhân viên hoặc thư mời đang chờ sẽ không thể xóa.
        </Typography.Paragraph>
        {deletingError && (
          <Alert
            type='error'
            showIcon
            title={deletingError}
            action={
              <Button
                onClick={() => {
                  setDeleting(null);
                  reload();
                }}
              >
                Tải lại danh sách
              </Button>
            }
          />
        )}
      </Modal>
    </Flex>
  );
}
