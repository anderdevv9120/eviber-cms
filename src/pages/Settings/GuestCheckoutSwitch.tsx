import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Switch, Typography } from "antd";
import {
  getCheckoutSettingsAPI,
  updateCheckoutSettingsAPI,
  type CheckoutSettings
} from "@/services/checkout-settings";
import type { ApiResponse } from "@/services/auth";
import { getErrorMessage } from "@/utils/getErrorMessage";

type SettingsView = {
  phase: "reading" | "ready" | "saving" | "error";
  value?: boolean;
  error?: string;
  notice?: string;
  saved?: boolean;
};

function confirmedValue(response: ApiResponse<CheckoutSettings>): boolean {
  if (typeof response?.data?.allowGuestCheckout !== "boolean")
    throw new Error("Không nhận được cài đặt mua hàng hợp lệ. Vui lòng thử lại.");
  return response.data.allowGuestCheckout;
}

export default function GuestCheckoutSwitch() {
  const [view, setView] = useState<SettingsView>({ phase: "reading" });
  const request = useRef<AbortController | null>(null);
  const saving = useRef(false);

  // Shared by initial network synchronization, explicit retry and save recovery.
  const read = useCallback((notice?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () => !controller.signal.aborted && request.current === controller;
    return getCheckoutSettingsAPI(controller.signal)
      .then(response => {
        if (!current()) return;
        setView({ phase: "ready", value: confirmedValue(response), notice });
      })
      .catch(cause => {
        if (current()) setView({ phase: "error", error: getErrorMessage(cause), notice });
      });
  }, []);

  useEffect(() => {
    read().catch(() => {
      // Active read failures are displayed inline.
    });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [read]);

  const retry = async () => {
    if (saving.current || view.phase !== "error") return;
    setView({ phase: "reading", notice: view.notice });
    await read(view.notice);
  };

  const save = async (allowGuestCheckout: boolean) => {
    if (saving.current || view.phase !== "ready" || view.value === undefined) return;
    const controller = request.current;
    if (!controller || controller.signal.aborted) return;
    const current = () => !controller.signal.aborted && request.current === controller;
    saving.current = true;
    setView({ phase: "saving", value: view.value });
    try {
      const response = await updateCheckoutSettingsAPI({ allowGuestCheckout });
      if (!current()) return;
      setView({ phase: "ready", value: confirmedValue(response), saved: true });
    } catch (cause) {
      if (!current()) return;
      const notice = `Chưa xác nhận được lần lưu: ${getErrorMessage(cause)}`;
      setView({ phase: "reading", notice });
      await read(notice);
    } finally {
      saving.current = false;
    }
  };

  return (
    <section aria-label='Cài đặt mua hàng' className='mb-4'>
      <Flex align='center' gap={12} wrap>
        <Typography.Text id='guest-checkout-label'>
          Cho phép mua hàng không cần đăng nhập
        </Typography.Text>
        <Switch
          aria-labelledby='guest-checkout-label'
          aria-describedby='guest-checkout-description guest-checkout-state'
          checked={view.value === true}
          checkedChildren='Bật'
          unCheckedChildren={view.value === undefined ? "?" : "Tắt"}
          disabled={view.phase !== "ready"}
          loading={view.phase === "reading" || view.phase === "saving"}
          onChange={save}
        />
        <Typography.Text id='guest-checkout-state' aria-live='polite'>
          {view.value === undefined
            ? "Chưa xác nhận"
            : view.phase === "saving"
              ? "Đang lưu…"
              : view.value
                ? "Đang bật"
                : "Đang tắt"}
        </Typography.Text>
      </Flex>
      <Typography.Paragraph id='guest-checkout-description' type='secondary'>
        Khi tắt, khách cần đăng nhập để mua hàng mới. Các đơn hàng không cần đăng nhập đã có vẫn
        được giữ nguyên.
      </Typography.Paragraph>
      {view.notice && <Alert type='warning' showIcon title={view.notice} className='mb-2' />}
      {view.error && (
        <Alert
          type='error'
          showIcon
          title={view.error}
          action={<Button onClick={retry}>Thử lại cài đặt</Button>}
        />
      )}
      {view.saved && <Typography.Text role='status'>Đã lưu cài đặt.</Typography.Text>}
    </section>
  );
}
