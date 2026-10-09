import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Radio,
  Result,
  Spin,
  Typography,
  Upload
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import {
  getStoreSettingsAPI,
  saveStoreSettingsAPI,
  type PromoTile,
  type Revisioned,
  type StoreSettings
} from "@/services/storeContent";
import { uploadImageAPI } from "@/services/banners";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { successNotification } from "@/utils/notification";

// Khớp backend (banner DTO): path nội bộ một dấu / hoặc https
const HREF_PATTERN = /^(\/(?![/\\])\S*|https:\/\/\S+)$/;
const SOCIAL_PATTERN = /^(|https:\/\/\S+)$/;
// Icon cố định theo vị trí trên storefront (UspStrip)
const HOME_PROMISE_LABELS = [
  "Ô 1 · Vận chuyển",
  "Ô 2 · Đổi trả",
  "Ô 3 · Chất lượng",
  "Ô 4 · Thanh toán"
];
const SAVED_MESSAGE = "Đã lưu. Cửa hàng cập nhật trong tối đa 5 phút.";
const CONFLICT_MESSAGE = "Nội dung đã thay đổi. Tải lại để bỏ bản nháp trước khi lưu.";

const required = (message: string) => ({ required: true, whitespace: true, message });

function TileFields({
  index,
  uploading,
  onUpload
}: {
  index: number;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const form = Form.useFormInstance<StoreSettings>();
  const image = Form.useWatch(["promoTiles", index, "image"], form) as string | undefined;
  const name = (field: keyof PromoTile) => ["promoTiles", index, field];

  return (
    <Card type='inner' title={`Ô ${index + 1}`}>
      <Form.Item name={name("title")} label='Tiêu đề' rules={[required("Vui lòng nhập tiêu đề")]}>
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item name={name("description")} label='Mô tả' rules={[required("Vui lòng nhập mô tả")]}>
        <Input.TextArea maxLength={120} autoSize={{ minRows: 2, maxRows: 3 }} />
      </Form.Item>
      <Form.Item
        name={name("ctaLabel")}
        label='Nội dung nút'
        rules={[required("Vui lòng nhập nội dung nút")]}
      >
        <Input maxLength={20} />
      </Form.Item>
      <Form.Item
        name={name("href")}
        label='Đường dẫn'
        rules={[
          required("Vui lòng nhập đường dẫn"),
          { pattern: HREF_PATTERN, message: "Đường dẫn phải bắt đầu bằng / hoặc https://" }
        ]}
      >
        <Input maxLength={300} placeholder='/collection' />
      </Form.Item>
      <Form.Item label='Ảnh' required>
        <Form.Item
          name={name("image")}
          noStyle
          rules={[{ required: true, message: "Vui lòng tải ảnh" }]}
        >
          <Input type='hidden' />
        </Form.Item>
        <Flex vertical gap={8}>
          {image && (
            <img
              src={resolveImageUrl(image)}
              alt={`Ảnh ô khuyến mãi ${index + 1}`}
              style={{ width: "100%", maxHeight: 160, objectFit: "cover" }}
            />
          )}
          <Upload
            accept='image/png,image/jpeg,image/webp,image/gif'
            showUploadList={false}
            beforeUpload={file => {
              onUpload(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>
              {image ? "Đổi ảnh" : "Tải ảnh lên"}
            </Button>
          </Upload>
        </Flex>
      </Form.Item>
      <Form.Item name={name("theme")} label='Kiểu hiển thị'>
        <Radio.Group
          options={[
            { value: "light", label: "Sáng (chữ tối)" },
            { value: "dark", label: "Tối (chữ trắng)" }
          ]}
        />
      </Form.Item>
    </Card>
  );
}

export default function StoreContent() {
  const [form] = Form.useForm<StoreSettings>();
  const [settings, setSettings] = useState<Revisioned<StoreSettings> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getStoreSettingsAPI(controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        // The form store outlives the remount; initialValues alone would let the old draft win
        form.setFieldsValue(data);
        setSettings(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt, form]);

  // Bỏ bản nháp: tải lại bản mới nhất và dựng lại form từ đầu
  const reload = () => {
    setSettings(null);
    setLoadError(null);
    setSaveError(null);
    setConflict(false);
    setAttempt(value => value + 1);
  };

  const uploadTileImage = async (index: number, file: File) => {
    setUploading(index);
    setSaveError(null);
    try {
      const { data } = await uploadImageAPI(file);
      form.setFieldValue(["promoTiles", index, "image"], data.path);
    } catch (cause) {
      setSaveError(getErrorMessage(cause));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!settings || saving || conflict) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await saveStoreSettingsAPI({ ...values, revision: settings.revision });
      setSettings(data);
      form.setFieldsValue(data);
      successNotification(SAVED_MESSAGE);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
      else setSaveError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  if (loadError)
    return (
      <Result
        status='error'
        title='Không tải được nội dung cửa hàng'
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

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>Nội dung cửa hàng</Typography.Title>
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
      <Form<StoreSettings> form={form} layout='vertical' initialValues={settings} disabled={saving}>
        <Flex vertical gap={16}>
          <Card title='Liên hệ'>
            <Form.Item
              name={["contact", "address"]}
              label='Địa chỉ'
              rules={[required("Vui lòng nhập địa chỉ")]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              name={["contact", "email"]}
              label='Email'
              rules={[
                required("Vui lòng nhập email"),
                { type: "email", message: "Email không hợp lệ" }
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name={["contact", "phone"]}
              label='Số điện thoại'
              rules={[required("Vui lòng nhập số điện thoại")]}
            >
              <Input maxLength={30} />
            </Form.Item>
          </Card>
          <Card title='Mạng xã hội' extra='Để trống để ẩn biểu tượng'>
            {(["facebook", "instagram", "twitter"] as const).map(key => (
              <Form.Item
                key={key}
                name={["socials", key]}
                label={key[0].toUpperCase() + key.slice(1)}
                rules={[{ pattern: SOCIAL_PATTERN, message: "Link phải bắt đầu bằng https://" }]}
              >
                <Input maxLength={300} placeholder='https://' />
              </Form.Item>
            ))}
          </Card>
          <Card title='Ô khuyến mãi'>
            <Flex vertical gap={16}>
              {[0, 1].map(index => (
                <TileFields
                  key={index}
                  index={index}
                  uploading={uploading === index}
                  onUpload={file => uploadTileImage(index, file)}
                />
              ))}
            </Flex>
          </Card>
          <Card title='Cam kết'>
            <Typography.Title level={5}>Trang chủ</Typography.Title>
            {HOME_PROMISE_LABELS.map((label, index) => (
              <Flex key={label} gap={12}>
                <Form.Item
                  className='flex-1'
                  name={["homePromises", index, "title"]}
                  label={`${label} — tiêu đề`}
                  rules={[required("Vui lòng nhập tiêu đề")]}
                >
                  <Input maxLength={40} />
                </Form.Item>
                <Form.Item
                  className='flex-1'
                  name={["homePromises", index, "description"]}
                  label={`${label} — mô tả`}
                  rules={[required("Vui lòng nhập mô tả")]}
                >
                  <Input maxLength={60} />
                </Form.Item>
              </Flex>
            ))}
            <Typography.Title level={5}>Trang sản phẩm</Typography.Title>
            {[0, 1, 2].map(index => (
              <Form.Item
                key={index}
                name={["productPromises", index]}
                label={`Dòng ${index + 1}`}
                rules={[required("Vui lòng nhập nội dung")]}
              >
                <Input maxLength={60} />
              </Form.Item>
            ))}
          </Card>
        </Flex>
      </Form>
      <Flex justify='end'>
        <Button
          type='primary'
          loading={saving}
          disabled={conflict || uploading !== null}
          onClick={save}
        >
          Lưu nội dung
        </Button>
      </Flex>
    </Flex>
  );
}
