import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App, Button, Flex, Form, Spin, Tag, Typography } from "antd";
import { Link, useNavigate, useParams } from "react-router";
import {
  changeProductStatusAPI,
  createProductAPI,
  getProductAPI,
  updateProductAPI,
  type CategoryOption,
  type ProductEditorView,
  type ProductStatus,
  type ProductWriteInput,
  type PublishRequirement
} from "@/services/products";
import { PATH } from "@/constants/paths";
import useUnsavedOrderWarning from "@/hooks/useUnsavedOrderWarning";
import { listCategoriesAPI } from "@/services/categories";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorNotification, successNotification } from "@/utils/notification";
import { buildGrid, clearImage, lockedValueIds, toSlug, toVariantPayload } from "./variant-grid";
import type { GridRow } from "./variant-grid";
import { mapProductError, type SentVariant } from "./product-errors";
import { productStatusLabels } from "./product-list-query";
import { impactOf } from "./combo-impact";
import { useComboImpact } from "./useComboImpact";
import type { ComboRef } from "@/services/combos";
import ProductInfoSection from "./ProductInfoSection";
import ProductImagesSection from "./ProductImagesSection";
import ProductOptionsSection, { type OptionState } from "./ProductOptionsSection";
import { useAttributeCatalog } from "./useAttributeCatalog";
import VariantGrid, { type CellErrors } from "./VariantGrid";
import ProductSeoSection from "./ProductSeoSection";
import PublishChecklist from "./PublishChecklist";
import {
  DESCRIPTION_IMAGE_INVALID,
  hasInvalidDescriptionImage,
  publishMissing
} from "./product-publish";

// RichEditor emits HTML 300 ms after the last change — wait long enough that Save right after
// typing still sends the last keystroke (Policies PolicyModal)
const EDITOR_SETTLE_MS = 400;
const CONFLICT_MESSAGE = "Sản phẩm đã thay đổi ở nơi khác. Tải lại để bỏ bản nháp trước khi lưu.";
const GRID_INVALID_MESSAGE = "Kiểm tra lại các ô được đánh dấu trong bảng biến thể";
const REQUIRED = "Bắt buộc";
const UNSAVED_COPY = {
  title: "Sản phẩm chưa được lưu",
  content: "Rời trang sẽ bỏ các thay đổi chưa lưu."
};
const statusMessages: Partial<Record<ProductStatus, string>> = {
  UNPUBLISH: "Đã ngừng bán sản phẩm",
  DRAFT: "Đã khôi phục sản phẩm",
  DELETED: "Đã lưu trữ sản phẩm"
};

interface FormValues {
  name: string;
  refundEnabled: boolean;
  slug?: string;
  categoryIds?: string[];
  seo?: { metaTitle?: string; metaDescription?: string; metaKeywords?: string[] };
}

const productDetailPath = (id: string) =>
  PATH.PRODUCT_DETAIL.replace(":id", encodeURIComponent(id));
const selections = (options: OptionState[]) =>
  options
    .filter(option => option.valueIds.length)
    .map(({ attributeId, valueIds }) => ({ attributeId, valueIds }));
const optionsOf = (view: ProductEditorView): OptionState[] =>
  view.options.map(option => ({
    attributeId: option.attributeId,
    attributeName: option.attributeName,
    valueIds: option.values.map(value => value._id)
  }));
const sentRows = (rows: GridRow[]) => rows.filter(row => row.saved || row.include);

/** Required cells of every row that will be sent; the server checks the rest. */
function validateRows(rows: GridRow[]): CellErrors {
  const errors: CellErrors = {};
  for (const row of sentRows(rows)) {
    const cells = {
      ...(!row.sku.trim() && { sku: REQUIRED }),
      ...(row.price === null && { price: REQUIRED }),
      ...(row.originalPrice === null && { originalPrice: REQUIRED }),
      ...(!row.saved && row.inventoryCount === null && { inventoryCount: REQUIRED })
    };
    if (Object.keys(cells).length) errors[row.key] = cells;
  }
  return errors;
}

function ProductEditorPage({ id }: { id?: string }) {
  const navigate = useNavigate();
  const comboImpact = useComboImpact();
  const { modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [product, setProduct] = useState<ProductEditorView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [categories, setCategories] = useState<{ options: CategoryOption[]; error: string | null }>(
    { options: [], error: null }
  );
  const [options, setOptions] = useState<OptionState[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [rows, setRows] = useState<GridRow[]>(() => buildGrid([], [], []));
  const [description, setDescription] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<CellErrors>({});
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState<PublishRequirement[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Latest editor HTML for Save; the state copy drives the checklist
  const html = useRef("");
  // An editor with initial content emits once after mount — that emission is the baseline
  const awaitingMountEmission = useRef(false);
  const baselineHtml = useRef<string | null>(null);
  const categoryIds = (Form.useWatch("categoryIds", form) as string[] | undefined) ?? [];
  const slug = (Form.useWatch("slug", form) as string | undefined) ?? "";
  const catalog = useAttributeCatalog(options.map(option => option.attributeId));

  const applyView = useCallback(
    (view: ProductEditorView, keep?: GridRow[]) => {
      const nextOptions = optionsOf(view);
      // Saved rows take the server copy (normalized SKU, current stock); unsaved rows keep their edits
      const unsaved = (keep ?? []).filter(row => !row.saved);
      const grid = buildGrid(selections(nextOptions), view.variants, unsaved);
      setProduct(view);
      setOptions(nextOptions);
      setImages(view.images);
      // Unsaved combinations of a loaded product start skipped; after a save, skipped stay skipped
      setRows(keep ? grid : grid.map(row => (row.saved ? row : { ...row, include: false })));
      form.setFieldsValue({
        name: view.name,
        refundEnabled: view.refundEnabled,
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
      setCellErrors({});
      setDescriptionError(null);
    },
    [form]
  );

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getProductAPI(id, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) applyView(data);
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      }
    );
    return () => controller.abort();
  }, [id, attempt, applyView]);

  useEffect(() => {
    const controller = new AbortController();
    listCategoriesAPI(controller.signal).then(
      ({ data }) => setCategories({ options: Array.isArray(data) ? data : [], error: null }),
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setCategories({ options: [], error: getErrorMessage(cause) });
      }
    );
    return () => controller.abort();
  }, []);

  const readOnly = product?.status === "DELETED";
  useUnsavedOrderWarning(dirty && !readOnly, UNSAVED_COPY);
  // Declared after the blocker so its effect already sees the saved (clean) state
  useEffect(() => {
    if (createdId) navigate(productDetailPath(createdId), { replace: true });
  }, [createdId, navigate]);

  const savedVariants = product?.variants ?? [];
  const valueLabels = new Map<string, string>([
    ...Object.values(catalog.values).flatMap(values =>
      values.map(value => [value._id, value.value] as const)
    ),
    ...(product?.options ?? []).flatMap(option =>
      option.values.map(value => [value._id, value.value] as const)
    )
  ]);
  const labelsOf = (row: GridRow) =>
    row.attributeValues.map(value => valueLabels.get(value) ?? "?");
  const missing = publishMissing({ images, categoryIds, description, rows });

  const changeOptions = (next: OptionState[]) => {
    setOptions(next);
    setRows(previous => buildGrid(selections(next), savedVariants, previous));
    setDirty(true);
  };
  const changeRows = (next: GridRow[], touched: string[]) => {
    setRows(next);
    setCellErrors(previous =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => !touched.includes(key)))
    );
    setDirty(true);
  };
  const removeImage = (url: string) => {
    const remove = () => {
      setImages(previous => previous.filter(image => image !== url));
      setRows(previous => clearImage(previous, url));
      setDirty(true);
    };
    if (!rows.some(row => row.image === url)) return remove();
    modal.confirm({
      title: "Ảnh đang được dùng cho biến thể",
      content: "Xóa ảnh này sẽ bỏ ảnh khỏi các biến thể đang dùng nó.",
      okText: "Xóa và bỏ ảnh khỏi biến thể",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      onOk: remove
    });
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
  const onValuesChange = (changed: Partial<FormValues>) => {
    setDirty(true);
    if ("slug" in changed) setSlugTouched(true);
    else if ("name" in changed && !slugTouched)
      form.setFieldValue("slug", toSlug(changed.name ?? ""));
  };

  const showError = (cause: unknown, sent: SentVariant[]) => {
    if (!(cause instanceof ApiError)) return setError(getErrorMessage(cause));
    const mapped = mapProductError(cause, sent);
    if (mapped.stale) setConflict(true);
    else if (mapped.field?.toString() === "description") setDescriptionError(mapped.message);
    else if (mapped.field) form.setFields([{ name: mapped.field, errors: [mapped.message] }]);
    else if (mapped.variantKey)
      setCellErrors({ [mapped.variantKey]: { [mapped.variantField ?? "row"]: mapped.message } });
    else if (mapped.missing?.length) setServerMissing(mapped.missing);
    else setError(mapped.message);
  };

  const buildInput = (values: FormValues): ProductWriteInput => {
    const typedSlug = values.slug?.trim();
    return {
      name: values.name.trim(),
      refundEnabled: values.refundEnabled,
      // A new product's untouched slug is only a preview: the server picks a free one
      ...(slugTouched && typedSlug && { slug: typedSlug }),
      description: html.current,
      images,
      categoryIds: values.categoryIds ?? [],
      seo: {
        metaTitle: values.seo?.metaTitle?.trim() ?? "",
        metaDescription: values.seo?.metaDescription?.trim() ?? "",
        metaKeywords: values.seo?.metaKeywords ?? []
      },
      options: selections(options).map(({ attributeId, valueIds }) => ({
        attributeId,
        optionValues: valueIds
      })),
      variants: toVariantPayload(rows)
    };
  };

  const save = async (publish: boolean) => {
    if (saving || conflict || readOnly) return;
    setSaving(true);
    setError(null);
    setServerMissing([]);
    setDescriptionError(null);
    const sent = sentRows(rows).map(({ key, sku }) => ({ key, sku }));
    try {
      await new Promise(resolve => setTimeout(resolve, EDITOR_SETTLE_MS));
      const values = await form.validateFields().catch(() => null);
      const gridErrors = validateRows(rows);
      setCellErrors(gridErrors);
      if (!values) return setError("Kiểm tra lại thông tin sản phẩm");
      if (Object.keys(gridErrors).length) return setError(GRID_INVALID_MESSAGE);
      // The server would silently empty these (data: from file insert, http:, other paths)
      if (hasInvalidDescriptionImage(html.current)) {
        return setDescriptionError(DESCRIPTION_IMAGE_INVALID);
      }
      const input = buildInput(values);
      const changes = impactOf(savedVariants, rows);
      let affected: ComboRef[] = [];
      if (product && (changes.priceChanged || changes.deactivated)) {
        const confirmed = await comboImpact.confirm(
          product._id,
          changes.deactivated ? "Ngừng bán biến thể sản phẩm này?" : "Thay đổi giá sản phẩm này?"
        );
        if (confirmed === null) return;
        affected = confirmed;
      }
      let view: ProductEditorView;
      try {
        view = product
          ? (await updateProductAPI(product._id, { ...input, expectedRevision: product.revision }))
              .data
          : (await createProductAPI(input)).data;
      } catch (cause) {
        return showError(cause, sent);
      }
      applyView(view, rows);
      let published = false;
      if (publish) {
        try {
          view = (
            await changeProductStatusAPI(view._id, {
              status: "PUBLISH",
              expectedRevision: view.revision
            })
          ).data;
          applyView(view, rows);
          published = true;
        } catch (cause) {
          // The draft is saved; the checklist shows what the server still wants. A new product
          // remounts on its detail URL, which would drop an inline error.
          if (product) showError(cause, []);
          else
            errorNotification(`Đã lưu nháp nhưng chưa đăng bán được: ${getErrorMessage(cause)}`, {
              duration: 0
            });
        }
      }
      successNotification(published ? "Đã lưu và đăng bán sản phẩm" : "Đã lưu sản phẩm");
      if (changes.deactivated) comboImpact.notify(affected);
      if (!product) setCreatedId(view._id);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: ProductStatus) => {
    if (!product || saving) return;
    setSaving(true);
    setError(null);
    try {
      let affected: ComboRef[] = [];
      if (status === "UNPUBLISH" || status === "DELETED") {
        const confirmed = await comboImpact.confirm(
          product._id,
          status === "UNPUBLISH" ? "Ngừng bán sản phẩm này?" : "Lưu trữ sản phẩm này?"
        );
        if (confirmed === null) return;
        affected = confirmed;
      }
      const { data } = await changeProductStatusAPI(product._id, {
        status,
        expectedRevision: product.revision
      });
      applyView(data);
      successNotification(statusMessages[status] ?? "Đã cập nhật trạng thái");
      comboImpact.notify(affected);
    } catch (cause) {
      showError(cause, []);
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    setProduct(null);
    setLoadError(null);
    setConflict(false);
    setError(null);
    setServerMissing([]);
    setAttempt(value => value + 1);
  };

  if (id && !product)
    return loadError ? (
      <Alert
        type='error'
        title={`Không tải được sản phẩm: ${loadError}`}
        action={<Button onClick={reload}>Thử lại</Button>}
      />
    ) : (
      <Spin aria-label='Đang tải sản phẩm' />
    );

  const locked = lockedValueIds(savedVariants);
  const busy = saving || readOnly;
  return (
    <section className='min-w-0'>
      <Flex align='center' gap={12} className='mb-4'>
        <Typography.Title level={2} className='mb-0!'>
          {product ? product.name : "Thêm sản phẩm"}
        </Typography.Title>
        {product && <Tag>{productStatusLabels[product.status]}</Tag>}
      </Flex>
      {readOnly && (
        <Alert
          type='info'
          showIcon
          className='mb-4'
          title='Sản phẩm đã lưu trữ — chỉ xem. Khôi phục để chỉnh sửa.'
          action={
            <Button loading={saving} onClick={() => void changeStatus("DRAFT")}>
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
          initialValues={{ refundEnabled: true }}
          disabled={busy}
          className='min-w-0 flex-1'
          onValuesChange={onValuesChange}
        >
          <Flex vertical gap={16}>
            <ProductInfoSection
              categories={categories.options}
              categoriesError={categories.error}
              slugRequired={!!product}
              editorKey={editorKey}
              initialDescription={product?.description ?? ""}
              descriptionError={descriptionError}
              disabled={busy}
              onDescriptionChange={onDescriptionChange}
            />
            <ProductImagesSection
              images={images}
              disabled={busy}
              onChange={next => {
                setImages(next);
                setDirty(true);
              }}
              onAdd={added => {
                setImages(previous => [...previous, ...added]);
                setDirty(true);
              }}
              onRemove={removeImage}
            />
            <ProductOptionsSection
              options={options}
              savedOrder={Object.fromEntries(
                (product?.options ?? []).map(option => [
                  option.attributeId,
                  option.values.map(value => value._id)
                ])
              )}
              productValues={Object.fromEntries(
                (product?.options ?? []).map(option => [option.attributeId, option.values])
              )}
              catalog={catalog}
              locked={locked}
              hasSavedVariants={savedVariants.length > 0}
              disabled={busy}
              onChange={changeOptions}
            />
            {product && (
              <Flex justify='end'>
                <Link to={`${PATH.INVENTORY}?productId=${encodeURIComponent(product._id)}`}>
                  Xem tồn kho
                </Link>
              </Flex>
            )}
            <VariantGrid
              rows={rows}
              labelsOf={labelsOf}
              images={images}
              slug={slug || product?.slug || ""}
              errors={cellErrors}
              disabled={busy}
              onChange={changeRows}
            />
            <ProductSeoSection />
          </Flex>
        </Form>
        <Flex vertical gap={12} style={{ width: 280 }} className='sticky top-4'>
          <PublishChecklist missing={missing} serverMissing={serverMissing} />
          {!readOnly && (
            <>
              <Button
                type='primary'
                loading={saving}
                disabled={conflict}
                onClick={() => void save(false)}
              >
                Lưu
              </Button>
              {product?.status !== "PUBLISH" && (
                <Button
                  disabled={conflict || saving || missing.length > 0}
                  onClick={() => void save(true)}
                >
                  Lưu & Đăng bán
                </Button>
              )}
              {product?.status === "PUBLISH" && (
                <Button
                  disabled={conflict || saving || dirty}
                  onClick={() => changeStatus("UNPUBLISH")}
                >
                  Ngừng bán
                </Button>
              )}
              {product && (
                <Button
                  danger
                  disabled={conflict || saving || dirty}
                  onClick={() => changeStatus("DELETED")}
                >
                  Lưu trữ
                </Button>
              )}
              {dirty && product && (
                <Typography.Text type='secondary'>
                  Lưu thay đổi trước khi ngừng bán hoặc lưu trữ.
                </Typography.Text>
              )}
            </>
          )}
        </Flex>
      </Flex>
    </section>
  );
}

// useUnsavedOrderWarning needs the modal from antd <App> (as AttributeDetail)
export default function ProductEditor() {
  const { id } = useParams();
  const accountId = useAppStore(state => state.profile?._id);
  return accountId ? (
    <App component={false}>
      <ProductEditorPage key={`${accountId}:${id ?? "new"}`} id={id} />
    </App>
  ) : null;
}
