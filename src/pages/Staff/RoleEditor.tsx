import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Flex, Form, Input, Spin, Typography } from "antd";
import PermissionGuard from "@/guards/PermissionGuard";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import {
  createRoleAPI,
  getRoleAPI,
  listPermissionsAPI,
  updateRoleAPI,
  type PermissionCatalogEntry,
  type RoleView
} from "@/services/roles";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";

interface Props {
  roleId?: string;
  onSaved(role: RoleView): void;
  onCancel(): void;
}
interface Loaded {
  role?: RoleView;
  catalog: PermissionCatalogEntry[];
}
interface Fields {
  name: string;
  code: string;
  description: string;
}

export default function RoleEditor(props: Props) {
  return (
    <App component={false}>
      <PermissionGuard policy={{ ownerOnly: true }}>
        <OwnerRoleEditor key={props.roleId ?? "new"} {...props} />
      </PermissionGuard>
    </App>
  );
}

function OwnerRoleEditor({ roleId, onSaved, onCancel }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listPermissionsAPI(controller.signal),
      roleId ? getRoleAPI(roleId, controller.signal) : Promise.resolve(undefined)
    ])
      .then(([permissions, role]) => {
        if (!controller.signal.aborted)
          setLoaded({ catalog: permissions.data.data, role: role?.data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [roleId, attempt]);
  const reload = () => {
    setLoaded(null);
    setError(null);
    setAttempt(value => value + 1);
  };
  if (!loaded)
    return (
      <Flex vertical gap={16}>
        {error ? (
          <Alert
            type='error'
            showIcon
            title={error}
            action={<Button onClick={reload}>Thử lại</Button>}
          />
        ) : (
          <Spin aria-label='Đang tải vai trò' />
        )}
        <Flex justify='end'>
          <Button onClick={onCancel}>Hủy</Button>
        </Flex>
      </Flex>
    );
  return <RoleForm {...loaded} onSaved={onSaved} onCancel={onCancel} onReload={reload} />;
}

function RoleForm({
  role,
  catalog,
  onSaved,
  onCancel,
  onReload
}: Loaded & Omit<Props, "roleId"> & { onReload(): void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const readOnly = role?.code === "SUPER_ADMIN";
  useUnsavedOrderWarning(dirty && !readOnly, {
    title: "Vai trò chưa được lưu",
    content: "Rời trang sẽ bỏ thay đổi tên, mô tả và quyền chưa lưu."
  });
  const [selected, setSelected] = useState(() =>
    catalog.filter(entry => role?.permissionIds.includes(entry.id)).map(entry => entry.id)
  );
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of catalog) {
    const entries = groups.get(entry.group);
    if (entries) entries.push(entry);
    else groups.set(entry.group, [entry]);
  }
  const requiredCodes = new Set(
    catalog.filter(entry => selected.includes(entry.id)).flatMap(entry => entry.requires)
  );

  const changePermission = (permission: PermissionCatalogEntry, checked: boolean) => {
    const next = new Set<string>(selected);
    if (checked) {
      const include = (entry: PermissionCatalogEntry) => {
        if (next.has(entry.id)) return;
        next.add(entry.id);
        for (const code of entry.requires) {
          const dependency = catalog.find(item => item.code === code);
          if (!dependency) throw new Error(`Thiếu quyền bắt buộc: ${code}`);
          include(dependency);
        }
      };
      include(permission);
    } else next.delete(permission.id);
    setSelected(catalog.filter(entry => next.has(entry.id)).map(entry => entry.id));
    setDirty(true);
  };

  const submit = async (fields: Fields) => {
    if (readOnly || stale || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const input = {
      name: fields.name.trim(),
      description: fields.description.trim(),
      permissionIds: selected
    };
    try {
      const { data } = role
        ? await updateRoleAPI(role.id, { ...input, expectedRevision: role.revision })
        : await createRoleAPI({ ...input, code: fields.code.trim().toUpperCase() });
      if (active.current) {
        setDirty(false);
        onSaved(data);
      }
    } catch (cause) {
      if (!active.current) return;
      setError(getErrorMessage(cause));
      if (cause instanceof ApiError && cause.errors?.code === "ROLE_STALE_REVISION") setStale(true);
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };

  return (
    <Form<Fields>
      layout='vertical'
      initialValues={{
        name: role?.name ?? "",
        code: role?.code ?? "",
        description: role?.description ?? ""
      }}
      onFinish={submit}
      onValuesChange={() => setDirty(true)}
      disabled={saving || readOnly}
    >
      <Typography.Title level={3}>{role ? "Chi tiết vai trò" : "Tạo vai trò"}</Typography.Title>
      {readOnly ? (
        <Alert
          type='info'
          showIcon
          className='mb-4'
          title='Chủ cửa hàng có toàn quyền CMS. Vai trò này không thể chỉnh sửa.'
        />
      ) : (
        role && (
          <Alert
            type='warning'
            showIcon
            className='mb-4'
            title={`Thay đổi áp dụng cho ${role.assignedStaffCount} nhân viên đang sử dụng vai trò này.`}
          />
        )
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          className='mb-4'
          title={error}
          description={
            stale
              ? "Bản nháp được giữ nguyên. Tải lại sẽ thay bản nháp bằng dữ liệu mới nhất."
              : undefined
          }
          action={stale ? <Button onClick={onReload}>Tải lại vai trò</Button> : undefined}
        />
      )}
      <Form.Item
        name='name'
        label='Tên vai trò'
        rules={[
          { required: true, whitespace: true, message: "Nhập tên vai trò" },
          { max: 100, message: "Tên vai trò tối đa 100 ký tự" }
        ]}
      >
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item
        name='code'
        label='Mã vai trò'
        extra='Mã không thể thay đổi sau khi tạo.'
        rules={[
          { required: true, whitespace: true, message: "Nhập mã vai trò" },
          { max: 255, message: "Mã vai trò tối đa 255 ký tự" },
          {
            validator: (_, value: string) =>
              !role && ["SUPER_ADMIN", "ADMIN", "CUSTOMER"].includes(value.trim().toUpperCase())
                ? Promise.reject(new Error("Mã vai trò dành riêng, vui lòng chọn mã khác"))
                : Promise.resolve()
          }
        ]}
      >
        <Input readOnly={!!role} maxLength={255} />
      </Form.Item>
      <Form.Item
        name='description'
        label='Mô tả'
        rules={[{ max: 500, message: "Mô tả tối đa 500 ký tự" }]}
      >
        <Input.TextArea maxLength={500} rows={2} />
      </Form.Item>
      {!readOnly && (
        <>
          <Typography.Title level={4}>Quyền theo tính năng</Typography.Title>
          <Typography.Paragraph type='secondary'>
            Quyền xem bắt buộc được chọn cùng quyền thao tác. Bỏ quyền thao tác trước khi bỏ quyền
            xem.
          </Typography.Paragraph>
          {[...groups].map(([group, entries]) => (
            <fieldset key={group} className='m-0 mb-4 border-0 p-0'>
              <legend className='mb-2 font-semibold'>{group}</legend>
              <Flex vertical gap={12}>
                {entries.map(entry => (
                  <div key={entry.id}>
                    <Checkbox
                      checked={selected.includes(entry.id)}
                      disabled={saving || requiredCodes.has(entry.code)}
                      onChange={event => changePermission(entry, event.target.checked)}
                    >
                      {entry.label}
                    </Checkbox>
                    <div className='pl-6'>
                      <Typography.Text type='secondary'>
                        {entry.description}
                        {entry.requires.length
                          ? `. Yêu cầu: ${entry.requires.map(code => catalog.find(item => item.code === code)!.label).join(", ")}`
                          : ""}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
              </Flex>
            </fieldset>
          ))}
        </>
      )}
      <Flex gap={8} justify='end'>
        <Button onClick={onCancel} disabled={saving}>
          {readOnly ? "Đóng" : "Hủy"}
        </Button>
        {!readOnly && (
          <Button type='primary' htmlType='submit' loading={saving} disabled={stale}>
            {role ? "Lưu vai trò" : "Tạo vai trò"}
          </Button>
        )}
      </Flex>
    </Form>
  );
}
