import { Button, Flex, Form, Input, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { resolveImageUrl } from "@/utils/resolveImageUrl";

interface ImageFieldProps {
  name: (string | number)[];
  alt: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  label?: string;
  /** Ảnh tuỳ chọn: không bắt buộc, có nút xoá */
  optional?: boolean;
}

export default function ImageField({
  name,
  alt,
  uploading,
  onUpload,
  label = "Ảnh",
  optional = false
}: ImageFieldProps) {
  const form = Form.useFormInstance();
  const image = Form.useWatch(name, form) as string | undefined;

  return (
    <Form.Item label={label} required={!optional}>
      <Form.Item
        name={name}
        noStyle
        rules={optional ? [] : [{ required: true, message: "Vui lòng tải ảnh" }]}
      >
        <Input type='hidden' />
      </Form.Item>
      <Flex vertical gap={8}>
        {image && (
          <img
            src={resolveImageUrl(image)}
            alt={alt}
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
        {optional && image && (
          <Button onClick={() => form.setFieldValue(name, undefined)}>
            Xoá {label.toLowerCase()}
          </Button>
        )}
      </Flex>
    </Form.Item>
  );
}
