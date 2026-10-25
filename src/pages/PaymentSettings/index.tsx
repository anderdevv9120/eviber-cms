import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Result,
  Spin,
  Tag,
  theme,
  Typography
} from "antd";
import {
  getPaymentSettingsAPI,
  savePaymentSettingsAPI,
  testPaymentConnectionAPI,
  type PaymentSettings,
  type PaymentSettingsStatus
} from "@/services/payment-settings";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import PayosGuide from "./PayosGuide";
import SavedCredentials from "./SavedCredentials";

interface FormValues {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  linkTtlMinutes: number;
}

// = PAYOS_CONFIG.LINK_TTL_MINUTES_MIN/MAX (backend/src/configs/constant.config.ts) — repo tách, không share được
const TTL_MIN = 5;
const TTL_MAX = 30;
const CONFLICT_MESSAGE = "Cấu hình vừa được người khác thay đổi. Tải lại để xem bản mới nhất.";

const STATUS: Record<PaymentSettingsStatus, { color: string; label: string; hint: string }> = {
  configured: {
    color: "success",
    label: "Đã cấu hình",
    hint: "Khách thấy phương thức chuyển khoản ở trang thanh toán."
  },
  not_configured: {
    color: "default",
    label: "Chưa cấu hình",
    hint: "Khách chưa thấy phương thức chuyển khoản. Nhập đủ 3 key để bật."
  },
  undecryptable: {
    color: "error",
    label: "Cần nhập lại key",
    hint: "Key đang lưu không giải mã được (khóa bảo mật của máy chủ đã đổi). Chuyển khoản đang tắt — nhập lại đủ 3 key."
  }
};

type KeyField = "clientId" | "apiKey" | "checksumKey";
const KEY_FIELDS: KeyField[] = ["clientId", "apiKey", "checksumKey"];

type TestOutcome =
  /** savedSet: ô nhập đang mở nhưng để trống hết → bộ vừa kiểm là bộ đang lưu, không phải "bộ key mới" */
  | { kind: "ok"; savedSet?: boolean }
  | { kind: "rejected"; message?: string }
  | { kind: "unreachable"; message: string }
  /** Máy chủ cửa hàng từ chối yêu cầu kiểm tra (thiếu key...) — chưa tới payOS */
  | { kind: "invalid"; message: string };

function testOutcomeAlert(outcome: TestOutcome) {
  if (outcome.kind === "ok")
    return {
      type: "success" as const,
      title: outcome.savedSet
        ? "Kết nối payOS thành công với bộ key đang lưu (chưa nhập key mới)."
        : "Kết nối payOS thành công — key hợp lệ."
    };
  if (outcome.kind === "rejected")
    return {
      type: "error" as const,
      title: `payOS từ chối: ${outcome.message ?? "key không hợp lệ"}`
    };
  if (outcome.kind === "invalid") return { type: "error" as const, title: outcome.message };
  return { type: "warning" as const, title: `Chưa kiểm tra được: ${outcome.message}` };
}

// Reject = chưa có câu trả lời của payOS: BE chặn (400 thiếu key, 429 bấm quá 5 lần/phút) hoặc lỗi
// ở chặng CMS → máy chủ (mất mạng, BE tắt, hết giờ chờ)
function testFailure(cause: unknown): TestOutcome {
  if (cause instanceof ApiError && cause.status === 429)
    return { kind: "unreachable", message: "thử quá nhiều lần, chờ 1 phút rồi kiểm tra lại" };
  if (cause instanceof ApiError && cause.status === 400)
    return { kind: "invalid", message: cause.message };
  return { kind: "unreachable", message: getErrorMessage(cause) };
}

const shortId = (value: string) =>
  value.length > 10 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;

export default function PaymentSettingsPage() {
  const [form] = Form.useForm<FormValues>();
  const { token } = theme.useToken();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestOutcome | null>(null);
  const [editingKeys, setEditingKeys] = useState(false);
  // Kiểm tra kết nối chờ payOS tới 30s; đổi bộ key / hủy / gõ tiếp trong lúc đó làm kết quả về sau
  // thuộc về bộ key khác — tăng số thứ tự để lượt đang bay bị bỏ
  const testSeq = useRef(0);

  const invalidateTest = () => {
    testSeq.current += 1;
    setTestResult(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    getPaymentSettingsAPI(controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  // Nạp hạn QR SAU khi Form mount (settings null → Form chưa có, setFieldsValue lúc đó bị antd cảnh báo);
  // Tải lại giữ store cũ qua unmount nên initialValues không đủ, phải set lại từ bản vừa tải
  useEffect(() => {
    if (settings) form.setFieldsValue({ linkTtlMinutes: settings.linkTtlMinutes });
  }, [form, settings]);

  const reload = () => {
    setSettings(null);
    setLoadError(null);
    setSaveError(null);
    setConflict(false);
    invalidateTest();
    setEditingKeys(false);
    form.resetFields(KEY_FIELDS);
    setAttempt(value => value + 1);
  };

  const cancelKeyEdit = () => {
    setEditingKeys(false);
    invalidateTest();
    form.resetFields(KEY_FIELDS);
  };

  // Bộ key chỉ gửi khi đang mở ô nhập — không gửi field nào = BE giữ nguyên bộ đang lưu
  const typedKeys = (showKeyInputs: boolean) =>
    showKeyInputs ? form.getFieldsValue(KEY_FIELDS) : {};

  const save = async () => {
    if (!settings || saving || conflict) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await savePaymentSettingsAPI({
        ...typedKeys(settings.status !== "configured" || editingKeys),
        linkTtlMinutes: values.linkTtlMinutes,
        revision: settings.revision
      });
      setSettings(data);
      setEditingKeys(false);
      form.resetFields(KEY_FIELDS);
      invalidateTest();
      successNotification("Đã lưu cấu hình thanh toán.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
      else setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (testing || !settings) return;
    const showKeyInputs = settings.status !== "configured" || editingKeys;
    if (showKeyInputs && !(await form.validateFields(KEY_FIELDS).catch(() => null))) return;
    const keys = typedKeys(showKeyInputs);
    const savedSet = showKeyInputs && !KEY_FIELDS.some(field => (keys[field] ?? "").trim() !== "");
    testSeq.current += 1;
    const seq = testSeq.current;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await testPaymentConnectionAPI(keys);
      if (seq !== testSeq.current) return;
      setTestResult(
        data.ok
          ? { kind: "ok", savedSet }
          : data.reason === "unreachable"
            ? {
                kind: "unreachable",
                message: `payOS chưa phản hồi (${data.message ?? "lỗi mạng"})`
              }
            : { kind: "rejected", message: data.message }
      );
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
        title='Không tải được cấu hình thanh toán'
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
  const mustEnterKeys = settings.status !== "configured";
  const showKeyInputs = mustEnterKeys || editingKeys;
  const required = (message: string) =>
    mustEnterKeys ? [{ required: true, whitespace: true, message }] : [];
  const keepPlaceholder = (saved: string | null) =>
    !mustEnterKeys && saved ? `Giữ ${saved} nếu để trống` : undefined;

  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={2} className='mb-1!'>
          Thanh toán
        </Typography.Title>
        <Typography.Text type='secondary'>
          Nhận tiền chuyển khoản qua mã QR payOS; tiền về thì đơn tự chuyển sang Đã thanh toán.
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
      <Card title='Chuyển khoản qua payOS' extra={<Tag color={status.color}>{status.label}</Tag>}>
        <Typography.Paragraph type='secondary'>{status.hint}</Typography.Paragraph>
        {!showKeyInputs && (
          <SavedCredentials
            settings={settings}
            disabled={saving || testing}
            onEdit={() => {
              setEditingKeys(true);
              invalidateTest();
            }}
          />
        )}
        <Form<FormValues>
          form={form}
          layout='vertical'
          disabled={saving}
          onValuesChange={invalidateTest}
        >
          {showKeyInputs && (
            <section
              aria-label={mustEnterKeys ? "Nhập bộ key payOS" : "Bộ key mới"}
              className='mb-6 rounded-lg border p-4 pb-0'
              style={{ borderColor: token.colorPrimary, background: token.colorPrimaryBg }}
            >
              {!mustEnterKeys && (
                <Typography.Paragraph strong className='mb-3!'>
                  Bộ key mới
                </Typography.Paragraph>
              )}
              {/* preserve=false: khối này mount/unmount theo "Đổi bộ key"; mặc định rc-form giữ store và chỉ
                  áp initialValue khi store trống nên Client ID cũ (điền sẵn lúc undecryptable) dính lại */}
              <Form.Item
                name='clientId'
                label='Client ID'
                preserve={false}
                initialValue={mustEnterKeys ? (settings.clientId ?? "") : ""}
                rules={required("Vui lòng nhập Client ID")}
              >
                <Input
                  maxLength={200}
                  autoComplete='off'
                  placeholder={keepPlaceholder(settings.clientId && shortId(settings.clientId))}
                />
              </Form.Item>
              <Form.Item
                name='apiKey'
                label='API Key'
                preserve={false}
                rules={required("Vui lòng nhập key")}
              >
                <Input.Password
                  maxLength={200}
                  autoComplete='new-password'
                  placeholder={keepPlaceholder(
                    settings.apiKeyLast4 && `••••${settings.apiKeyLast4}`
                  )}
                />
              </Form.Item>
              <Form.Item
                name='checksumKey'
                label='Checksum Key'
                preserve={false}
                rules={required("Vui lòng nhập key")}
              >
                <Input.Password
                  maxLength={200}
                  autoComplete='new-password'
                  placeholder={keepPlaceholder(
                    settings.checksumKeyLast4 && `••••${settings.checksumKeyLast4}`
                  )}
                />
              </Form.Item>
              {!mustEnterKeys && (
                <Flex justify='space-between' align='center' gap={12} wrap className='mb-4'>
                  <Typography.Text type='secondary'>
                    Khách đang mở mã QR cũ sẽ nhận mã mới khi tải lại; tiền chuyển qua mã cũ trong 1
                    giờ sau khi đổi vẫn được ghi nhận.
                  </Typography.Text>
                  <Button disabled={testing || saving} onClick={cancelKeyEdit}>
                    Hủy đổi
                  </Button>
                </Flex>
              )}
            </section>
          )}
          <Form.Item
            name='linkTtlMinutes'
            label='Hạn mỗi mã QR'
            extra='Mã hết hạn thì khách bấm tạo mã mới; đơn vẫn giữ tới hạn thanh toán của đơn.'
            rules={[{ required: true, message: `Nhập từ ${TTL_MIN} đến ${TTL_MAX} phút` }]}
          >
            <InputNumber
              min={TTL_MIN}
              max={TTL_MAX}
              precision={0}
              suffix='phút'
              className='w-40!'
            />
          </Form.Item>
        </Form>
        {testResult && <Alert className='mb-4' showIcon {...testOutcomeAlert(testResult)} />}
        <Flex justify='end' gap={8}>
          <Button loading={testing} disabled={saving} onClick={testConnection}>
            Kiểm tra kết nối
          </Button>
          <Button type='primary' loading={saving} disabled={conflict || testing} onClick={save}>
            Lưu cấu hình
          </Button>
        </Flex>
      </Card>
      <PayosGuide webhookUrl={settings.webhookUrl} />
    </Flex>
  );
}
