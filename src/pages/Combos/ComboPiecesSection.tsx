import { Alert, Button, Card, Flex, InputNumber, Radio, Select, Typography } from "antd";
import SortableTable from "@/components/SortableTable";
import RemoteSelect from "@/components/RemoteSelect";
import type { ComboItemMode, ComboProductOption } from "@/services/combos";
import { listComboProductOptionsAPI } from "@/services/combos";
import { useCallback, useState } from "react";

export interface ComboPieceRow {
  _id: string;
  productId: string;
  quantity: number;
  mode: ComboItemMode;
  variantId: string | null;
  product: ComboProductOption | null;
}

export type PieceErrors = Record<string, string>;

const moveTo = (rows: ComboPieceRow[], from: number, to: number) => {
  const next = rows.filter((_, index) => index !== from);
  return [...next.slice(0, to), rows[from], ...next.slice(to)];
};

export default function ComboPiecesSection({
  items,
  errors,
  disabled,
  onChange
}: {
  items: ComboPieceRow[];
  errors: PieceErrors;
  disabled: boolean;
  onChange: (items: ComboPieceRow[]) => void;
}) {
  const [choice, setChoice] = useState<string>();
  const [known, setKnown] = useState<ComboProductOption[]>([]);
  const byId = new Map(known.map(product => [product._id, product]));
  for (const item of items) if (item.product) byId.set(item.productId, item.product);

  const load = useCallback(
    async (query: { search: string; page: number; pageSize: number }, signal: AbortSignal) => {
      const { data } = await listComboProductOptionsAPI(query, signal);
      if (!signal.aborted)
        setKnown(previous => [
          ...previous.filter(product => !data.data.some(next => next._id === product._id)),
          ...data.data
        ]);
      return { data: data.data, total: data.total, page: data.page, pageSize: data.pageSize };
    },
    []
  );

  const update = (id: string, part: Partial<ComboPieceRow>) =>
    onChange(items.map(item => (item._id === id ? { ...item, ...part } : item)));
  const picked = new Set(items.map(item => item.productId));
  return (
    <Card title={`Món trong combo (${items.length}/20)`}>
      <Flex vertical gap={12}>
        <Flex gap={8} align='start'>
          <div className='min-w-0 flex-1'>
            <RemoteSelect<ComboProductOption>
              load={load}
              label={product => product.name}
              value={choice}
              onChange={value => setChoice(typeof value === "string" ? value : undefined)}
              selected={
                choice && byId.has(choice) ? [{ _id: choice, label: byId.get(choice)!.name }] : []
              }
              ariaLabel='Thêm sản phẩm combo'
              placeholder='Tìm sản phẩm để thêm'
              retryLabel='Thử lại'
              disabled={product => picked.has(product._id)}
            />
          </div>
          <Button
            disabled={
              disabled || !choice || picked.has(choice) || items.length >= 20 || !byId.has(choice)
            }
            onClick={() => {
              if (!choice || picked.has(choice)) return;
              const product = byId.get(choice);
              if (!product) return;
              onChange([
                ...items,
                {
                  _id: product._id,
                  productId: product._id,
                  product,
                  quantity: 1,
                  mode: "CHOOSE",
                  variantId: null
                }
              ]);
              setChoice(undefined);
            }}
          >
            Thêm món
          </Button>
        </Flex>
        {errors._form && <Alert type='error' title={errors._form} />}
        <SortableTable
          rows={items}
          disabled={disabled}
          itemNoun='món'
          emptyText='Chưa có món nào trong combo.'
          rowLabel={row => row.product?.name ?? row.productId}
          onMove={(id, direction) => {
            const from = items.findIndex(item => item._id === id);
            const to = from + (direction === "up" ? -1 : 1);
            if (to >= 0 && to < items.length) onChange(moveTo(items, from, to));
          }}
          onMoveTo={(id, targetId) =>
            onChange(
              moveTo(
                items,
                items.findIndex(item => item._id === id),
                items.findIndex(item => item._id === targetId)
              )
            )
          }
          columns={[
            {
              title: "Sản phẩm",
              key: "name",
              render: (_, row) => (
                <Flex vertical gap={4}>
                  <Typography.Text>
                    {row.product?.name ?? `Không còn khả dụng (${row.productId})`}
                  </Typography.Text>
                  {errors[row._id] && (
                    <Typography.Text type='danger'>{errors[row._id]}</Typography.Text>
                  )}
                </Flex>
              )
            },
            {
              title: "Số lượng",
              key: "quantity",
              width: 125,
              render: (_, row) => (
                <InputNumber
                  aria-label={`Số lượng ${row.product?.name ?? row.productId}`}
                  min={1}
                  max={10}
                  precision={0}
                  value={row.quantity}
                  disabled={disabled}
                  onChange={value => update(row._id, { quantity: value ?? 0 })}
                />
              )
            },
            {
              title: "Lựa chọn",
              key: "mode",
              render: (_, row) => (
                <Flex vertical gap={8}>
                  <Radio.Group
                    aria-label={`Chế độ ${row.product?.name ?? row.productId}`}
                    value={row.mode}
                    disabled={disabled}
                    onChange={event =>
                      update(row._id, {
                        mode: event.target.value as ComboItemMode,
                        variantId: null
                      })
                    }
                    options={[
                      { label: "Cố định", value: "LOCKED" },
                      { label: "Khách chọn", value: "CHOOSE" }
                    ]}
                  />
                  {row.mode === "LOCKED" && (
                    <Select
                      aria-label={`Biến thể ${row.product?.name ?? row.productId}`}
                      value={row.variantId}
                      disabled={disabled}
                      placeholder='Chọn biến thể'
                      options={(row.product?.variants ?? []).map(variant => ({
                        value: variant._id,
                        label: `${variant.sku} · ${variant.attributeLabels.join(" / ")} · ${variant.price} ₫${variant.status !== "ACTIVE" ? " (ngừng bán)" : ""}`,
                        disabled: variant.status !== "ACTIVE"
                      }))}
                      onChange={variantId => update(row._id, { variantId })}
                    />
                  )}
                </Flex>
              )
            },
            {
              title: "Thao tác",
              key: "actions",
              width: 90,
              render: (_, row) => (
                <Button
                  danger
                  disabled={disabled}
                  aria-label={`Xóa ${row.product?.name ?? row.productId}`}
                  onClick={() => onChange(items.filter(item => item._id !== row._id))}
                >
                  Xóa
                </Button>
              )
            }
          ]}
        />
      </Flex>
    </Card>
  );
}
