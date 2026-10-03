import { Button, Flex, Table, Tooltip } from "antd";
import type { TableProps } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { useLayoutEffect, useRef } from "react";
import type { AttributeValueSummary } from "@/services/attributes";

interface Props {
  values: AttributeValueSummary[];
  disabled: boolean;
  mutationsDisabled: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onEdit: (value: AttributeValueSummary) => void;
  onDelete: (value: AttributeValueSummary) => void;
}
export default function AttributeValuesTable({
  values,
  disabled,
  mutationsDisabled,
  onMove,
  onEdit,
  onDelete
}: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ id: string; direction: "up" | "down" } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const preferred = buttons.current.get(`${pending.id}:${pending.direction}`);
    const other = buttons.current.get(
      `${pending.id}:${pending.direction === "up" ? "down" : "up"}`
    );
    (preferred && !preferred.disabled ? preferred : other)?.focus();
    pendingFocus.current = null;
  }, [values]);
  const move = (id: string, direction: "up" | "down") => {
    pendingFocus.current = { id, direction };
    onMove(id, direction);
  };
  const buttonRef = (
    id: string,
    direction: "up" | "down",
    button: HTMLButtonElement | HTMLAnchorElement | null
  ) => {
    if (button instanceof HTMLButtonElement) buttons.current.set(`${id}:${direction}`, button);
    else buttons.current.delete(`${id}:${direction}`);
  };
  const columns: TableProps<AttributeValueSummary>["columns"] = [
    { title: "Vị trí", render: (_, __, index) => index + 1 },
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
      title: "Thứ tự",
      render: (_, row, index) => (
        <Flex gap={8}>
          <Tooltip title='Di chuyển lên'>
            <Button
              ref={button => buttonRef(row._id, "up", button)}
              aria-label='Di chuyển lên'
              icon={<ArrowUpOutlined />}
              disabled={disabled || index === 0}
              onClick={() => move(row._id, "up")}
            />
          </Tooltip>
          <Tooltip title='Di chuyển xuống'>
            <Button
              ref={button => buttonRef(row._id, "down", button)}
              aria-label='Di chuyển xuống'
              icon={<ArrowDownOutlined />}
              disabled={disabled || index === values.length - 1}
              onClick={() => move(row._id, "down")}
            />
          </Tooltip>
        </Flex>
      )
    },
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
    <Table<AttributeValueSummary>
      rowKey='_id'
      columns={columns}
      dataSource={values}
      pagination={false}
      scroll={{ x: 900 }}
      locale={{ emptyText: "Chưa có giá trị" }}
    />
  );
}
