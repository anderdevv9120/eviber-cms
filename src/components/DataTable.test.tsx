import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { TableProps } from "antd";
import DataTable from "./DataTable";

// Ant Design uses responsive media queries even in a jsdom component test.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
});

type Row = { _id: string; email: string };
const columns: NonNullable<TableProps<Row>["columns"]> = [{ title: "Email", dataIndex: "email" }];
const rows: Row[] = [{ _id: "1", email: "a".repeat(40) }];

const bodyTable = (container: HTMLElement) =>
  [...container.querySelectorAll("table")].find(table => table.querySelector("tbody"));

describe("DataTable", () => {
  it("uses intrinsic content width for data and rendered columns", () => {
    const { container } = render(
      <DataTable<Row>
        rowKey='_id'
        columns={[
          ...columns,
          { title: "Thao tác", render: (_, row) => <button>{`Xem ${row.email}`}</button> }
        ]}
        dataSource={rows}
      />
    );
    const table = bodyTable(container);
    expect(table).toBeDefined();
    expect(table!.style.width).toBe("max-content");
    expect(table!.style.minWidth).toBe("100%");
    expect(table!.style.tableLayout).toBe("auto");
    let node: HTMLElement | null = table!.parentElement;
    while (node && node.style.overflowX !== "auto") node = node.parentElement;
    expect(node).not.toBeNull();
  });

  it("giữ nguyên scroll.x do caller khai báo", () => {
    const { container } = render(
      <DataTable<Row> rowKey='_id' columns={columns} dataSource={rows} scroll={{ x: 777 }} />
    );
    expect(bodyTable(container)!.style.width).toBe("777px");
  });

  it("preserves vertical scrolling and caller classes with intrinsic sizing", () => {
    const { container } = render(
      <DataTable<Row>
        rowKey='_id'
        columns={columns}
        dataSource={rows}
        className='mt-4'
        scroll={{ y: 240 }}
      />
    );
    const table = bodyTable(container)!;
    expect(table.style.width).toBe("max-content");
    expect(table.parentElement!.style.maxHeight).toBe("240px");
    expect(container.querySelector(".cms-data-table.mt-4")).not.toBeNull();
  });
});
