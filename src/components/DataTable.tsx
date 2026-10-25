import { Table } from "antd";
import type { TableProps } from "antd";

type DataTableProps<T extends object> = TableProps<T>;

export default function DataTable<T extends object>({
  className,
  scroll,
  ...rest
}: DataTableProps<T>) {
  return (
    <Table<T>
      {...rest}
      className={className ? `cms-data-table ${className}` : "cms-data-table"}
      scroll={{ ...scroll, x: scroll?.x ?? "max-content" }}
    />
  );
}
