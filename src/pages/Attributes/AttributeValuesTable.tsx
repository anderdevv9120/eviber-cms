import { Button, Flex, Tooltip } from "antd";
import type { TableProps } from "antd";
import SortableTable from "@/components/SortableTable";
import type { AttributeValueSummary } from "@/services/attributes";

interface Props {
  values: AttributeValueSummary[];
  disabled: boolean;
  mutationsDisabled: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onMoveTo: (id: string, targetId: string) => void;
  onEdit: (value: AttributeValueSummary) => void;
  onDelete: (value: AttributeValueSummary) => void;
}
export default function AttributeValuesTable({
  values,
  disabled,
  mutationsDisabled,
  onMove,
  onMoveTo,
  onEdit,
  onDelete
}: Props) {
  const columns: NonNullable<TableProps<AttributeValueSummary>["columns"]> = [
    { title: "Giá trị", dataIndex: "value" },
    {
      title: "Màu",
      dataIndex: "meta",
      render: (meta: string | null) =>
        meta ? (
          <Flex align='center' gap={8}>
            <span
              aria-label={`Màu ${meta}`}
              style={{ backgroundColor: meta, width: 20, height: 20, border: "1px solid #999" }}
            />
            {meta}
          </Flex>
        ) : (
          "Văn bản"
        )
    },
    { title: "Sản phẩm sử dụng", dataIndex: "productUsageCount" },
    { title: "Biến thể sử dụng", dataIndex: "variantUsageCount" },
    {
      title: "Thao tác",
      render: (_, row) => (
        <Flex gap={8}>
          <Tooltip title={`Sửa ${row.value}`}>
            <Button
              aria-label={`Sửa ${row.value}`}
              disabled={mutationsDisabled}
              onClick={() => onEdit(row)}
            >
              Sửa
            </Button>
          </Tooltip>
          <Tooltip title={`Xóa ${row.value}`}>
            <Button
              danger
              aria-label={`Xóa ${row.value}`}
              disabled={mutationsDisabled}
              onClick={() => onDelete(row)}
            >
              Xóa
            </Button>
          </Tooltip>
        </Flex>
      )
    }
  ];
  return (
    <SortableTable<AttributeValueSummary>
      rows={values}
      columns={columns}
      rowLabel={value => value.value}
      itemNoun='giá trị'
      disabled={disabled}
      onMove={onMove}
      onMoveTo={onMoveTo}
      emptyText='Chưa có giá trị'
      scrollX={900}
    />
  );
}
