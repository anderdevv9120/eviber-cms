import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Modal, Spin, Tag, Typography } from "antd";
import DataTable from "@/components/DataTable";
import {
  addCustomerAddressAPI,
  deleteCustomerAddressAPI,
  getCustomerAddressesAPI,
  updateCustomerAddressAPI,
  type CustomerAddress,
  type CustomerAddressInput
} from "@/services/customers";
import { getErrorMessage } from "@/utils/getErrorMessage";
import CustomerAddressForm from "./CustomerAddressForm";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { ApiError } from "@/utils/request";

export default function CustomerAddresses({ customerId }: { customerId: string }) {
  return <AddressBook key={customerId} customerId={customerId} />;
}

function AddressBook({ customerId }: { customerId: string }) {
  const profile = useAppStore(state => state.profile);
  const canUpdate = !!profile && canAccess(profile, { anyOf: ["CUSTOMER_UPDATE"] });
  const [view, setView] = useState<{ addresses?: CustomerAddress[]; error?: string }>({});
  const [editing, setEditing] = useState<CustomerAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomerAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const openEdit = (next: CustomerAddress | "new") => {
    const current = useAppStore.getState().profile;
    if (current && canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] })) setEditing(next);
  };
  const openDelete = (next: CustomerAddress) => {
    const current = useAppStore.getState().profile;
    if (current && canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] })) {
      setDeleteError(undefined);
      setDeleting(next);
    }
  };
  // Stable callback is shared by initial network synchronization and mutation recovery.
  const reload = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return getCustomerAddressesAPI(customerId, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data) || data.some(address => !address?._id))
          throw new Error("Không nhận được sổ địa chỉ hợp lệ");
        setView({ addresses: data });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setView({ error: getErrorMessage(cause) });
      });
  }, [customerId]);
  useEffect(() => {
    mounted.current = true;
    reload().catch(() => {
      /* Read failures are displayed inline. */
    });
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, [reload]);
  const blocked = !canUpdate || saving || !view.addresses;
  const retry = () => {
    setView({});
    reload().catch(() => {
      /* Read failures are displayed inline. */
    });
  };
  const mutate = async (write: () => Promise<unknown>) => {
    const current = useAppStore.getState().profile;
    if (
      !current ||
      !canAccess(current, { anyOf: ["CUSTOMER_UPDATE"] }) ||
      inFlight.current ||
      !view.addresses
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      try {
        await write();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 403) throw cause;
        if (mounted.current)
          setNotice(
            `${getErrorMessage(cause)}. Kết quả lưu chưa được xác nhận; kiểm tra sổ địa chỉ đã tải lại trước khi thao tác tiếp.`
          );
      }
      if (mounted.current) {
        setEditing(null);
        setDeleting(null);
        setView({});
        // Backend owns primary selection; every write is followed by a fresh book read.
        await reload();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const save = async (input: CustomerAddressInput) => {
    if (!editing || (editing === "new" && (view.addresses?.length ?? 10) >= 10)) return;
    await mutate(async () => {
      if (editing === "new") {
        const { data } = await addCustomerAddressAPI(customerId, input);
        if (!Array.isArray(data)) throw new Error("Chưa xác nhận được kết quả thêm địa chỉ");
      } else {
        const { data } = await updateCustomerAddressAPI(customerId, editing._id, input);
        if (data?._id !== editing._id) throw new Error("Chưa xác nhận được kết quả sửa địa chỉ");
      }
    });
  };
  const remove = async () => {
    if (!deleting) return;
    setDeleteError(undefined);
    try {
      await mutate(async () => {
        const { data } = await deleteCustomerAddressAPI(customerId, deleting._id);
        if (data?.success !== true) throw new Error("Chưa xác nhận được kết quả xóa địa chỉ");
      });
    } catch (cause) {
      if (mounted.current) setDeleteError(getErrorMessage(cause));
    }
  };
  return (
    <section aria-label='Sổ địa chỉ' className='mt-6'>
      <Flex justify='space-between' align='center' gap={8} wrap>
        <Typography.Title level={3}>Sổ địa chỉ</Typography.Title>
        <Flex gap={8}>
          <Button disabled={saving || (!view.addresses && !view.error)} onClick={retry}>
            Tải lại địa chỉ
          </Button>
          <Button
            disabled={blocked || (view.addresses?.length ?? 10) >= 10}
            onClick={() => openEdit("new")}
          >
            Thêm địa chỉ
          </Button>
        </Flex>
      </Flex>
      {notice && <Alert type='warning' showIcon title={notice} className='mb-4' />}
      {(view.addresses?.length ?? 0) >= 10 && (
        <Alert type='info' title='Đã đạt giới hạn 10 địa chỉ.' className='mb-4' />
      )}
      {!view.addresses && !view.error && <Spin aria-label='Đang tải sổ địa chỉ' />}
      {view.error && (
        <Alert
          type='error'
          showIcon
          title={view.error}
          action={<Button onClick={retry}>Thử lại</Button>}
        />
      )}
      {view.addresses && (
        <DataTable<CustomerAddress>
          rowKey='_id'
          dataSource={view.addresses}
          pagination={false}
          locale={{ emptyText: "Chưa có địa chỉ" }}
          columns={[
            { title: "Người nhận", dataIndex: "name" },
            {
              title: "Địa chỉ",
              key: "address",
              render: (_, row) =>
                [row.specificAddress, row.ward, row.district, row.city, row.country, row.zip]
                  .filter(Boolean)
                  .join(", ") || "—"
            },
            { title: "Điện thoại", dataIndex: "phoneNumber" },
            {
              title: "Địa chỉ chính",
              key: "primary",
              render: (_, row) => (row.primary ? <Tag>Địa chỉ chính</Tag> : "—")
            },
            {
              title: "Thao tác",
              key: "actions",
              render: (_, row) => (
                <Flex gap={8}>
                  <Button disabled={blocked} onClick={() => openEdit(row)}>
                    Sửa địa chỉ
                  </Button>
                  <Button danger disabled={blocked} onClick={() => openDelete(row)}>
                    Xóa địa chỉ
                  </Button>
                </Flex>
              )
            }
          ]}
        />
      )}
      {editing && (
        <Modal
          open
          title={editing === "new" ? "Thêm địa chỉ" : "Sửa địa chỉ"}
          footer={null}
          closable={!saving}
          keyboard={!saving}
          mask={{ closable: !saving }}
          onCancel={() => {
            if (!inFlight.current) setEditing(null);
          }}
        >
          <CustomerAddressForm
            key={editing === "new" ? "new" : editing._id}
            address={editing === "new" ? undefined : editing}
            disabled={blocked}
            onSubmit={save}
            onCancel={() => {
              if (!inFlight.current) setEditing(null);
            }}
          />
        </Modal>
      )}
      {deleting && (
        <Modal
          open
          title='Xóa địa chỉ?'
          okText='Xác nhận xóa'
          cancelText='Hủy'
          confirmLoading={saving}
          okButtonProps={{ danger: true, disabled: blocked }}
          cancelButtonProps={{ disabled: saving }}
          closable={!saving}
          keyboard={!saving}
          mask={{ closable: !saving }}
          onOk={remove}
          onCancel={() => {
            if (!inFlight.current) setDeleting(null);
          }}
        >
          {deleteError && <Alert type='error' showIcon title={deleteError} />}
          <p>Xóa địa chỉ của {deleting.name}?</p>
        </Modal>
      )}
    </section>
  );
}
