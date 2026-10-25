import { useAppStore, type Profile } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Input, Modal, Result, Spin, Switch, Typography } from "antd";
import { RichEditor } from "@/components/RichEditor";
import { CONFLICT_MESSAGE, SAVED_MESSAGE } from "@/components/StoreContent/rules";
import { STOREFRONT_URL } from "@/constants/env";
import {
  getPolicyAPI,
  savePolicyAPI,
  type PolicyPage,
  type PolicySlug
} from "@/services/storeContent";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";

// RichEditor phát HTML sau 300 ms kể từ thay đổi cuối — chờ đủ để Save ngay sau khi gõ
// vẫn gửi phím cuối cùng
const EDITOR_SETTLE_MS = 400;
// Toolbar RichEditor rộng ~920px — modal đủ rộng để không phải cuộn ngang
const MODAL_WIDTH = 1040;

interface Props {
  slug: PolicySlug;
  onClose(): void;
  onSaved(): void;
}

const mayUpdate = (profile: Profile | null) =>
  !!profile && canAccess(profile, { anyOf: ["POLICY_UPDATE"] });

export default function PolicyModal({ slug, onClose, onSaved }: Props) {
  const canUpdate = mayUpdate(useAppStore(state => state.profile));
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [htmlDirty, setHtmlDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // HTML mới nhất từ editor; null = editor chưa phát gì (nội dung giữ nguyên)
  const html = useRef<string | null>(null);
  // Editor có nội dung ban đầu tự phát 1 lần sau mount — lần đó là mốc so sánh, không phải sửa
  const awaitingMountEmission = useRef(false);
  const baselineHtml = useRef<string | null>(null);

  // Setters and refs are stable, so this callback never changes
  const applyPage = useCallback((next: PolicyPage) => {
    setPage(next);
    setTitle(next.title);
    setIsPublished(next.isPublished);
    setHtmlDirty(false);
    html.current = null;
    baselineHtml.current = null;
    awaitingMountEmission.current = !!next.contentHtml;
    setEditorKey(value => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getPolicyAPI(slug, controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) applyPage(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [slug, attempt, applyPage]);

  const onEditorChange = (next: string) => {
    html.current = next;
    if (awaitingMountEmission.current) {
      awaitingMountEmission.current = false;
      baselineHtml.current = next;
      return;
    }
    setHtmlDirty(next !== baselineHtml.current);
  };

  const dirty = !!page && (title !== page.title || isPublished !== page.isPublished || htmlDirty);

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm("Bỏ các thay đổi chưa lưu?")) return;
    onClose();
  };

  const reload = () => {
    setPage(null);
    setLoadError(null);
    setSaveError(null);
    setConflict(false);
    setAttempt(value => value + 1);
  };

  const save = async () => {
    if (!mayUpdate(useAppStore.getState().profile) || !page || saving || conflict) return;
    setSaving(true);
    setSaveError(null);
    await new Promise(resolve => setTimeout(resolve, EDITOR_SETTLE_MS));
    try {
      if (!mayUpdate(useAppStore.getState().profile)) return;
      const { data } = await savePolicyAPI(slug, {
        title: title.trim(),
        contentHtml: html.current ?? page.contentHtml,
        isPublished,
        revision: page.revision
      });
      applyPage(data);
      onSaved();
      successNotification(SAVED_MESSAGE);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
      else setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      width={MODAL_WIDTH}
      title={page ? `${canUpdate ? "Sửa" : "Xem"}: ${page.title}` : "Trang chính sách"}
      onCancel={close}
      footer={[
        <Button key='cancel' onClick={close} disabled={saving}>
          Hủy
        </Button>,
        <Button
          key='save'
          type='primary'
          loading={saving}
          disabled={!canUpdate || !page || conflict || !title.trim()}
          onClick={save}
        >
          Lưu
        </Button>
      ]}
    >
      {loadError ? (
        <Result
          status='error'
          title='Không tải được trang'
          subTitle={loadError}
          extra={<Button onClick={reload}>Thử lại</Button>}
        />
      ) : !page ? (
        <Flex justify='center' className='py-16'>
          <Spin />
        </Flex>
      ) : (
        <Flex vertical gap={16}>
          {conflict && (
            <Alert
              type='warning'
              showIcon
              title={CONFLICT_MESSAGE}
              action={
                <Button size='small' onClick={reload}>
                  Tải lại
                </Button>
              }
            />
          )}
          {saveError && <Alert type='error' showIcon title={saveError} />}
          <label>
            <Typography.Text strong>Tiêu đề</Typography.Text>
            <Input
              aria-label='Tiêu đề'
              value={title}
              maxLength={120}
              disabled={saving || !canUpdate}
              onChange={event => setTitle(event.target.value)}
            />
          </label>
          <Flex align='center' gap={8}>
            <Switch
              aria-label='Xuất bản'
              checked={isPublished}
              disabled={saving || !canUpdate}
              onChange={setIsPublished}
            />
            <Typography.Text>Xuất bản</Typography.Text>
            {page.isPublished && STOREFRONT_URL && (
              <a href={`${STOREFRONT_URL}/chinh-sach/${slug}`} target='_blank' rel='noreferrer'>
                Xem trên cửa hàng
              </a>
            )}
          </Flex>
          {/* Khóa editor khi đang lưu — lưu xong editor mount lại với HTML server, phím gõ thêm sẽ mất */}
          <div inert={saving || !canUpdate} aria-busy={saving}>
            <RichEditor key={editorKey} initialHtml={page.contentHtml} onChange={onEditorChange} />
          </div>
        </Flex>
      )}
    </Modal>
  );
}
