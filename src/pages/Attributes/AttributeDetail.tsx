import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App, Button, Flex, Modal, Spin, Typography } from "antd";
import { Link, useParams } from "react-router";
import { PATH } from "@/constants/paths";
import {
  createAttributeValueAPI,
  deleteAttributeValueAPI,
  getAttributeValuesAPI,
  saveAttributeOrderAPI,
  updateAttributeValueAPI
} from "@/services/attributes";
import type {
  AttributeValuesResult,
  AttributeValueSummary,
  CreateAttributeValueInput
} from "@/services/attributes";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import AttributeValueForm from "./AttributeValueForm";
import AttributeValuesTable from "./AttributeValuesTable";
import useOrderDraft from "@/hooks/useOrderDraft";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";

export default function AttributeDetail() {
  const { attributeId } = useParams();
  if (!attributeId) throw new Error("Missing attribute route parameter");
  return (
    <App component={false}>
      <DetailContent key={attributeId} attributeId={attributeId} />
    </App>
  );
}
function DetailContent({ attributeId }: { attributeId: string }) {
  const [result, setResult] = useState<AttributeValuesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [orderConflict, setOrderConflict] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<AttributeValueSummary | undefined>();
  const editingId = editingValue?._id;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const discardRequested = useRef(false);
  const draft = useOrderDraft(
    result ? result.values.map(value => value._id) : [],
    result ? result.revision : 0
  );
  useUnsavedOrderWarning(draft.dirty && !refreshRequired);
  const busy = loading || saving || refreshRequired || !!loadError || unavailable || !result;
  const writesDisabled = busy || draft.dirty;
  const editing = editingId ? result?.values.find(value => value._id === editingId) : undefined;
  const deleting = deletingId ? result?.values.find(value => value._id === deletingId) : undefined;
  const used = deleting && (deleting.productUsageCount > 0 || deleting.variantUsageCount > 0);
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return getAttributeValuesAPI(attributeId, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return null;
        if (
          !data ||
          !data.attribute ||
          !Array.isArray(data.values) ||
          data.attribute._id !== attributeId ||
          data.revision !== data.attribute.revision
        )
          throw new Error("Không nhận được chi tiết thuộc tính hợp lệ. Vui lòng thử lại.");
        setResult(data);
        setUnavailable(false);
        setRefreshRequired(false);
        setOrderConflict(false);
        return data;
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          const missing = cause instanceof ApiError && cause.status === 404;
          setUnavailable(missing);
          setLoadError(missing ? "Thuộc tính không còn khả dụng." : getErrorMessage(cause));
        }
        return null;
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [attributeId]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, [load]);
  const reload = () => {
    setLoading(true);
    setLoadError(null);
    return load();
  };
  const saved = async (message: string) => {
    if (!active.current) return;
    setRefreshRequired(true);
    setActionError(null);
    successNotification(message);
    await reload();
  };
  const submitValue = async (input: CreateAttributeValueInput) => {
    if (writesDisabled || savingRef.current || (editingId && !editing)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (editingId) await updateAttributeValueAPI(attributeId, editingId, input);
      else await createAttributeValueAPI(attributeId, input);
      if (!active.current) return;
      setFormOpen(false);
      setEditingValue(undefined);
      await saved("Đã lưu giá trị");
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        await reload();
        cause.message =
          "Dữ liệu đã thay đổi. Đã yêu cầu tải lại; kiểm tra dữ liệu hiện tại rồi lưu lại giá trị đã nhập.";
        throw cause;
      }
      throw cause;
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };
  const saveOrder = async () => {
    if (busy || orderConflict || !draft.dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await saveAttributeOrderAPI(attributeId, {
        valueIds: [...draft.valueIds],
        expectedRevision: draft.expectedRevision
      });
      await saved("Đã lưu thứ tự");
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && cause.status === 409) {
        setOrderConflict(true);
        setActionError(
          "Thứ tự đã thay đổi. Chọn Hủy thay đổi để bỏ bản nháp và tải lại dữ liệu hiện tại."
        );
      } else if (cause instanceof ApiError && cause.status === 404) await reload();
      else setActionError(getErrorMessage(cause));
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!result || !deleting || used || writesDisabled || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await deleteAttributeValueAPI(attributeId, deleting._id, result.revision);
      if (!active.current) return;
      setDeletingId(null);
      await saved("Đã xóa giá trị");
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        await reload();
        setActionError(
          "Dữ liệu đã thay đổi hoặc giá trị đang được sử dụng. Kiểm tra dữ liệu hiện tại trước khi xác nhận lại."
        );
      } else setActionError(getErrorMessage(cause));
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };
  const byId = new Map(result?.values.map(value => [value._id, value]));
  const orderedValues = draft.valueIds.map(id => {
    const value = byId.get(id);
    if (!value) throw new Error("Order draft contains an unknown value");
    return value;
  });
  const retry = async () => {
    const fresh = await reload();
    if (fresh && discardRequested.current) {
      draft.discard();
      discardRequested.current = false;
    }
  };
  return (
    <section className='min-w-0'>
      <Link to={PATH.ATTRIBUTES}>Về danh sách thuộc tính</Link>
      {refreshRequired && (
        <Alert
          className='mt-4'
          type='warning'
          showIcon
          title='Đã lưu thay đổi nhưng chưa tải được dữ liệu mới. Tải lại trước khi thực hiện thay đổi tiếp theo.'
        />
      )}
      {loadError && (
        <Alert
          className='mt-4'
          type='error'
          showIcon
          title={loadError}
          action={
            <Button disabled={loading || saving} onClick={retry}>
              Thử lại
            </Button>
          }
        />
      )}
      {actionError && <Alert className='mt-4' type='warning' showIcon title={actionError} />}
      {loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải giá trị' />
        </Flex>
      )}
      {result && !unavailable && (
        <>
          <Typography.Title level={2}>{result.attribute.name}</Typography.Title>
          <p className='mb-4'>
            Mã: <Typography.Text code>{result.attribute.code}</Typography.Text>
          </p>
          <Flex gap={8} className='mb-4'>
            <Button
              type='primary'
              disabled={writesDisabled}
              onClick={() => {
                setEditingValue(undefined);
                setFormOpen(true);
              }}
            >
              Thêm giá trị
            </Button>
            <Button
              disabled={busy || orderConflict || !draft.dirty}
              loading={saving}
              onClick={() => void saveOrder()}
            >
              Lưu thứ tự
            </Button>
            <Button
              disabled={loading || saving || refreshRequired || !draft.dirty}
              onClick={() => {
                setActionError(null);
                if (orderConflict || loadError) {
                  discardRequested.current = true;
                  void retry();
                } else draft.discard();
              }}
            >
              Hủy thay đổi
            </Button>
          </Flex>
          <AttributeValuesTable
            values={orderedValues}
            disabled={busy || orderConflict || formOpen || !!deletingId}
            mutationsDisabled={writesDisabled}
            onMove={draft.move}
            onMoveTo={draft.moveTo}
            onEdit={value => {
              setEditingValue(value);
              setFormOpen(true);
            }}
            onDelete={value => {
              setActionError(null);
              setDeletingId(value._id);
            }}
          />
        </>
      )}
      <Modal
        open={formOpen}
        title={editingId ? "Sửa giá trị" : "Thêm giá trị"}
        footer={null}
        destroyOnHidden
        closable={!saving}
        mask={{ closable: !saving }}
        onCancel={() => {
          if (!saving) setFormOpen(false);
        }}
      >
        {loadError && (
          <Alert
            className='mb-4'
            type='error'
            title={loadError}
            action={
              <Button disabled={saving || loading} onClick={retry}>
                Tải lại dữ liệu
              </Button>
            }
          />
        )}
        {editingId && !editing && !loading && (
          <Alert
            className='mb-4'
            type='warning'
            title='Giá trị không còn khả dụng. Đóng biểu mẫu và kiểm tra danh sách hiện tại.'
          />
        )}
        <AttributeValueForm
          key={editingId ?? "create"}
          value={editingValue}
          expectedRevision={result ? result.revision : 0}
          disabled={writesDisabled || (!!editingId && !editing)}
          onSubmit={submitValue}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
      <Modal
        open={!!deleting && !unavailable}
        title={used ? "Không thể xóa giá trị" : "Xóa giá trị"}
        onCancel={() => {
          if (!saving) setDeletingId(null);
        }}
        closable={!saving}
        mask={{ closable: !saving }}
        onOk={() => void confirmDelete()}
        okText='Xóa'
        cancelText='Hủy'
        confirmLoading={saving}
        okButtonProps={{ danger: true, disabled: writesDisabled }}
        footer={used ? <Button onClick={() => setDeletingId(null)}>Đóng</Button> : undefined}
      >
        {deleting &&
          (used ? (
            <Alert
              type='warning'
              showIcon
              title={`Không thể xóa “${deleting.value}”: đang được sử dụng bởi ${deleting.productUsageCount} sản phẩm và ${deleting.variantUsageCount} biến thể.`}
            />
          ) : (
            <p>{`Xóa giá trị “${deleting.value}”? Máy chủ sẽ kiểm tra lại các tham chiếu trước khi xóa.`}</p>
          ))}
        {actionError && <Alert type='warning' className='mt-4' title={actionError} />}
      </Modal>
    </section>
  );
}
