import { useAppStore, type Profile } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { Button, ConfigProvider, Flex, Form, Input, Upload } from "antd";
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

const mayUpdate = (profile: Profile | null) =>
  !!profile && canAccess(profile, { anyOf: ["CONTENT_HOME_UPDATE"] });

export default function ImageField({
  name,
  alt,
  uploading,
  onUpload,
  label = "Ảnh",
  optional = false
}: ImageFieldProps) {
  const canUpdate = mayUpdate(useAppStore(state => state.profile));
  const { componentDisabled } = ConfigProvider.useConfig();
  const disabled = componentDisabled || !canUpdate;
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
          disabled={disabled}
          accept='image/png,image/jpeg,image/webp,image/gif'
          showUploadList={false}
          beforeUpload={file => {
            if (!componentDisabled && mayUpdate(useAppStore.getState().profile)) onUpload(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled}>
            {image ? "Đổi ảnh" : "Tải ảnh lên"}
          </Button>
        </Upload>
        {optional && image && (
          <Button
            disabled={disabled}
            onClick={() => {
              if (!componentDisabled && mayUpdate(useAppStore.getState().profile))
                form.setFieldValue(name, undefined);
            }}
          >
            Xoá {label.toLowerCase()}
          </Button>
        )}
      </Flex>
    </Form.Item>
  );
}
