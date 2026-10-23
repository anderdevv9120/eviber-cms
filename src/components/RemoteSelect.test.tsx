import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@/test/attribute-fixtures";
import RemoteSelect from "./RemoteSelect";

type Item = { _id: string; name: string };
type Query = { search: string; page: number; pageSize: number };
const shirt = { _id: "shirt", name: "Shirt" };
const jacket = { _id: "jacket", name: "Jacket" };
const page = (query: Query, data: Item[] = [shirt], total = data.length) => ({
  data,
  total,
  page: query.page,
  pageSize: query.pageSize
});
const open = () => fireEvent.mouseDown(screen.getByRole("combobox", { name: "Items" }));
const search = (value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "Items" }), {
    target: { value }
  });
const choose = async (name: string) => {
  open();
  fireEvent.click(await screen.findByText(name, { selector: ".ant-select-item-option-content" }));
};
const props = (load: (query: Query, signal: AbortSignal) => Promise<ReturnType<typeof page>>) => ({
  load,
  label: (item: Item) => item.name,
  ariaLabel: "Items",
  retryLabel: "Retry items"
});

describe("RemoteSelect", () => {
  it("searches on the server and resets to page one", async () => {
    const load = vi.fn(async (query: Query) => page(query));
    render(<RemoteSelect<Item> {...props(load)} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    search("jack");
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        { search: "jack", page: 1, pageSize: 10 },
        expect.any(AbortSignal)
      )
    );
  });

  it("paginates inside the dropdown", async () => {
    const load = vi.fn(async (query: Query) => page(query, [shirt], 25));
    render(<RemoteSelect<Item> {...props(load)} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    open();
    await screen.findByText("Shirt", { selector: ".ant-select-item-option-content" });
    fireEvent.click(document.querySelector(".ant-pagination-item-2")!);
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(
        { search: "", page: 2, pageSize: 10 },
        expect.any(AbortSignal)
      )
    );
  });

  it("shows a loading error and retries the same query", async () => {
    const load = vi
      .fn<(query: Query, signal: AbortSignal) => Promise<ReturnType<typeof page>>>()
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockImplementation(async query => page(query, [jacket]));
    render(<RemoteSelect<Item> {...props(load)} />);
    await screen.findByText("Network failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry items" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    open();
    expect(
      await screen.findByText("Jacket", { selector: ".ant-select-item-option-content" })
    ).toBeTruthy();
  });

  it("emits a scalar ID in single mode", async () => {
    const load = vi.fn(async (query: Query) => page(query));
    const onChange = vi.fn();
    render(<RemoteSelect<Item> {...props(load)} onChange={onChange} />);
    await choose("Shirt");
    expect(onChange).toHaveBeenCalledWith("shirt");
  });

  it("emits an array in multiple mode and retains labels across searches", async () => {
    const load = vi.fn(async (query: Query) => page(query, query.search ? [jacket] : [shirt]));
    const onChange = vi.fn();
    const { rerender } = render(
      <RemoteSelect<Item> {...props(load)} mode='multiple' value={[]} onChange={onChange} />
    );
    await choose("Shirt");
    expect(onChange).toHaveBeenCalledWith(["shirt"]);
    rerender(
      <RemoteSelect<Item> {...props(load)} mode='multiple' value={["shirt"]} onChange={onChange} />
    );
    search("jacket");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("Shirt", { selector: ".ant-select-selection-item-content" })
    ).toBeTruthy();
  });

  it("refuses disabled items", async () => {
    const load = vi.fn(async (query: Query) => page(query));
    const onChange = vi.fn();
    render(
      <RemoteSelect<Item>
        {...props(load)}
        disabled={item => item._id === "shirt"}
        onChange={onChange}
      />
    );
    open();
    const option = await screen.findByText("Shirt", {
      selector: ".ant-select-item-option-content"
    });
    expect(option.closest(".ant-select-item-option-disabled")).not.toBeNull();
    fireEvent.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps unavailable IDs and aborts stale loads on search and unmount", async () => {
    let resolveFirst!: (value: ReturnType<typeof page>) => void;
    const first = new Promise<ReturnType<typeof page>>(resolve => {
      resolveFirst = resolve;
    });
    const load = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockImplementation(async (query: Query) => page(query));
    const { unmount } = render(
      <RemoteSelect<Item> {...props(load)} mode='multiple' value={["missing"]} />
    );
    expect(screen.getByText("Không còn khả dụng (missing)")).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    search("shirt");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolveFirst(page({ search: "", page: 1, pageSize: 10 }, [jacket])));
    expect(screen.queryByText("Jacket")).toBeNull();
    unmount();
    expect(load.mock.calls[1][1].aborted).toBe(true);
  });
});
