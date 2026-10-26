import { useAppStore, type Profile } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Radio,
  Result,
  Spin,
  Switch,
  Typography
} from "antd";
import { ExportOutlined } from "@ant-design/icons";
import BlockTitle from "@/components/StoreContent/BlockTitle";
import ImageField from "@/components/StoreContent/ImageField";
import { CONFLICT_MESSAGE, isFilled, required } from "@/components/StoreContent/rules";
import { HREF_MESSAGE, HREF_PATTERN } from "@/constants/validate";
import useRevisionedSettings from "@/components/StoreContent/useRevisionedSettings";
import { STOREFRONT_URL } from "@/constants/env";
import { uploadImageAPI } from "@/services/images";
import {
  getStoreHomeAPI,
  saveStoreHomeAPI,
  type BrandStory,
  type PromoTile,
  type StoreHomeSettings
} from "@/services/storeContent";
import { getErrorMessage } from "@/utils/getErrorMessage";
import BannerBlock from "./BannerBlock";

// Icon cố định theo vị trí trên storefront (UspStrip)
const HOME_PROMISE_LABELS = ["Vận chuyển", "Đổi trả", "Chất lượng", "Thanh toán"];

type ImagePath =
  ["promoTiles", number, "image"] | ["brandStory", "image"] | ["brandStory", "image2"];
const STORY_IMAGE: ImagePath = ["brandStory", "image"];
const STORY_IMAGE2: ImagePath = ["brandStory", "image2"];
const tileImage = (index: number): ImagePath => ["promoTiles", index, "image"];
const imageKey = (path: ImagePath) => path.join(".");

function TileFields({
  index,
  uploading,
  onUpload
}: {
  index: number;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
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
          { pattern: HREF_PATTERN, message: HREF_MESSAGE }
        ]}
      >
        <Input maxLength={300} placeholder='/collection' />
      </Form.Item>
      <ImageField
        permission='CONTENT_HOME_UPDATE'
        name={tileImage(index)}
        alt={`Ảnh ô khuyến mãi ${index + 1}`}
        uploading={uploading}
        onUpload={onUpload}
      />
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

function BrandStoryFields({
  uploading,
  onUpload
}: {
  uploading: string[];
  onUpload: (name: ImagePath, file: File) => void;
}) {
  const name = (field: keyof BrandStory) => ["brandStory", field];

  return (
    <>
      <Form.Item name={name("title")} label='Tiêu đề' rules={[required("Vui lòng nhập tiêu đề")]}>
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item
        name={name("titleAccent")}
        label='Phần nhấn của tiêu đề'
        extra='Tuỳ chọn — theme Rosier in nghiêng, màu nhấn, ngay sau tiêu đề.'
      >
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item name={name("body")} label='Nội dung' rules={[required("Vui lòng nhập nội dung")]}>
        <Input.TextArea maxLength={600} showCount autoSize={{ minRows: 4, maxRows: 10 }} />
      </Form.Item>
      <ImageField
        permission='CONTENT_HOME_UPDATE'
        name={STORY_IMAGE}
        alt='Ảnh câu chuyện thương hiệu'
        uploading={uploading.includes(imageKey(STORY_IMAGE))}
        onUpload={file => onUpload(STORY_IMAGE, file)}
      />
      <ImageField
        permission='CONTENT_HOME_UPDATE'
        name={STORY_IMAGE2}
        label='Ảnh thứ 2'
        optional
        alt='Ảnh thứ 2 câu chuyện thương hiệu'
        uploading={uploading.includes(imageKey(STORY_IMAGE2))}
        onUpload={file => onUpload(STORY_IMAGE2, file)}
      />
      {/* Nút là tuỳ chọn nhưng phải đủ cặp, khớp DTO backend */}
      <Form.Item
        name={name("ctaLabel")}
        label='Nội dung nút'
        dependencies={[name("href")]}
        rules={[
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              isFilled(getFieldValue(name("href"))) && !isFilled(value)
                ? Promise.reject(new Error("Vui lòng nhập nội dung nút"))
                : Promise.resolve()
          })
        ]}
      >
        <Input maxLength={30} />
      </Form.Item>
      <Form.Item
        name={name("href")}
        label='Đường dẫn'
        dependencies={[name("ctaLabel")]}
        rules={[
          { pattern: HREF_PATTERN, message: HREF_MESSAGE },
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              isFilled(getFieldValue(name("ctaLabel"))) && !isFilled(value)
                ? Promise.reject(new Error("Vui lòng nhập đường dẫn cho nút"))
                : Promise.resolve()
          })
        ]}
      >
        <Input maxLength={300} placeholder='/collection' />
      </Form.Item>
    </>
  );
}

const toBrandStory = (story: BrandStory): BrandStory => {
  const ctaLabel = story.ctaLabel?.trim();
  const href = story.href?.trim();
  const titleAccent = story.titleAccent?.trim();
  return {
    title: story.title.trim(),
    ...(titleAccent ? { titleAccent } : {}),
    body: story.body.trim(),
    image: story.image,
    ...(story.image2 ? { image2: story.image2 } : {}),
    ...(ctaLabel && href ? { ctaLabel, href } : {})
  };
};

// BannerBlock cảnh báo rời trang khi thứ tự chưa lưu, cần modal từ antd <App>
const mayUpdate = (profile: Profile | null) =>
  !!profile && canAccess(profile, { anyOf: ["CONTENT_HOME_UPDATE"] });

export default function ContentHome() {
  return (
    <App component={false}>
      <ContentHomeForm />
    </App>
  );
}

function ContentHomeForm() {
  const canUpdate = mayUpdate(useAppStore(state => state.profile));
  const [form] = Form.useForm<StoreHomeSettings>();
  const [storyOn, setStoryOn] = useState(false);
  // Mỗi ô chỉ nhận lượt upload mới nhất (ảnh chọn sau cùng); Tải lại bỏ mọi lượt đang chạy để ảnh
  // về muộn không ghi đè bản server vừa nạp. Lưu khoá tới khi không còn ô nào chờ.
  const pendingUploads = useRef(new Map<string, number>());
  const uploadSeq = useRef(0);
  const [uploading, setUploading] = useState<string[]>([]);
  const syncUploading = () => setUploading([...pendingUploads.current.keys()]);
  const { settings, loadError, saving, saveError, setSaveError, conflict, reload, submit } =
    useRevisionedSettings<StoreHomeSettings>({
      form,
      load: getStoreHomeAPI,
      save: saveStoreHomeAPI,
      onLoaded: data => setStoryOn(data.brandStory !== null)
    });

  const uploadImage = async (name: ImagePath, file: File) => {
    if (!mayUpdate(useAppStore.getState().profile) || saving) return;
    const key = imageKey(name);
    const token = ++uploadSeq.current;
    const isLatest = () => pendingUploads.current.get(key) === token;
    pendingUploads.current.set(key, token);
    syncUploading();
    setSaveError(null);
    try {
      const { data } = await uploadImageAPI(file);
      if (isLatest()) form.setFieldValue(name, data.path);
    } catch (cause) {
      if (isLatest()) setSaveError(getErrorMessage(cause));
    } finally {
      if (isLatest()) {
        pendingUploads.current.delete(key);
        syncUploading();
      }
    }
  };

  const discardDraft = () => {
    pendingUploads.current.clear();
    syncUploading();
    reload();
  };

  const save = async () => {
    if (!mayUpdate(useAppStore.getState().profile) || saving || conflict || uploading.length > 0)
      return;
    const values = await form.validateFields().catch(() => null);
    if (!values || !mayUpdate(useAppStore.getState().profile)) return;
    // Công tắc tắt: các ô ẩn không có trong values nhưng vẫn giữ bản nháp khi bật lại
    const brandStory = storyOn && values.brandStory ? toBrandStory(values.brandStory) : null;
    await submit({ ...values, brandStory });
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify='space-between' align='center' gap={12} wrap>
        <div>
          <Typography.Title level={2} className='mb-1!'>
            Trang chủ
          </Typography.Title>
          <Typography.Text type='secondary'>
            Các khối trên trang chủ cửa hàng, theo thứ tự từ trên xuống.
          </Typography.Text>
        </div>
        {STOREFRONT_URL && (
          <Button href={STOREFRONT_URL} target='_blank' rel='noreferrer' icon={<ExportOutlined />}>
            Xem cửa hàng
          </Button>
        )}
      </Flex>
      <Card
        title={
          <BlockTitle position={1} hint='Lưu ngay từng dòng'>
            Banner carousel
          </BlockTitle>
        }
      >
        <BannerBlock />
      </Card>
      {loadError ? (
        <Result
          status='error'
          title='Không tải được nội dung trang chủ'
          subTitle={loadError}
          extra={<Button onClick={discardDraft}>Thử lại</Button>}
        />
      ) : !settings ? (
        <Flex justify='center' className='py-16'>
          <Spin />
        </Flex>
      ) : (
        <>
          {conflict && (
            <Alert
              type='warning'
              showIcon
              title={CONFLICT_MESSAGE}
              action={
                <Button size='small' onClick={discardDraft}>
                  Tải lại
                </Button>
              }
            />
          )}
          {saveError && <Alert type='error' showIcon title={saveError} />}
          <Form<StoreHomeSettings>
            form={form}
            layout='vertical'
            initialValues={settings}
            disabled={saving || !canUpdate}
          >
            <Flex vertical gap={16}>
              <Card
                title={
                  <BlockTitle position={2} hint='2 ô dưới banner'>
                    Ô khuyến mãi
                  </BlockTitle>
                }
              >
                <Flex gap={16} wrap>
                  {[0, 1].map(index => (
                    <div key={index} className='min-w-80 flex-1'>
                      <TileFields
                        index={index}
                        uploading={uploading.includes(imageKey(tileImage(index)))}
                        onUpload={file => uploadImage(tileImage(index), file)}
                      />
                    </div>
                  ))}
                </Flex>
              </Card>
              <Card
                title={<BlockTitle position={3}>Câu chuyện thương hiệu</BlockTitle>}
                extra={
                  <Flex align='center' gap={8}>
                    <span id='brand-story-toggle'>Hiển thị trên trang chủ</span>
                    <Switch
                      aria-labelledby='brand-story-toggle'
                      checked={storyOn}
                      onChange={value => {
                        if (mayUpdate(useAppStore.getState().profile)) setStoryOn(value);
                      }}
                    />
                  </Flex>
                }
              >
                {storyOn ? (
                  <BrandStoryFields uploading={uploading} onUpload={uploadImage} />
                ) : (
                  <Typography.Text type='secondary'>Đang ẩn trên trang chủ.</Typography.Text>
                )}
              </Card>
              <Card
                title={
                  <BlockTitle position={4} hint='4 ô cuối trang'>
                    Cam kết
                  </BlockTitle>
                }
              >
                {HOME_PROMISE_LABELS.map((label, index) => (
                  <Flex key={label} gap={12}>
                    <Form.Item
                      className='flex-1'
                      name={["homePromises", index, "title"]}
                      label={`Ô ${index + 1} · ${label} — tiêu đề`}
                      rules={[required("Vui lòng nhập tiêu đề")]}
                    >
                      <Input maxLength={40} />
                    </Form.Item>
                    <Form.Item
                      className='flex-1'
                      name={["homePromises", index, "description"]}
                      label={`Ô ${index + 1} · ${label} — mô tả`}
                      rules={[required("Vui lòng nhập mô tả")]}
                    >
                      <Input maxLength={60} />
                    </Form.Item>
                  </Flex>
                ))}
              </Card>
            </Flex>
          </Form>
          <Flex justify='end'>
            <Button
              type='primary'
              loading={saving}
              disabled={!canUpdate || conflict || uploading.length > 0}
              onClick={save}
            >
              Lưu trang chủ
            </Button>
          </Flex>
        </>
      )}
    </Flex>
  );
}
