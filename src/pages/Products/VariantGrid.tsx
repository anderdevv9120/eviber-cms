import { useState } from "react";
import { Button, Card, Checkbox, Flex, Input, InputNumber, Select, Switch, Table } from "antd";
import { Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { ProductDimensions } from "@/services/products";
import { suggestSku, type GridRow } from "./variant-grid";

export type CellField = "sku" | "price" | "originalPrice" | "inventoryCount" | "image" | "row";
export type CellErrors = Record<string, Partial<Record<CellField, string>>>;
type BulkField = "price" | "originalPrice" | "inventoryCount";

const dimensionLabels: Record<keyof ProductDimensions, string> = {
  length: "Dài (cm)",
  width: "Rộng (cm)",
  height: "Cao (cm)",
  weight: "Nặng (g)"
};
const bulkLabels: Record<BulkField, string> = {
  price: "Giá",
  originalPrice: "Giá gốc",
  inventoryCount: "Tồn kho"
};

interface Props {
  rows: GridRow[];
  labelsOf: (row: GridRow) => string[];
  images: string[];
  slug: string;
  errors: CellErrors;
  disabled: boolean;
  onChange: (rows: GridRow[], touched: string[]) => void;
}

const comboLabel = (labels: string[]) => labels.join(" / ") || "Mặc định";
const isNew = (row: GridRow) => !row.saved;

export default function VariantGrid({
  rows,
  labelsOf,
  images,
  slug,
  errors,
  disabled,
  onChange
}: Props) {
  const [bulk, setBulk] = useState<Record<BulkField, number | null>>({
    price: null,
    originalPrice: null,
    inventoryCount: null
  });
  const update = (key: string, patch: Partial<GridRow>) =>
    onChange(
      rows.map(row => (row.key === key ? { ...row, ...patch } : row)),
      [key]
    );
  const applyBulk = () => {
    const values = Object.fromEntries(Object.entries(bulk).filter(([, value]) => value !== null));
    const targets = rows.filter(row => isNew(row) && row.include).map(row => row.key);
    onChange(
      rows.map(row => (targets.includes(row.key) ? { ...row, ...values } : row)),
      targets
    );
  };
  const generateSkus = () => {
    const targets = rows.filter(row => isNew(row) && !row.sku.trim()).map(row => row.key);
    onChange(
      rows.map(row =>
        targets.includes(row.key) ? { ...row, sku: suggestSku(slug, labelsOf(row)) } : row
      ),
      targets
    );
  };
  const cellError = (row: GridRow, field: CellField) => errors[row.key]?.[field];
  const numberCell = (row: GridRow, field: BulkField, label: string) => (
    <>
      <InputNumber
        aria-label={`${label} ${comboLabel(labelsOf(row))}`}
        aria-invalid={!!cellError(row, field)}
        status={cellError(row, field) ? "error" : undefined}
        min={0}
        precision={0}
        value={row[field]}
        disabled={disabled}
        style={{ width: "100%" }}
        onChange={value => update(row.key, { [field]: value })}
      />
      {cellError(row, field) && (
        <Typography.Text type='danger'>{cellError(row, field)}</Typography.Text>
      )}
    </>
  );

  const columns: TableColumnsType<GridRow> = [
    {
      title: "Bán",
      key: "include",
      width: 64,
      render: (_, row) => {
        const label = comboLabel(labelsOf(row));
        return row.saved ? (
          <Switch
            aria-label={`Đang bán ${label}`}
            checked={row.status === "ACTIVE"}
            disabled={disabled}
            onChange={checked => update(row.key, { status: checked ? "ACTIVE" : "INACTIVE" })}
          />
        ) : (
          <Checkbox
            aria-label={`Tạo ${label}`}
            checked={row.include}
            disabled={disabled}
            onChange={event => update(row.key, { include: event.target.checked })}
          />
        );
      }
    },
    {
      title: "Tổ hợp",
      key: "combo",
      render: (_, row) => (
        <Flex vertical>
          <span>{comboLabel(labelsOf(row))}</span>
          {cellError(row, "row") && (
            <Typography.Text type='danger'>{cellError(row, "row")}</Typography.Text>
          )}
        </Flex>
      )
    },
    {
      title: "SKU",
      key: "sku",
      render: (_, row) => (
        <>
          <Input
            aria-label={`SKU ${comboLabel(labelsOf(row))}`}
            aria-invalid={!!cellError(row, "sku")}
            status={cellError(row, "sku") ? "error" : undefined}
            value={row.sku}
            maxLength={64}
            disabled={disabled}
            onChange={event => update(row.key, { sku: event.target.value })}
          />
          {cellError(row, "sku") && (
            <Typography.Text type='danger'>{cellError(row, "sku")}</Typography.Text>
          )}
        </>
      )
    },
    { title: "Giá", key: "price", render: (_, row) => numberCell(row, "price", "Giá") },
    {
      title: "Giá gốc",
      key: "originalPrice",
      render: (_, row) => numberCell(row, "originalPrice", "Giá gốc")
    },
    {
      title: "Tồn kho",
      key: "inventoryCount",
      width: 120,
      render: (_, row) =>
        row.saved ? row.saved.inventoryCount : numberCell(row, "inventoryCount", "Tồn kho")
    },
    {
      title: "Ảnh",
      key: "image",
      width: 140,
      render: (_, row) => (
        <>
          <Select
            aria-label={`Ảnh ${comboLabel(labelsOf(row))}`}
            status={cellError(row, "image") ? "error" : undefined}
            value={row.image ?? undefined}
            allowClear
            placeholder='Không'
            disabled={disabled || images.length === 0}
            style={{ width: "100%" }}
            options={images.map((url, index) => ({ value: url, label: `Ảnh ${index + 1}` }))}
            onChange={(image?: string) => update(row.key, { image: image ?? null })}
          />
          {cellError(row, "image") && (
            <Typography.Text type='danger'>{cellError(row, "image")}</Typography.Text>
          )}
        </>
      )
    }
  ];

  const dimensions = (row: GridRow) => (
    <Flex gap={12} wrap>
      {(Object.keys(dimensionLabels) as (keyof ProductDimensions)[]).map(field => (
        <label key={field}>
          <Typography.Text type='secondary'>{dimensionLabels[field]}</Typography.Text>
          <InputNumber
            aria-label={`${dimensionLabels[field]} ${comboLabel(labelsOf(row))}`}
            min={0}
            value={row.dimensions[field]}
            disabled={disabled}
            onChange={value =>
              update(row.key, { dimensions: { ...row.dimensions, [field]: value ?? undefined } })
            }
          />
        </label>
      ))}
    </Flex>
  );

  return (
    <Card title='Biến thể'>
      <Flex gap={8} wrap align='center' className='mb-4'>
        {(Object.keys(bulkLabels) as BulkField[]).map(field => (
          <InputNumber
            key={field}
            aria-label={`${bulkLabels[field]} hàng loạt`}
            placeholder={bulkLabels[field]}
            min={0}
            precision={0}
            value={bulk[field]}
            disabled={disabled}
            onChange={value => setBulk(previous => ({ ...previous, [field]: value }))}
          />
        ))}
        <Button disabled={disabled} onClick={applyBulk}>
          Áp dụng cho biến thể mới
        </Button>
        <Button disabled={disabled} onClick={generateSkus}>
          Tạo SKU
        </Button>
      </Flex>
      <Table
        rowKey={row => row.key || "default"}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 960 }}
        expandable={{ expandedRowRender: dimensions }}
        locale={{ emptyText: "Chọn giá trị tùy chọn để tạo biến thể" }}
      />
    </Card>
  );
}
