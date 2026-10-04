import { Button, Flex, Table, Tooltip, theme } from "antd";
import type { TableProps } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { useId, useLayoutEffect, useRef, useState } from "react";
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
  const { token } = theme.useToken();
  const instructionsId = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggedIndex = disabled ? -1 : values.findIndex(value => value._id === draggedId);
  const endDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    buttons.current.get(pending)?.focus();
    pendingFocus.current = null;
  }, [values]);
  const move = (id: string, direction: "up" | "down") => {
    pendingFocus.current = id;
    onMove(id, direction);
  };
  const buttonRef = (id: string, button: HTMLButtonElement | HTMLAnchorElement | null) => {
    if (button instanceof HTMLButtonElement) buttons.current.set(id, button);
    else buttons.current.delete(id);
  };
  const columns: TableProps<AttributeValueSummary>["columns"] = [
    {
      title: "Thứ tự",
      width: 80,
      align: "center",
      render: (_, row) => (
        <Button
          type='text'
          ref={button => buttonRef(row._id, button)}
          aria-label={`Sắp xếp ${row.value}`}
          aria-describedby={instructionsId}
          icon={<HolderOutlined />}
          disabled={disabled || values.length < 2}
          draggable={!disabled && values.length > 1}
          style={{
            cursor:
              disabled || values.length < 2
                ? "not-allowed"
                : draggedId === row._id
                  ? "grabbing"
                  : "grab"
          }}
          onDragStart={event => {
            if (disabled || values.length < 2) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", row._id);
            const tableRow = event.currentTarget.closest("tr");
            if (tableRow) event.dataTransfer.setDragImage(tableRow, 24, 24);
            setDraggedId(row._id);
          }}
          onDragEnd={endDrag}
          onKeyDown={event => {
            if (disabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            move(row._id, event.key === "ArrowUp" ? "up" : "down");
          }}
        />
      )
    },
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
    <>
      <p id={instructionsId} className='sr-only'>
        Kéo tay nắm để sắp xếp. Khi tay nắm được chọn, dùng phím mũi tên lên hoặc xuống để di chuyển
        giá trị.
      </p>
      <Table<AttributeValueSummary>
        rowKey='_id'
        columns={columns.map(column => ({
          ...column,
          onCell: (row, index) => ({
            style:
              draggedIndex >= 0 && dropTargetId === row._id
                ? {
                    backgroundColor: token.colorPrimaryBg,
                    boxShadow: `inset 0 ${index !== undefined && index > draggedIndex ? "-2px" : "2px"} 0 ${token.colorPrimary}`
                  }
                : undefined
          })
        }))}
        dataSource={values}
        onRow={row => ({
          style: { opacity: draggedIndex >= 0 && row._id === draggedId ? 0.5 : 1 },
          onDragOver: event => {
            if (draggedIndex < 0) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetId(row._id === draggedId ? null : row._id);
          },
          onDragLeave: event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDropTargetId(null);
          },
          onDrop: event => {
            if (draggedIndex < 0 || !draggedId) return;
            event.preventDefault();
            if (draggedId !== row._id) {
              pendingFocus.current = draggedId;
              onMoveTo(draggedId, row._id);
            }
            endDrag();
          }
        })}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: "Chưa có giá trị" }}
      />
    </>
  );
}
