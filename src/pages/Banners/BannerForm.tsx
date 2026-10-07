import { useEffect, useState } from "react";
import { Alert, Button, Flex, Form, Input, Modal, Switch, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { uploadImageAPI, type Banner, type BannerInput } from "@/services/banners";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { resolveImageUrl } from "@/utils/resolveImageUrl";

// Khớp backend: path nội bộ (không `//` hay `/\`) hoặc https — chặn javascript:/protocol-relative
const HREF_PATTERN = /^(\/(?![/\\])\S*|https:\/\/\S+)$/;

interface Values {
  image?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  isActive: boolean;
}
interface Props {
  banner?: Banner;
  onCancel: () => void;
  onSubmit: (input: BannerInput) => Promise<void>;
}

export default function BannerForm({ banner, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<Values>();
  const image = Form.useWatch("image", form);
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (selectedImage) URL.revokeObjectURL(selectedImage.preview);
    };
  }, [selectedImage]);

  const submit = async () => {
    if (saving) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    setError(null);
    try {
      let imagePath = values.image!;
      if (selectedImage) {
        const res = await uploadImageAPI(selectedImage.file);
        imagePath = res.data.path;
        form.setFieldValue("image", imagePath);
        setSelectedImage(null);
      }
      await onSubmit({
        image: imagePath,
        title: values.title!.trim(),
        subtitle: values.subtitle?.trim() ?? "",
        ctaLabel: values.ctaLabel?.trim() ?? "",
        ctaHref: values.ctaHref?.trim() ?? "",
        isActive: values.isActive
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={banner ? "Sửa banner" : "Thêm banner"}
      onCancel={() => {
        if (!saving) onCancel();
      }}
      footer={[
        <Button key='cancel' onClick={onCancel} disabled={saving}>
          Hủy
        </Button>,
        <Button key='save' type='primary' loading={saving} onClick={submit}>
          Lưu banner
        </Button>
      ]}
    >
      <Form<Values>
        form={form}
        layout='vertical'
        disabled={saving}
        initialValues={{
          image: banner?.image,
          title: banner?.title,
          subtitle: banner?.subtitle,
          ctaLabel: banner?.ctaLabel,
          ctaHref: banner?.ctaHref,
          isActive: banner?.isActive ?? true
        }}
      >
        <Form.Item label='Ảnh' required>
          <Form.Item
            name='image'
            noStyle
            rules={[{ required: true, message: "Vui lòng tải ảnh banner" }]}
          >
            <Input type='hidden' />
          </Form.Item>
          <Flex vertical gap={8}>
            {image && (
              <img
                src={resolveImageUrl(image)}
                alt='Ảnh banner xem trước'
                style={{ width: "100%", maxHeight: 160, objectFit: "cover" }}
              />
            )}
            <Upload
              disabled={saving}
              accept='image/png,image/jpeg,image/webp,image/gif'
              showUploadList={false}
              beforeUpload={file => {
                const preview = URL.createObjectURL(file);
                setSelectedImage({ file, preview });
                form.setFieldValue("image", preview);
                setError(null);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} disabled={saving}>
                {image ? "Đổi ảnh" : "Tải ảnh lên"}
              </Button>
            </Upload>
          </Flex>
        </Form.Item>
        <Form.Item
          name='title'
          label='Tiêu đề'
          rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tiêu đề" }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name='subtitle' label='Mô tả ngắn'>
          <Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
        <Form.Item name='ctaLabel' label='Nội dung nút'>
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item
          name='ctaHref'
          label='Đường dẫn nút'
          dependencies={["ctaLabel"]}
          rules={[
            { pattern: HREF_PATTERN, message: "Đường dẫn phải bắt đầu bằng / hoặc https://" },
            ({ getFieldValue }) => ({
              validator(_, value?: string) {
                const label = (getFieldValue("ctaLabel") as string | undefined)?.trim();
                return !!label === !!value?.trim()
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error("Nhập cả nội dung nút và đường dẫn, hoặc để trống cả hai")
                    );
              }
            })
          ]}
        >
          <Input maxLength={500} placeholder='/collection' />
        </Form.Item>
        <Form.Item name='isActive' label='Hiển thị' valuePropName='checked'>
          <Switch />
        </Form.Item>
      </Form>
      {error && <Alert type='error' showIcon title={error} />}
    </Modal>
  );
}
