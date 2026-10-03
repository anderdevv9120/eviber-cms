import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Table,
  Tooltip,
  Typography
} from "antd";
import type { TableProps } from "antd";
import { generatePath, Link, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import {
  createAttributeAPI,
  deleteAttributeAPI,
  getAttributeAPI,
  listAttributesAPI,
  updateAttributeAPI
} from "@/services/attributes";
import type {
  AttributeListResult,
  AttributeSummary,
  CreateAttributeInput,
  UpdateAttributeInput
} from "@/services/attributes";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import AttributeForm from "./AttributeForm";

const detailPath = (attributeId: string) => generatePath(PATH.ATTRIBUTE_DETAIL, { attributeId });
interface ListState {
  key: string;
  result: AttributeListResult | null;
  loading: boolean;
  error: string | null;
}

export default function Attributes() {
  const navigate = useNavigate();
  const [query, setQuery] = useState({ page: 1, pageSize: 10, search: "" });
  const queryKey = JSON.stringify(query);
  const [state, setState] = useState<ListState>({
    key: queryKey,
    result: null,
    loading: true,
    error: null
  });
  const request = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeSummary | undefined>();
  const [deleting, setDeleting] = useState<AttributeSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [editRevisionReady, setEditRevisionReady] = useState(true);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const loading = state.loading || state.key !== queryKey;
  const result = state.key === queryKey ? state.result : null;
  const writesDisabled = loading || saving || refreshRequired || !editRevisionReady || !result;

  const fetchList = useCallback(() => {
    request.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++request.current.sequence;
    request.current.controller = controller;
    const key = JSON.stringify(query);
    return listAttributesAPI(query, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted || sequence !== request.current.sequence) return null;
        if (!data || !Array.isArray(data.data))
          throw new Error("Không nhận được danh sách thuộc tính hợp lệ. Vui lòng thử lại.");
        setState({ key, result: data, loading: false, error: null });
        setRefreshRequired(false);
        setDeleting(previous =>
          previous ? (data.data.find(row => row._id === previous._id) ?? null) : null
        );
        return data;
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && sequence === request.current.sequence) {
          setState({ key, result: null, loading: false, error: getErrorMessage(cause) });
        }
        return null;
      });
  }, [query]);
  const reload = async (refreshEdit = true) => {
    setState({ key: queryKey, result: null, loading: true, error: null });
    const fresh = await fetchList();
    if (fresh && editing && formOpen && refreshEdit) {
      try {
        const current =
          fresh.data.find(row => row._id === editing._id) ??
          (await getAttributeAPI(editing._id)).data;
        setEditing(current);
        setEditRevisionReady(true);
      } catch (cause) {
        setState({ key: queryKey, result: null, loading: false, error: getErrorMessage(cause) });
        return null;
      }
    } else if (fresh) setEditRevisionReady(true);
    return fresh;
  };
  useEffect(() => {
    const activeRequest = request.current;
    void fetchList();
    return () => {
      activeRequest.controller?.abort();
      activeRequest.sequence++;
    };
  }, [fetchList]);

  const submit = async (input: CreateAttributeInput | UpdateAttributeInput) => {
    if (savingRef.current || writesDisabled) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let saved: AttributeSummary;
      if ("code" in input) {
        saved = (await createAttributeAPI(input)).data;
        setCreatedId(saved._id);
      } else {
        if (!editing) throw new Error("Missing attribute for rename");
        try {
          saved = (await updateAttributeAPI(editing._id, input)).data;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 409) {
            setEditRevisionReady(false);
            await reload();
            cause.message =
              "Dữ liệu đã thay đổi. Đã yêu cầu tải lại; kiểm tra dữ liệu hiện tại rồi lưu lại tên đã nhập.";
            throw cause;
          }
          throw cause;
        }
      }
      setFormOpen(false);
      setEditing(undefined);
      setActionError(null);
      if (!("code" in input)) setCreatedId(null);
      setRefreshRequired(true);
      successNotification("Đã lưu thuộc tính");
      const refreshed = await reload(false);
      if (refreshed && "code" in input) navigate(detailPath(saved._id));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (
      !deleting ||
      writesDisabled ||
      savingRef.current ||
      deleting.productUsageCount ||
      deleting.variantUsageCount
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await deleteAttributeAPI(deleting._id, deleting.revision);
      setDeleting(null);
      setCreatedId(null);
      setRefreshRequired(true);
      successNotification("Đã xóa thuộc tính");
      await reload();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        await reload();
        setActionError(
          cause.status === 404
            ? "Thuộc tính không còn khả dụng. Đã yêu cầu tải lại danh sách."
            : "Dữ liệu đã thay đổi hoặc thuộc tính đang được sử dụng. Đã yêu cầu tải lại; kiểm tra số sản phẩm và biến thể trước khi xác nhận lại."
        );
      } else setActionError(getErrorMessage(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const columns: TableProps<AttributeSummary>["columns"] = [
    {
      title: "Tên thuộc tính",
      dataIndex: "name",
      render: (name: string, row) => <Link to={detailPath(row._id)}>{name}</Link>
    },
    { title: "Mã", dataIndex: "code" },
    { title: "Số giá trị", dataIndex: "valueCount" },
    { title: "Sản phẩm sử dụng", dataIndex: "productUsageCount" },
    { title: "Biến thể sử dụng", dataIndex: "variantUsageCount" },
    {
      title: "Thao tác",
      render: (_, row) => (
        <Flex gap={8} wrap>
          <Tooltip title={`Quản lý giá trị ${row.name}`}>
            <Link to={detailPath(row._id)} aria-label={`Quản lý giá trị ${row.name}`}>
              Quản lý giá trị
            </Link>
          </Tooltip>
          <Tooltip title={`Sửa ${row.name}`}>
            <Button
              disabled={writesDisabled}
              aria-label={`Sửa ${row.name}`}
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
            >
              Sửa
            </Button>
          </Tooltip>
          <Tooltip title={`Xóa ${row.name}`}>
            <Button
              danger
              disabled={writesDisabled}
              aria-label={`Xóa ${row.name}`}
              onClick={() => {
                setActionError(null);
                setDeleting(row);
              }}
            >
              Xóa
            </Button>
          </Tooltip>
        </Flex>
      )
    }
  ];
  const used = deleting && (deleting.productUsageCount > 0 || deleting.variantUsageCount > 0);
  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center' gap={12} wrap className='mb-4'>
        <Typography.Title level={2} className='m-0!'>
          Thuộc tính
        </Typography.Title>
        <Button
          type='primary'
          disabled={writesDisabled}
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          Thêm thuộc tính
        </Button>
      </Flex>
      <Flex gap={12} wrap className='mb-4'>
        <Input
          aria-label='Tìm thuộc tính'
          placeholder='Tìm theo tên hoặc mã'
          allowClear
          disabled={saving}
          value={query.search}
          onChange={event =>
            setQuery(previous => ({ ...previous, search: event.target.value, page: 1 }))
          }
          className='max-w-sm'
        />
        <Select
          aria-label='Số thuộc tính mỗi trang'
          value={query.pageSize}
          disabled={saving}
          style={{ minWidth: 130 }}
          options={[10, 20, 50].map(size => ({ value: size, label: `${size} / trang` }))}
          onChange={pageSize => setQuery(previous => ({ ...previous, pageSize, page: 1 }))}
        />
      </Flex>
      {refreshRequired && !loading && (
        <Alert
          type='warning'
          showIcon
          className='mb-4'
          title='Đã lưu thay đổi nhưng chưa tải được dữ liệu mới. Tải lại trước khi thực hiện thay đổi tiếp theo.'
          description={
            createdId ? <Link to={detailPath(createdId)}>Mở thuộc tính vừa tạo</Link> : undefined
          }
        />
      )}
      {actionError && <Alert type='warning' showIcon className='mb-4' title={actionError} />}
      {loading ? (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải thuộc tính' />
        </Flex>
      ) : state.error ? (
        <Alert
          type='error'
          showIcon
          title={state.error}
          action={<Button onClick={() => void reload()}>Thử lại</Button>}
        />
      ) : (
        result && (
          <>
            <Table<AttributeSummary>
              rowKey='_id'
              columns={columns}
              dataSource={result.data}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: "Chưa có thuộc tính" }}
            />
            <Pagination
              className='mt-4'
              current={query.page}
              pageSize={query.pageSize}
              total={result.total}
              showSizeChanger={false}
              disabled={saving}
              onChange={page => setQuery(previous => ({ ...previous, page }))}
            />
          </>
        )
      )}
      <Modal
        open={formOpen}
        title={editing ? "Sửa tên thuộc tính" : "Thêm thuộc tính"}
        footer={null}
        onCancel={() => {
          if (!saving) setFormOpen(false);
        }}
        closable={!saving}
        mask={{ closable: !saving }}
        destroyOnHidden
      >
        {state.error && (
          <Alert
            className='mb-4'
            type='error'
            title={state.error}
            action={
              <Button disabled={saving} onClick={() => void reload()}>
                Thử lại
              </Button>
            }
          />
        )}
        <AttributeForm
          key={editing?._id ?? "create"}
          attribute={editing}
          disabled={writesDisabled}
          onSubmit={submit}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
      <Modal
        open={!!deleting}
        title={used ? "Không thể xóa thuộc tính" : "Xóa thuộc tính"}
        onCancel={() => {
          if (!saving) setDeleting(null);
        }}
        closable={!saving}
        mask={{ closable: !saving }}
        onOk={() => void confirmDelete()}
        okText='Xóa'
        cancelText='Hủy'
        confirmLoading={saving}
        okButtonProps={{ danger: true, disabled: writesDisabled }}
        footer={used ? <Button onClick={() => setDeleting(null)}>Đóng</Button> : undefined}
      >
        {deleting &&
          (used ? (
            <Alert
              type='warning'
              showIcon
              title={`Không thể xóa “${deleting.name}”: đang được sử dụng bởi ${deleting.productUsageCount} sản phẩm và ${deleting.variantUsageCount} biến thể.`}
            />
          ) : (
            <p>{`Xóa thuộc tính “${deleting.name}” và ${deleting.valueCount} giá trị? Máy chủ sẽ kiểm tra lại các tham chiếu trước khi xóa.`}</p>
          ))}
        {actionError && <Alert className='mt-4' type='warning' title={actionError} />}
      </Modal>
    </section>
  );
}
