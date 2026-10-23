import { useEffect, useState } from "react";
import type { FormInstance } from "antd";
import type { ApiResponse } from "@/services/auth";
import type { Revisioned } from "@/services/storeContent";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import { SAVED_MESSAGE } from "./rules";

interface Options<T> {
  form: FormInstance<T>;
  load: (signal: AbortSignal) => Promise<ApiResponse<Revisioned<T>>>;
  save: (input: Revisioned<T>) => Promise<ApiResponse<Revisioned<T>>>;
  onLoaded?: (data: Revisioned<T>) => void;
}

// setFieldsValue gộp sâu: key tuỳ chọn mà bản server đã bỏ (vd brandStory.titleAccent) sẽ giữ giá trị
// cũ. Xoá trắng từng nhóm cấp ngoài cùng trước rồi mới nạp bản server.
function replaceFormValues<T>(form: FormInstance<T>, data: Revisioned<T>) {
  const stored = form.getFieldsValue(true) as Record<string, unknown>;
  const cleared = Object.fromEntries(Object.keys(stored).map(key => [key, undefined]));
  form.setFieldsValue(cleared as Parameters<typeof form.setFieldsValue>[0]);
  form.setFieldsValue(data as Parameters<typeof form.setFieldsValue>[0]);
}

export default function useRevisionedSettings<T extends object>({
  form,
  load,
  save,
  onLoaded
}: Options<T>) {
  const [settings, setSettings] = useState<Revisioned<T> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        // The form store outlives the remount; initialValues alone would let the old draft win
        replaceFormValues(form, data);
        setSettings(data);
        onLoaded?.(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
    // load/onLoaded are module-level or stable per page; reloading is driven by attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, form]);

  // Bỏ bản nháp: tải lại bản mới nhất và dựng lại form từ đầu
  const reload = () => {
    setSettings(null);
    setLoadError(null);
    setSaveError(null);
    setConflict(false);
    setAttempt(value => value + 1);
  };

  const submit = async (values: T) => {
    if (!settings || saving || conflict) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await save({ ...values, revision: settings.revision });
      setSettings(data);
      replaceFormValues(form, data);
      onLoaded?.(data);
      successNotification(SAVED_MESSAGE);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
      else setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return { settings, loadError, saving, saveError, setSaveError, conflict, reload, submit };
}
