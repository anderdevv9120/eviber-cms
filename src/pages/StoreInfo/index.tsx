import { Alert, Button, Card, Flex, Form, Input, Result, Spin, Typography } from "antd";
import BlockTitle from "@/components/StoreContent/BlockTitle";
import { CONFLICT_MESSAGE, required } from "@/components/StoreContent/rules";
import { SOCIAL_PATTERN } from "@/constants/validate";
import useRevisionedSettings from "@/components/StoreContent/useRevisionedSettings";
import { getStoreInfoAPI, saveStoreInfoAPI, type StoreInfoSettings } from "@/services/storeContent";

export default function StoreInfo() {
  const [form] = Form.useForm<StoreInfoSettings>();
  const { settings, loadError, saving, saveError, conflict, reload, submit } =
    useRevisionedSettings<StoreInfoSettings>({
      form,
      load: getStoreInfoAPI,
      save: saveStoreInfoAPI
    });

  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (values) await submit(values);
  };

  if (loadError)
    return (
      <Result
        status='error'
        title='Không tải được thông tin cửa hàng'
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
      <div>
        <Typography.Title level={2} className='mb-1!'>
          Thông tin cửa hàng
        </Typography.Title>
        <Typography.Text type='secondary'>
          Liên hệ và mạng xã hội ở chân trang, cam kết dưới nút mua trên trang sản phẩm.
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
      <Form<StoreInfoSettings>
        form={form}
        layout='vertical'
        initialValues={settings}
        disabled={saving}
      >
        <Flex vertical gap={16}>
          <Card title={<BlockTitle hint='Chân trang'>Liên hệ</BlockTitle>}>
            <Form.Item
              name={["contact", "address"]}
              label='Địa chỉ'
              rules={[required("Vui lòng nhập địa chỉ")]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Flex gap={12}>
              <Form.Item
                className='flex-1'
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
                className='flex-1'
                name={["contact", "phone"]}
                label='Số điện thoại'
                rules={[required("Vui lòng nhập số điện thoại")]}
              >
                <Input maxLength={30} />
              </Form.Item>
            </Flex>
          </Card>
          <Card
            title={<BlockTitle hint='Chân trang'>Mạng xã hội</BlockTitle>}
            extra='Để trống để ẩn biểu tượng'
          >
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
          <Card
            title={<BlockTitle hint='Dưới nút Thêm vào giỏ'>Cam kết trang sản phẩm</BlockTitle>}
          >
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
        <Button type='primary' loading={saving} disabled={conflict} onClick={save}>
          Lưu thông tin
        </Button>
      </Flex>
    </Flex>
  );
}
