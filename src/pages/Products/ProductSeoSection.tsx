import { Card, Form, Input, Select } from "antd";

export default function ProductSeoSection() {
  const name = Form.useWatch("name") as string | undefined;
  return (
    <Card title='SEO'>
      <Form.Item label='Tiêu đề SEO' name={["seo", "metaTitle"]}>
        <Input maxLength={200} placeholder={name?.trim() || "Mặc định: tên sản phẩm"} />
      </Form.Item>
      <Form.Item label='Mô tả SEO' name={["seo", "metaDescription"]}>
        <Input.TextArea
          maxLength={500}
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder='Mặc định: đoạn đầu mô tả sản phẩm'
        />
      </Form.Item>
      <Form.Item label='Từ khóa' name={["seo", "metaKeywords"]}>
        <Select
          mode='tags'
          aria-label='Từ khóa'
          placeholder='Nhập từ khóa rồi Enter'
          open={false}
        />
      </Form.Item>
    </Card>
  );
}
