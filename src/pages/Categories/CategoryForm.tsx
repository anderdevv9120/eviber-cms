import { useState } from "react";
import { Alert, Button, Flex, Form, Input, Modal, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { uploadImageAPI } from "@/services/banners";
import {
  createCategoryAPI,
  updateCategoryAPI,
  type Category,
  type CategoryInput
} from "@/services/categories";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { toCategoryErrorView } from "./category-errors";

interface Values {
  name?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
}
interface Props {
  open: boolean;
  category?: Category;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Tải lại danh sách, trả các dòng mới để điền lại form sau xung đột revision */
  onReload: () => Promise<Category[] | undefined>;
}

const toValues = (category?: Category): Values => ({
  name: category?.name,
  slug: category?.slug,
  description: category?.description,
  imageUrl: category?.imageUrl
});

export default function CategoryForm({ open, category, onClose, onSaved, onReload }: Props) {
  const [form] = Form.useForm<Values>();
  const imageUrl = Form.useWatch("imageUrl", form);
  // Bản đang sửa — đổi sau "Tải lại" để gửi revision mới
  const [current, setCurrent] = useState(category);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || uploading;

  const submit = async () => {
    if (busy || stale) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    setError(null);
    const input: CategoryInput = {
      name: values.name!.trim(),
      slug: values.slug?.trim() || null,
      description: values.description?.trim() ?? "",
      imageUrl: values.imageUrl!
    };
    try {
      if (current) await updateCategoryAPI(current._id, { ...input, revision: current.revision });
      else await createCategoryAPI(input);
      await onSaved();
    } catch (cause) {
      const view = toCategoryErrorView(cause);
      if (view.stale) setStale(true);
      else if (view.field) form.setFields([{ name: view.field, errors: [view.message] }]);
      else setError(view.message);
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setSaving(true);
    setError(null);
    try {
      const rows = await onReload();
      if (!rows) {
        setError("Không tải lại được danh mục, thử lại sau");
        return;
      }
      const fresh = rows.find(row => row._id === current?._id);
      // Danh mục đã bị xóa → đóng, trang tự không còn dòng đó
      if (!fresh) return onClose();
      setCurrent(fresh);
      form.resetFields();
      form.setFieldsValue(toValues(fresh));
      setStale(false);
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadImageAPI(file);
      form.setFields([{ name: "imageUrl", value: res.data.path, errors: [] }]);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={category ? "Sửa danh mục" : "Thêm danh mục"}
      onCancel={() => {
        if (!busy) onClose();
      }}
      footer={[
        <Button key='cancel' onClick={onClose} disabled={busy}>
          Hủy
        </Button>,
        <Button key='save' type='primary' loading={saving} disabled={stale} onClick={submit}>
          Lưu danh mục
        </Button>
      ]}
    >
      {stale && (
        <Alert
          type='warning'
          showIcon
          title='Danh mục đã được người khác sửa'
          action={
            <Button size='small' onClick={() => void reload()} disabled={saving}>
              Tải lại
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Form<Values>
        form={form}
        layout='vertical'
        disabled={busy}
        initialValues={toValues(category)}
      >
        <Form.Item
          name='name'
          label='Tên danh mục'
          rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên danh mục" }]}
        >
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item
          name='slug'
          label='Slug'
          extra={
            category
              ? "Đổi slug sẽ làm hỏng các liên kết /collection?category= đã chia sẻ"
              : "Tự tạo từ tên nếu để trống"
          }
        >
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name='description' label='Mô tả'>
          <Input.TextArea maxLength={4000} showCount autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label='Ảnh' required>
          <Form.Item
            name='imageUrl'
            noStyle
            rules={[{ required: true, message: "Vui lòng tải ảnh danh mục" }]}
          >
            <Input type='hidden' />
          </Form.Item>
          <Flex vertical gap={8}>
            {imageUrl && (
              <img
                src={resolveImageUrl(imageUrl)}
                alt='Ảnh danh mục xem trước'
                style={{ width: 160, height: 160, objectFit: "cover" }}
              />
            )}
            <Upload
              disabled={busy}
              accept='image/png,image/jpeg,image/webp,image/gif'
              showUploadList={false}
              beforeUpload={file => {
                void upload(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} loading={uploading} disabled={busy}>
                {imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
              </Button>
            </Upload>
          </Flex>
        </Form.Item>
      </Form>
      {error && <Alert type='error' showIcon title={error} />}
    </Modal>
  );
}
