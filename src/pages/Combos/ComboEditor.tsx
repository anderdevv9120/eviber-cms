import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Popconfirm,
  Select,
  Spin,
  Tag,
  Typography
} from "antd";
import { Link, useNavigate, useParams } from "react-router";
import { RichEditor } from "@/components/RichEditor";
import { PATH } from "@/constants/paths";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import {
  listProductCategoriesAPI,
  type CategoryOption,
  type ProductStatus
} from "@/services/products";
import {
  changeComboStatusAPI,
  createComboAPI,
  getComboAPI,
  updateComboAPI,
  type ComboEditorView,
  type ComboPricing,
  type ComboPublishRequirement,
  type ComboWriteInput
} from "@/services/combos";
import { useAppStore } from "@/store/useAppStore";
import { uploadImageAPI } from "@/services/banners";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorNotification, successNotification } from "@/utils/notification";
import { ApiError } from "@/utils/request";
import { toSlug } from "@/pages/Products/variant-grid";
import ProductImagesSection from "@/pages/Products/ProductImagesSection";
import ProductSeoSection from "@/pages/Products/ProductSeoSection";
import {
  DESCRIPTION_IMAGE_INVALID,
  hasInvalidDescriptionImage
} from "@/pages/Products/product-publish";
import ComboPiecesSection, { type ComboPieceRow, type PieceErrors } from "./ComboPiecesSection";
import ComboPriceSection from "./ComboPriceSection";
import ComboPublishChecklist from "./ComboPublishChecklist";
import { comboPreview } from "./combo-pricing";
import { comboPublishMissing, validateComboPieces } from "./combo-publish";
import { mapComboError } from "./combo-errors";
import { productStatusLabels } from "./combo-list-query";

const EDITOR_SETTLE_MS = 400;
const CONFLICT_MESSAGE = "Combo đã thay đổi ở nơi khác. Tải lại để bỏ bản nháp trước khi lưu.";
const UNSAVED_COPY = {
  title: "Combo chưa được lưu",
  content: "Rời trang sẽ bỏ các thay đổi chưa lưu."
};

interface FormValues {
  name: string;
  slug?: string;
  categoryIds?: string[];
  seo?: { metaTitle?: string; metaDescription?: string; metaKeywords?: string[] };
}

const detailPath = (id: string) => PATH.COMBO_DETAIL.replace(":id", encodeURIComponent(id));
const rowsOf = (view: ComboEditorView): ComboPieceRow[] =>
  view.items.map(item => ({
    _id: item.productId,
    productId: item.productId,
    quantity: item.quantity,
    mode: item.mode,
    variantId: item.variantId,
    product: item.product
  }));

function ComboEditorPage({ id }: { id?: string }) {
  const navigate = useNavigate();
  App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [combo, setCombo] = useState<ComboEditorView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [categories, setCategories] = useState<{ options: CategoryOption[]; error: string | null }>(
    {
      options: [],
      error: null
    }
  );
  const [pieces, setPieces] = useState<ComboPieceRow[]>([]);
  const [pieceErrors, setPieceErrors] = useState<PieceErrors>({});
  const [pricing, setPricing] = useState<ComboPricing>({ mode: "PERCENT", value: 10 });
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState<ComboPublishRequirement[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const html = useRef("");
  const pendingImages = useRef(new Map<string, File>());
  const awaitingMountEmission = useRef(false);
  const baselineHtml = useRef<string | null>(null);
  const categoryIds = (Form.useWatch("categoryIds", form) as string[] | undefined) ?? [];
  const name = (Form.useWatch("name", form) as string | undefined) ?? "";

  const applyView = useCallback(
    (view: ComboEditorView) => {
      setCombo(view);
      setPieces(rowsOf(view));
      setPricing(view.pricing);
      for (const preview of pendingImages.current.keys()) URL.revokeObjectURL(preview);
      pendingImages.current.clear();
      setImages(view.images);
      form.setFieldsValue({
        name: view.name,
        slug: view.slug,
        categoryIds: view.categoryIds,
        seo: view.seo
      });
      html.current = view.description ?? "";
      setDescription(html.current);
      baselineHtml.current = null;
      awaitingMountEmission.current = !!view.description;
      setEditorKey(value => value + 1);
      setSlugTouched(true);
      setDirty(false);
      setPieceErrors({});
      setDescriptionError(null);
    },
    [form]
  );

  useEffect(() => {
    const pending = pendingImages.current;
    return () => {
      for (const preview of pending.keys()) URL.revokeObjectURL(preview);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getComboAPI(id).then(
      ({ data }) => {
        if (active) applyView(data);
      },
      (cause: unknown) => {
        if (active) setLoadError(getErrorMessage(cause));
      }
    );
    return () => {
      active = false;
    };
  }, [id, attempt, applyView]);

  useEffect(() => {
    const controller = new AbortController();
    listProductCategoriesAPI(controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted)
          setCategories({ options: Array.isArray(data) ? data : [], error: null });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setCategories({ options: [], error: getErrorMessage(cause) });
      }
    );
    return () => controller.abort();
  }, []);

  const readOnly = combo?.status === "DELETED";
  useUnsavedOrderWarning(dirty && !readOnly, UNSAVED_COPY);
  useEffect(() => {
    if (createdId) navigate(detailPath(createdId), { replace: true });
  }, [createdId, navigate]);

  const products = pieces.flatMap(row => (row.product ? [row.product] : []));
  const missing = comboPublishMissing({ categoryIds, items: pieces, products });
  const preview = comboPreview(pricing, pieces, products);
  const fixedPriceMax = pieces.length === 0 ? 0 : preview.priciest?.normal;
  const maxPrice = pricing.mode === "PERCENT" ? 100 : fixedPriceMax;
  const invalidPrice =
    !Number.isSafeInteger(pricing.value) ||
    pricing.value < 0 ||
    (maxPrice !== undefined && pricing.value > maxPrice);
  const canPublish =
    missing.length === 0 &&
    Object.keys(validateComboPieces(pieces)).length === 0 &&
    !invalidPrice &&
    !!name.trim();
  const busy = saving || readOnly;

  const onValuesChange = (changed: Partial<FormValues>) => {
    setDirty(true);
    if ("slug" in changed) setSlugTouched(true);
    else if ("name" in changed && !slugTouched)
      form.setFieldValue("slug", toSlug(changed.name ?? ""));
  };
  const onDescriptionChange = (next: string) => {
    html.current = next;
    setDescription(next);
    if (awaitingMountEmission.current) {
      awaitingMountEmission.current = false;
      baselineHtml.current = next;
      return;
    }
    if (next !== baselineHtml.current) setDirty(true);
  };

  const buildInput = (values: FormValues): ComboWriteInput => {
    const slug = values.slug?.trim();
    return {
      name: values.name.trim(),
      ...(slugTouched && slug && { slug }),
      description: html.current,
      images,
      categoryIds: values.categoryIds ?? [],
      seo: {
        metaTitle: values.seo?.metaTitle?.trim() ?? "",
        metaDescription: values.seo?.metaDescription?.trim() ?? "",
        metaKeywords: values.seo?.metaKeywords ?? []
      },
      items: pieces.map(({ productId, quantity, mode, variantId }) => ({
        productId,
        quantity,
        mode,
        variantId: mode === "LOCKED" ? variantId : null
      })),
      pricing
    };
  };

  const showError = (cause: unknown, sent: Array<{ key: string }>) => {
    if (!(cause instanceof ApiError)) return setError(getErrorMessage(cause));
    const mapped = mapComboError(cause, sent);
    if (mapped.stale) setConflict(true);
    else if (mapped.itemKey) setPieceErrors({ [mapped.itemKey]: mapped.message });
    else if (mapped.field?.toString().startsWith("items"))
      setPieceErrors({ _form: mapped.message });
    else if (mapped.field) form.setFields([{ name: mapped.field, errors: [mapped.message] }]);
    else if (mapped.missing?.length) setServerMissing(mapped.missing);
    else setError(mapped.message);
  };

  const save = async (publish: boolean) => {
    if (saving || conflict || readOnly) return;
    setSaving(true);
    setError(null);
    setServerMissing([]);
    setDescriptionError(null);
    setPieceErrors({});
    try {
      await new Promise(resolve => setTimeout(resolve, EDITOR_SETTLE_MS));
      const values = await form.validateFields().catch(() => null);
      const validation = validateComboPieces(pieces);
      setPieceErrors(validation);
      if (!values?.name?.trim()) return setError("Kiểm tra lại thông tin combo.");
      if (Object.keys(validation).length) return;
      if (invalidPrice)
        return setError(
          pricing.mode === "PERCENT"
            ? "Phần trăm giảm phải là số nguyên từ 0 đến 100."
            : "Giá cố định phải là số nguyên từ 0 đến tổng giá combo."
        );
      if (hasInvalidDescriptionImage(html.current))
        return setDescriptionError(DESCRIPTION_IMAGE_INVALID);
      if (publish && !canPublish) return setError("Chưa đủ điều kiện đăng bán combo.");
      const input = buildInput(values);
      const selectedImages = input.images.map(url => ({
        url,
        file: pendingImages.current.get(url)
      }));
      const uploadedImages: string[] = [];
      try {
        for (const { url, file } of selectedImages) {
          if (!file) {
            uploadedImages.push(url);
            continue;
          }
          const path = (await uploadImageAPI(file)).data.path;
          uploadedImages.push(path);
          setImages(previous => previous.map(image => (image === url ? path : image)));
          pendingImages.current.delete(url);
          URL.revokeObjectURL(url);
        }
      } catch (cause) {
        return setError(getErrorMessage(cause));
      }
      input.images = uploadedImages;
      let view: ComboEditorView;
      try {
        view = combo
          ? (await updateComboAPI(combo._id, { ...input, expectedRevision: combo.revision })).data
          : (await createComboAPI(input)).data;
      } catch (cause) {
        return showError(
          cause,
          pieces.map(row => ({ key: row._id }))
        );
      }
      applyView(view);
      let published = false;
      if (publish) {
        try {
          view = (
            await changeComboStatusAPI(view._id, {
              status: "PUBLISH",
              expectedRevision: view.revision
            })
          ).data;
          applyView(view);
          published = true;
        } catch (cause) {
          if (combo) showError(cause, []);
          else
            errorNotification(`Đã lưu nháp nhưng chưa đăng bán được: ${getErrorMessage(cause)}`, {
              duration: 0
            });
        }
      }
      successNotification(published ? "Đã lưu và đăng bán combo" : "Đã lưu combo");
      if (!combo) setCreatedId(view._id);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: ProductStatus) => {
    if (!combo || saving || dirty) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await changeComboStatusAPI(combo._id, {
        status,
        expectedRevision: combo.revision
      });
      applyView(data);
      successNotification("Đã cập nhật trạng thái combo");
    } catch (cause) {
      showError(cause, []);
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    setCombo(null);
    setLoadError(null);
    setConflict(false);
    setError(null);
    setServerMissing([]);
    setAttempt(value => value + 1);
  };

  if (id && !combo)
    return loadError ? (
      <Alert
        type='error'
        title={`Không tải được combo: ${loadError}`}
        action={<Button onClick={reload}>Thử lại</Button>}
      />
    ) : (
      <Spin aria-label='Đang tải combo' />
    );

  return (
    <section className='min-w-0'>
      <Link to={PATH.COMBOS}>Danh sách combo</Link>
      <Flex align='center' gap={12} className='mb-4'>
        <Typography.Title level={2} className='mb-0!'>
          {combo ? combo.name : "Thêm combo"}
        </Typography.Title>
        {combo && <Tag>{productStatusLabels[combo.status]}</Tag>}
      </Flex>
      {readOnly && (
        <Alert
          type='info'
          showIcon
          className='mb-4'
          title='Combo đã lưu trữ — chỉ xem. Khôi phục để chỉnh sửa.'
          action={
            <Button loading={saving} onClick={() => changeStatus("DRAFT")}>
              Khôi phục
            </Button>
          }
        />
      )}
      {conflict && (
        <Alert
          type='warning'
          showIcon
          className='mb-4'
          title={CONFLICT_MESSAGE}
          action={
            <Button size='small' onClick={reload}>
              Tải lại
            </Button>
          }
        />
      )}
      {error && <Alert type='error' showIcon className='mb-4' title={error} />}
      <Flex gap={16} align='start'>
        <Form
          form={form}
          layout='vertical'
          disabled={busy}
          className='min-w-0 flex-1'
          initialValues={{ categoryIds: [], seo: { metaKeywords: [] } }}
          onValuesChange={onValuesChange}
        >
          <Flex vertical gap={16}>
            <Card title='Thông tin'>
              <Form.Item
                label='Tên combo'
                name='name'
                rules={[{ required: true, whitespace: true, message: "Nhập tên combo" }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                label='Đường dẫn'
                name='slug'
                extra='Tự theo tên cho tới lần lưu đầu tiên. Đổi đường dẫn làm hỏng link cũ.'
                rules={[{ required: !!combo, whitespace: true, message: "Nhập đường dẫn" }]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                label='Danh mục'
                name='categoryIds'
                extra={
                  categories.error ? `Không tải được danh mục: ${categories.error}` : undefined
                }
              >
                <Select
                  mode='multiple'
                  aria-label='Danh mục'
                  placeholder='Chọn danh mục'
                  optionFilterProp='label'
                  options={categories.options.map(({ _id, name }) => ({ value: _id, label: name }))}
                />
              </Form.Item>
              <Form.Item
                label='Mô tả'
                validateStatus={descriptionError ? "error" : undefined}
                help={descriptionError ?? undefined}
              >
                <div inert={busy} aria-disabled={busy}>
                  <RichEditor
                    key={editorKey}
                    initialHtml={description}
                    onChange={onDescriptionChange}
                  />
                </div>
              </Form.Item>
            </Card>
            <ProductImagesSection
              title='Ảnh combo'
              images={images}
              disabled={busy}
              onChange={next => {
                setImages(next);
                setDirty(true);
              }}
              onAdd={urls => {
                setImages(previous => [...previous, ...urls]);
                setDirty(true);
              }}
              onSelectFiles={files => {
                const previews = files.map(file => {
                  const preview = URL.createObjectURL(file);
                  pendingImages.current.set(preview, file);
                  return preview;
                });
                setImages(previous => [...previous, ...previews]);
                setDirty(true);
              }}
              onRemove={url => {
                if (pendingImages.current.delete(url)) URL.revokeObjectURL(url);
                setImages(previous => previous.filter(image => image !== url));
                setDirty(true);
              }}
            />
            {images.length === 0 && (
              <Typography.Text type='secondary'>
                Không có ảnh: thẻ combo dùng ảnh các món
              </Typography.Text>
            )}
            <ComboPiecesSection
              items={pieces}
              errors={pieceErrors}
              disabled={busy}
              onChange={next => {
                setPieces(next);
                setPieceErrors({});
                setDirty(true);
              }}
            />
            <ComboPriceSection
              pricing={pricing}
              maxPrice={maxPrice}
              {...preview}
              disabled={busy}
              onChange={next => {
                setPricing(next);
                setDirty(true);
              }}
            />
            <ProductSeoSection />
          </Flex>
        </Form>
        <Flex vertical gap={12} style={{ width: 280 }} className='sticky top-4'>
          <ComboPublishChecklist missing={missing} serverMissing={serverMissing} />
          {!readOnly && (
            <>
              <Button
                type='primary'
                loading={saving}
                disabled={conflict}
                onClick={() => save(false)}
              >
                Lưu
              </Button>
              {combo?.status !== "PUBLISH" && (
                <Button disabled={conflict || saving || !canPublish} onClick={() => save(true)}>
                  Lưu &amp; Đăng bán
                </Button>
              )}
              {combo?.status === "PUBLISH" && (
                <Popconfirm
                  title='Ngừng bán combo này?'
                  okText='Ngừng bán'
                  cancelText='Hủy'
                  onConfirm={() => changeStatus("UNPUBLISH")}
                >
                  <Button disabled={conflict || saving || dirty}>Ngừng bán</Button>
                </Popconfirm>
              )}
              {combo && (
                <Popconfirm
                  title='Lưu trữ combo này?'
                  okText='Lưu trữ'
                  cancelText='Hủy'
                  okButtonProps={{ danger: true }}
                  onConfirm={() => changeStatus("DELETED")}
                >
                  <Button danger disabled={conflict || saving || dirty}>
                    Lưu trữ
                  </Button>
                </Popconfirm>
              )}
              {dirty && combo && (
                <Typography.Text type='secondary'>
                  Lưu thay đổi trước khi chuyển trạng thái.
                </Typography.Text>
              )}
            </>
          )}
        </Flex>
      </Flex>
    </section>
  );
}

export default function ComboEditor() {
  const { id } = useParams();
  const accountId = useAppStore(state => state.profile?._id);
  return accountId ? (
    <App component={false}>
      <ComboEditorPage key={`${accountId}:${id ?? "new"}`} id={id} />
    </App>
  ) : null;
}
