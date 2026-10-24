import { Button, theme } from "antd";
import type { TableProps } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { useId, useLayoutEffect, useRef, useState } from "react";
import DataTable from "@/components/DataTable";

interface Props<T extends { _id: string }> {
  rows: T[];
  columns: NonNullable<TableProps<T>["columns"]>;
  /** Tên hiển thị của dòng trong aria-label tay nắm: "Sắp xếp {rowLabel}" */
  rowLabel: (row: T) => string;
  /** Danh từ trong hướng dẫn bàn phím, ví dụ "giá trị", "banner" */
  itemNoun: string;
  disabled: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onMoveTo: (id: string, targetId: string) => void;
  emptyText: string;
}

/** Bảng kéo-thả + phím mũi tên để sắp xếp; thứ tự nháp do caller giữ (useOrderDraft). */
export default function SortableTable<T extends { _id: string }>({
  rows,
  columns,
  rowLabel,
  itemNoun,
  disabled,
  onMove,
  onMoveTo,
  emptyText
}: Props<T>) {
  const { token } = theme.useToken();
  const instructionsId = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggedIndex = disabled ? -1 : rows.findIndex(row => row._id === draggedId);
  const locked = disabled || rows.length < 2;
  const endDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    buttons.current.get(pending)?.focus();
    pendingFocus.current = null;
  }, [rows]);
  const move = (id: string, direction: "up" | "down") => {
    pendingFocus.current = id;
    onMove(id, direction);
  };
  const buttonRef = (id: string, button: HTMLButtonElement | HTMLAnchorElement | null) => {
    if (button instanceof HTMLButtonElement) buttons.current.set(id, button);
    else buttons.current.delete(id);
  };
  const allColumns: NonNullable<TableProps<T>["columns"]> = [
    {
      title: "Thứ tự",
      width: 80,
      align: "center",
      render: (_, row) => (
        <Button
          type='text'
          ref={button => buttonRef(row._id, button)}
          aria-label={`Sắp xếp ${rowLabel(row)}`}
          aria-describedby={instructionsId}
          icon={<HolderOutlined />}
          disabled={locked}
          draggable={!locked}
          style={{ cursor: locked ? "not-allowed" : draggedId === row._id ? "grabbing" : "grab" }}
          onDragStart={event => {
            if (locked) {
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
    ...columns
  ];
  return (
    <>
      <p id={instructionsId} className='sr-only'>
        Kéo tay nắm để sắp xếp. Khi tay nắm được chọn, dùng phím mũi tên lên hoặc xuống để di chuyển{" "}
        {itemNoun}.
      </p>
      <DataTable<T>
        rowKey='_id'
        columns={allColumns.map(column => ({
          ...column,
          onCell: (row: T, index?: number) => ({
            style:
              draggedIndex >= 0 && dropTargetId === row._id
                ? {
                    backgroundColor: token.colorPrimaryBg,
                    boxShadow: `inset 0 ${index !== undefined && index > draggedIndex ? "-2px" : "2px"} 0 ${token.colorPrimary}`
                  }
                : undefined
          })
        }))}
        dataSource={rows}
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
        locale={{ emptyText }}
      />
    </>
  );
}
