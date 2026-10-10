import { Card, Form, Input, Select } from "antd";
import { RichEditor } from "@/components/RichEditor";
import type { CategoryOption } from "@/services/products";

interface Props {
  categories: CategoryOption[];
  categoriesError: string | null;
  /** The slug is required once the product exists; a new product may leave it to the server. */
  slugRequired: boolean;
  editorKey: number;
  initialDescription: string;
  descriptionError: string | null;
  disabled: boolean;
  onDescriptionChange: (html: string) => void;
}

export default function ProductInfoSection({
  categories,
  categoriesError,
  slugRequired,
  editorKey,
  initialDescription,
  descriptionError,
  disabled,
  onDescriptionChange
}: Props) {
  return (
    <Card title='Thông tin'>
      <Form.Item
        label='Tên sản phẩm'
        name='name'
        rules={[{ required: true, whitespace: true, message: "Nhập tên sản phẩm" }]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        label='Đường dẫn'
        name='slug'
        extra='Tự theo tên cho tới lần lưu đầu tiên. Đổi đường dẫn làm hỏng link cũ.'
        rules={[{ required: slugRequired, whitespace: true, message: "Nhập đường dẫn" }]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        label='Danh mục'
        name='categoryIds'
        extra={categoriesError ? `Không tải được danh mục: ${categoriesError}` : undefined}
      >
        <Select
          mode='multiple'
          aria-label='Danh mục'
          placeholder='Chọn danh mục'
          optionFilterProp='label'
          options={categories.map(({ _id, name }) => ({ value: _id, label: name }))}
        />
      </Form.Item>
      <Form.Item
        label='Mô tả'
        validateStatus={descriptionError ? "error" : undefined}
        help={descriptionError ?? undefined}
      >
        {/* Locked while saving or read-only: the editor remounts with the server HTML after a save */}
        <div inert={disabled} aria-disabled={disabled}>
          <RichEditor
            key={editorKey}
            initialHtml={initialDescription}
            onChange={onDescriptionChange}
          />
        </div>
      </Form.Item>
    </Card>
  );
}
