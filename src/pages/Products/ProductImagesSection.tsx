import { useRef, useState } from "react";
import { Alert, Button, Card, Flex, Tag } from "antd";
import SortableTable from "@/components/SortableTable";
import { uploadImageAPI } from "@/services/images";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import type { PermissionCode } from "@/constants/permissions";

const MAX_IMAGES = 20; // backend ProductAdminWriteDto bound

interface Props {
  title?: string;
  images: string[];
  disabled: boolean;
  permission: PermissionCode;
  onChange: (images: string[]) => void;
  /** Appends to the latest list, so a remove/reorder made during the upload survives */
  onAdd: (urls: string[]) => void;
  onSelectFiles?: (files: File[]) => void;
  onRemove: (url: string) => void;
}

const moveTo = (images: string[], from: number, to: number): string[] => {
  const next = images.filter((_, index) => index !== from);
  return [...next.slice(0, to), images[from], ...next.slice(to)];
};

export default function ProductImagesSection({
  title = "Ảnh sản phẩm",
  images,
  disabled,
  permission,
  onChange,
  onAdd,
  onSelectFiles,
  onRemove
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = images.map(url => ({ _id: url }));
  const position = (url: string) => images.indexOf(url) + 1;

  const upload = async (files: FileList | null) => {
    if (disabled || uploading) return;
    const picked = Array.from(files ?? []).slice(0, MAX_IMAGES - images.length);
    if (!picked.length) return;
    if (onSelectFiles) {
      onSelectFiles(picked);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const file of picked) {
        const current = useAppStore.getState().profile;
        if (!current || !canAccess(current, { anyOf: [permission] })) break;
        added.push((await uploadImageAPI(file)).data.path);
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
      if (added.length) onAdd(added);
    }
  };

  return (
    <Card
      title={title}
      extra={
        <Button
          loading={uploading}
          disabled={disabled || images.length >= MAX_IMAGES}
          onClick={() => fileInput.current?.click()}
        >
          {onSelectFiles ? "Chọn ảnh" : "Tải ảnh lên"}
        </Button>
      }
    >
      <input
        ref={fileInput}
        type='file'
        accept='image/*'
        multiple
        hidden
        aria-label={`Chọn ${title.toLowerCase()}`}
        disabled={disabled}
        onChange={event => {
          upload(event.target.files).catch(cause => setError(getErrorMessage(cause)));
        }}
      />
      {error && <Alert type='error' showIcon title={error} className='mb-4' />}
      <SortableTable
        rows={rows}
        rowLabel={row => `ảnh ${position(row._id)}`}
        itemNoun='ảnh'
        disabled={disabled}
        emptyText='Chưa có ảnh. Ảnh đầu tiên là ảnh bìa.'
        onMove={(id, direction) => {
          const from = images.indexOf(id);
          const to = direction === "up" ? from - 1 : from + 1;
          if (to >= 0 && to < images.length) onChange(moveTo(images, from, to));
        }}
        onMoveTo={(id, targetId) =>
          onChange(moveTo(images, images.indexOf(id), images.indexOf(targetId)))
        }
        columns={[
          {
            title: "Ảnh",
            key: "image",
            render: (_, row) => (
              <Flex align='center' gap={8}>
                <img
                  src={resolveImageUrl(row._id)}
                  alt={`Ảnh ${position(row._id)}`}
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }}
                />
                {position(row._id) === 1 && <Tag color='blue'>Ảnh bìa</Tag>}
              </Flex>
            )
          },
          {
            title: "Thao tác",
            key: "actions",
            width: 100,
            render: (_, row) => (
              <Button
                size='small'
                danger
                aria-label={`Xóa ảnh ${position(row._id)}`}
                disabled={disabled}
                onClick={() => onRemove(row._id)}
              >
                Xóa
              </Button>
            )
          }
        ]}
      />
    </Card>
  );
}
