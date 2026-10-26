import { useAppStore, type Profile } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { Alert, Button, Card, Form, InputNumber, Spin, Switch, Typography } from "antd";
import useRevisionedSettings from "@/components/StoreContent/useRevisionedSettings";
import { CONFLICT_MESSAGE } from "@/components/StoreContent/rules";
import { getRefundPolicyAPI, saveRefundPolicyAPI, type RefundPolicy } from "@/services/refunds";

type PolicyValues = Pick<RefundPolicy, "enabled" | "windowDays">;

const savePolicy = ({ enabled, windowDays, revision }: RefundPolicy) =>
  saveRefundPolicyAPI({ enabled, windowDays, expectedRevision: revision });

const mayUpdate = (profile: Profile | null) =>
  !!profile && canAccess(profile, { anyOf: ["REFUND_POLICY_UPDATE"] });

export default function RefundPolicySettings() {
  const canUpdate = mayUpdate(useAppStore(state => state.profile));
  const [form] = Form.useForm<PolicyValues>();
  const { settings, loadError, saving, saveError, conflict, reload, submit } =
    useRevisionedSettings<PolicyValues>({ form, load: getRefundPolicyAPI, save: savePolicy });

  return (
    <Card title='Chính sách hoàn tiền'>
      {loadError ? (
        <Alert
          type='error'
          showIcon
          title='Không tải được chính sách hoàn tiền'
          description={loadError}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      ) : !settings ? (
        <Spin aria-label='Đang tải chính sách hoàn tiền' />
      ) : (
        <>
          <Typography.Paragraph type='secondary'>
            Thay đổi chỉ áp dụng cho các đơn hàng mua sau. Đơn đã mua giữ chính sách tại thời điểm
            mua.
          </Typography.Paragraph>
          {conflict && (
            <Alert
              type='warning'
              showIcon
              className='mb-4'
              title={CONFLICT_MESSAGE}
              action={<Button onClick={reload}>Tải lại</Button>}
            />
          )}
          {saveError && <Alert type='error' showIcon className='mb-4' title={saveError} />}
          <Form<PolicyValues>
            name='refund-policy'
            form={form}
            layout='vertical'
            initialValues={settings}
            disabled={saving || !canUpdate}
            onFinish={values => {
              if (mayUpdate(useAppStore.getState().profile)) void submit(values);
            }}
          >
            <Form.Item
              name='enabled'
              label='Hỗ trợ hoàn tiền thông thường'
              valuePropName='checked'
              extra='Khi tắt, khách vẫn có thể báo hàng thiếu hoặc giao sai để được xem xét.'
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name='windowDays'
              label='Số ngày sau khi giao hàng'
              rules={[
                {
                  required: true,
                  type: "integer",
                  min: 1,
                  max: 365,
                  message: "Nhập số ngày nguyên từ 1 đến 365"
                }
              ]}
            >
              <InputNumber />
            </Form.Item>
            <Button
              type='primary'
              htmlType='submit'
              loading={saving}
              disabled={!canUpdate || conflict}
            >
              Lưu chính sách hoàn tiền
            </Button>
          </Form>
        </>
      )}
    </Card>
  );
}
