import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Flex, Form, Input, Result, Spin, Tag, theme, Typography } from "antd";
import {
  getEmailSettingsAPI,
  saveEmailSettingsAPI,
  sendTestEmailAPI,
  type EmailSettings,
  type EmailSettingsStatus
} from "@/services/email-settings";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import GmailGuide from "./GmailGuide";
import InboxPreview from "./InboxPreview";
import SavedGmail from "./SavedGmail";

interface FormValues {
  address: string;
  appPassword: string;
  senderName: string;
}

// = SENDER_NAME_MAX_LENGTH (backend email-settings-admin.dto.ts) — repo tách, không share được
const SENDER_NAME_MAX = 60;
const CONFLICT_MESSAGE = "Cấu hình vừa được người khác thay đổi. Tải lại để xem bản mới nhất.";

const STATUS: Record<EmailSettingsStatus, { color: string; label: string; hint: string }> = {
  configured: {
    color: "success",
    label: "Đã cấu hình",
    hint: "Khách nhận được mail xác nhận đơn, đặt lại mật khẩu và xác thực tài khoản."
  },
  not_configured: {
    color: "default",
    label: "Chưa cấu hình",
    hint: "Chưa gửi được mail. Khách đăng ký không cần xác thực email; quên mật khẩu và hoàn tiền của khách vãng lai hiện hướng dẫn liên hệ shop."
  },
  undecryptable: {
    color: "error",
    label: "Cần nhập lại App Password",
    hint: "App Password đang lưu không giải mã được (khóa bảo mật của máy chủ đã đổi). Đang tạm ngưng gửi mail — nhập lại App Password."
  }
};

type CredentialField = "address" | "appPassword";
const CREDENTIAL_FIELDS: CredentialField[] = ["address", "appPassword"];

type TestOutcome = { kind: "ok"; sentTo: string } | { kind: "error"; message: string };

function testFailure(cause: unknown): TestOutcome {
  if (cause instanceof ApiError && cause.status === 429)
    return { kind: "error", message: "Gửi thử quá nhiều lần, chờ 1 phút rồi thử lại." };
  return { kind: "error", message: getErrorMessage(cause) };
}

export default function EmailSettingsPage() {
  const [form] = Form.useForm<FormValues>();
  const { token } = theme.useToken();
  const adminEmail = useAppStore(state => state.profile?.email);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestOutcome | null>(null);
  const [editingGmail, setEditingGmail] = useState(false);
  // Tải lại (Alert 409) trong lúc gửi thử còn chờ Gmail thì kết quả về muộn thuộc bản cũ — bỏ qua
  const testSeq = useRef(0);

  const invalidateTest = () => {
    testSeq.current += 1;
    setTestResult(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    getEmailSettingsAPI(controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  // Nạp tên người gửi SAU khi Form mount (settings null → Form chưa có); Tải lại giữ store cũ qua unmount
  // nên initialValues không đủ, phải set lại từ bản vừa tải
  useEffect(() => {
    if (settings) form.setFieldsValue({ senderName: settings.senderName ?? "" });
  }, [form, settings]);

  const reload = () => {
    setSettings(null);
    setLoadError(null);
    setSaveError(null);
    setConflict(false);
    invalidateTest();
    setEditingGmail(false);
    form.resetFields(CREDENTIAL_FIELDS);
    setAttempt(value => value + 1);
  };

  const cancelGmailEdit = () => {
    setEditingGmail(false);
    setSaveError(null);
    form.resetFields(CREDENTIAL_FIELDS);
  };

  const save = async () => {
    if (!settings || saving || conflict) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const showGmailInputs = settings.status !== "configured" || editingGmail;
    setSaving(true);
    setSaveError(null);
    invalidateTest();
    try {
      const { data } = await saveEmailSettingsAPI({
        // Không mở ô nhập = không gửi field nào, BE giữ nguyên tài khoản Gmail đang lưu
        ...(showGmailInputs ? { address: values.address, appPassword: values.appPassword } : {}),
        senderName: values.senderName,
        revision: settings.revision
      });
      setSettings(data);
      setEditingGmail(false);
      form.resetFields(CREDENTIAL_FIELDS);
      successNotification("Đã lưu cấu hình email.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
      else setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (testing) return;
    testSeq.current += 1;
    const seq = testSeq.current;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await sendTestEmailAPI();
      if (seq === testSeq.current) setTestResult({ kind: "ok", sentTo: data.sentTo });
    } catch (cause) {
      if (seq === testSeq.current) setTestResult(testFailure(cause));
    } finally {
      setTesting(false);
    }
  };

  if (loadError)
    return (
      <Result
        status='error'
        title='Không tải được cấu hình email'
        subTitle={loadError}
        extra={<Button onClick={reload}>Thử lại</Button>}
      />
    );
  if (!settings)
    return (
      <Flex justify='center' className='py-16'>
        <Spin />
      </Flex>
    );

  const status = STATUS[settings.status];
  const mustEnterGmail = settings.status !== "configured";
  const showGmailInputs = mustEnterGmail || editingGmail;
  // Gửi thử chỉ dùng cấu hình đã lưu — đang nhập tài khoản mới thì lưu trước rồi mới thử
  const canSendTest = !showGmailInputs;

  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={2} className='mb-1!'>
          Email
        </Typography.Title>
        <Typography.Text type='secondary'>
          Gửi mail xác nhận đơn, đặt lại mật khẩu và xác thực tài khoản cho khách bằng Gmail của
          shop.
        </Typography.Text>
      </div>
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
      <Card title='Gửi mail qua Gmail' extra={<Tag color={status.color}>{status.label}</Tag>}>
        <Typography.Paragraph type='secondary'>{status.hint}</Typography.Paragraph>
        {!showGmailInputs && (
          <SavedGmail
            settings={settings}
            disabled={saving || testing}
            onEdit={() => {
              setEditingGmail(true);
              invalidateTest();
            }}
          />
        )}
        <Form<FormValues> form={form} layout='vertical' disabled={saving}>
          {showGmailInputs && (
            <section
              aria-label={mustEnterGmail ? "Nhập tài khoản Gmail" : "Tài khoản Gmail mới"}
              className='mb-6 rounded-lg border p-4 pb-0'
              style={{ borderColor: token.colorPrimary, background: token.colorPrimaryBg }}
            >
              {!mustEnterGmail && (
                <Typography.Paragraph strong className='mb-3!'>
                  Tài khoản Gmail mới
                </Typography.Paragraph>
              )}
              {/* preserve=false: khối này mount/unmount theo "Đổi tài khoản Gmail"; mặc định rc-form giữ store
                  và chỉ áp initialValue khi store trống nên giá trị nhập dở lần trước dính lại */}
              <Form.Item
                name='address'
                label='Địa chỉ Gmail'
                preserve={false}
                normalize={(value: string) => value.trim()}
                initialValue={settings.address ?? ""}
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập địa chỉ Gmail" },
                  { type: "email", message: "Địa chỉ email không hợp lệ" }
                ]}
              >
                <Input
                  maxLength={254}
                  autoComplete='off'
                  inputMode='email'
                  placeholder='tencuahang@gmail.com'
                />
              </Form.Item>
              <Form.Item
                name='appPassword'
                label='App Password'
                preserve={false}
                extra='16 ký tự Google cấp riêng cho ứng dụng, không phải mật khẩu đăng nhập Gmail. Dán nguyên cả khoảng trắng cũng được.'
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập App Password" }
                ]}
              >
                <Input.Password
                  maxLength={64}
                  autoComplete='new-password'
                  placeholder='abcd efgh ijkl mnop'
                />
              </Form.Item>
              {!mustEnterGmail && (
                <Flex justify='space-between' align='center' gap={12} wrap className='mb-4'>
                  <Typography.Text type='secondary'>
                    Lưu xong, mọi mail gửi khách sẽ đi từ tài khoản mới.
                  </Typography.Text>
                  <Button disabled={saving} onClick={cancelGmailEdit}>
                    Hủy đổi
                  </Button>
                </Flex>
              )}
            </section>
          )}
          <Form.Item
            name='senderName'
            label='Tên người gửi'
            extra='Hiện ở ô "Người gửi" trong hộp thư của khách và trên đầu mỗi mail.'
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên người gửi" }]}
          >
            <Input
              maxLength={SENDER_NAME_MAX}
              showCount
              placeholder='Ví dụ: Shop Áo Nam Hà Nội'
              className='max-w-90!'
            />
          </Form.Item>
          <InboxPreview />
        </Form>
        {testResult && (
          <Alert
            className='mb-4'
            showIcon
            type={testResult.kind === "ok" ? "success" : "error"}
            title={
              testResult.kind === "ok"
                ? `Đã gửi mail thử tới ${testResult.sentTo}. Không thấy trong Hộp thư đến thì kiểm tra thư mục Spam.`
                : testResult.message
            }
          />
        )}
        <Flex justify='end' gap={8}>
          {canSendTest && (
            <Button loading={testing} disabled={saving} onClick={sendTest}>
              Gửi mail thử
            </Button>
          )}
          <Button type='primary' loading={saving} disabled={conflict || testing} onClick={save}>
            Lưu cấu hình
          </Button>
        </Flex>
        {canSendTest && (
          <Typography.Paragraph type='secondary' className='mt-2 mb-0! text-right'>
            Gửi mail thử dùng cấu hình đã lưu, gửi tới {adminEmail ?? "email bạn đang đăng nhập"}.
          </Typography.Paragraph>
        )}
      </Card>
      <GmailGuide />
    </Flex>
  );
}
