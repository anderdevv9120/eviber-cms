import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Flex, Spin, Typography } from "antd";
import type { ApiResponse } from "@/services/auth";
import { getNotificationScope } from "@/services/notifications";
import { useAppStore } from "@/store/useAppStore";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";

export default function useNotificationSettings<T>({
  scope,
  access,
  load,
  save
}: {
  scope: string;
  access: string;
  load: (signal?: AbortSignal) => Promise<ApiResponse<T>>;
  save: (draft: T, saved: T) => Promise<ApiResponse<T>>;
}) {
  const [values, setValues] = useState<{ saved: T; draft: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const active = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const { modal } = App.useApp();
  const dirty = !!values && JSON.stringify(values.saved) !== JSON.stringify(values.draft);
  useUnsavedOrderWarning(dirty || saving, {
    title: "Cài đặt thông báo chưa được lưu",
    content: "Rời trang sẽ bỏ các thay đổi chưa lưu. Nếu đang lưu, hãy tải lại để kiểm tra kết quả."
  });
  const current = () =>
    !!active.current &&
    !active.current.signal.aborted &&
    getNotificationScope()?.key === scope &&
    JSON.stringify(useAppStore.getState().profile?.access) === access;

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const valid = () =>
      !controller.signal.aborted &&
      getNotificationScope()?.key === scope &&
      JSON.stringify(useAppStore.getState().profile?.access) === access;
    load(controller.signal)
      .then(({ data }) => {
        if (valid()) setValues({ saved: data, draft: data });
      })
      .catch(cause => {
        if (valid()) setError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [scope, access, load, attempt]);

  const reload = () => {
    if (!current() || pending.current) return;
    const run = () => {
      if (!current()) return;
      setValues(null);
      setError(null);
      setBlocked(false);
      setStatus("");
      setAttempt(value => value + 1);
    };
    if (dirty)
      modal.confirm({
        title: "Bỏ thay đổi chưa lưu?",
        content: "Tải lại giá trị hiện tại từ máy chủ.",
        okText: "Bỏ thay đổi và tải lại",
        cancelText: "Ở lại",
        onOk: run
      });
    else run();
  };
  const submit = async () => {
    if (!values || !dirty || pending.current || blocked || !current()) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    setStatus("");
    try {
      const { data } = await save(values.draft, values.saved);
      if (!current()) return;
      setValues({ saved: data, draft: data });
      setStatus("Đã lưu cài đặt thông báo");
      successNotification("Đã lưu cài đặt thông báo");
    } catch (cause) {
      if (!current()) return;
      const conflict = cause instanceof ApiError && cause.status === 409;
      const uncertain = !(cause instanceof ApiError) || !cause.status || cause.status >= 500;
      setBlocked(conflict || uncertain || (cause instanceof ApiError && cause.status === 403));
      setError(
        conflict
          ? "Cài đặt hoặc chính sách đã thay đổi. Tải lại từ máy chủ trước khi lưu tiếp."
          : uncertain
            ? "Chưa xác định được kết quả lưu. Tải lại từ máy chủ để kiểm tra trước khi lưu tiếp."
            : getErrorMessage(cause)
      );
    } finally {
      pending.current = false;
      if (current()) setSaving(false);
    }
  };
  return {
    values,
    saving,
    blocked,
    dirty,
    setDraft: (draft: T) => {
      if (current() && values && !pending.current) {
        setValues({ ...values, draft });
        setStatus("");
      }
    },
    submit,
    feedback: (
      <Flex vertical gap={12}>
        {error && (
          <Alert
            type={blocked ? "warning" : "error"}
            showIcon
            title={error}
            action={
              <Button disabled={saving} onClick={reload}>
                Tải lại từ máy chủ
              </Button>
            }
          />
        )}
        {!values && !error && <Spin aria-label='Đang tải cài đặt thông báo' />}
        {status && <Typography.Text role='status'>{status}</Typography.Text>}
      </Flex>
    )
  };
}
