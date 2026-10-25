import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { attribute, value, response, deferred } from "@/test/attribute-fixtures";
import type { AttributeValuesResult } from "@/services/attributes";
import AttributeDetail from "./AttributeDetail";

vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
let calls: InternalAxiosRequestConfig[];
let current: AttributeValuesResult;
let handle: (config: InternalAxiosRequestConfig) => unknown | Promise<unknown>;
const writes = () => calls.filter(c => c.method !== "get");
const fail = (config: InternalAxiosRequestConfig, status: number) => {
  throw new AxiosError("Failed", String(status), config, null, {
    config,
    status,
    statusText: "Failed",
    headers: {},
    data: { message: "Server unavailable" }
  });
};
beforeEach(() => {
  calls = [];
  current = {
    attribute,
    revision: 4,
    values: ["M", "S", "L", "XL"].map((label, index) => ({
      ...value,
      _id: `${label.toLowerCase()}-id`,
      value: label,
      sortOrder: index
    }))
  };
  handle = config => {
    if (config.method === "get") return current;
    const input = config.data ? JSON.parse(config.data) : undefined;
    current = { ...current, attribute: { ...current.attribute, revision: 5 }, revision: 5 };
    if (config.method === "put")
      current.values = input.valueIds.map((id: string, sortOrder: number) => ({
        ...current.values.find(v => v._id === id)!,
        sortOrder
      }));
    if (config.method === "patch")
      current.values = current.values.map(v =>
        config.url?.endsWith(v._id) ? { ...v, ...input } : v
      );
    if (config.method === "delete")
      current.values = current.values.filter(v => !config.url?.endsWith(v._id));
    return { revision: 5 };
  };
  axiosRequest.defaults.adapter = async config => {
    calls.push(config);
    return response(config, await handle(config));
  };
});
const setup = () => {
  const router = createMemoryRouter(
    [
      { path: "/catalog/attributes/:attributeId", element: <AttributeDetail /> },
      { path: "/catalog/attributes", element: <p>Attribute list</p> }
    ],
    { initialEntries: ["/catalog/attributes/size-id"] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const dragValue = (label: string, target: HTMLElement) => {
  const handle = screen.getByRole("button", { name: `Sắp xếp ${label}` });
  const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(handle, { dataTransfer });
};
const moveS = async () => {
  await screen.findByText("Kích thước");
  dragValue("S", rows()[0]);
};
const order = () => rows().map(row => within(row).getAllByRole("cell")[2].textContent);

describe("attribute value detail", () => {
  it("moves across multiple rows from the first-column handle and saves the full order", async () => {
    setup();
    await screen.findByText("Kích thước");
    expect(within(screen.getByRole("table")).getAllByRole("columnheader")[0].textContent).toBe(
      "Thứ tự"
    );
    dragValue("XL", rows()[0]);
    expect(order()).toEqual(["XL", "M", "S", "L"]);
    expect(writes()).toEqual([]);
    dragValue("XL", rows()[3]);
    expect(order()).toEqual(["M", "S", "L", "XL"]);
    dragValue("M", rows()[2]);
    expect(order()).toEqual(["S", "L", "M", "XL"]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(writes()[0].data)).toEqual({
      valueIds: ["s-id", "l-id", "m-id", "xl-id"],
      expectedRevision: 4
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    expect(order()).toEqual(["S", "L", "M", "XL"]);
  });
  it("leaves the order untouched for cancelled, same-row and disabled drags", async () => {
    setup();
    await screen.findByText("Kích thước");
    const handle = screen.getByRole("button", { name: "Sắp xếp S" });
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(rows()[3], { dataTransfer });
    fireEvent.dragEnd(handle, { dataTransfer });
    fireEvent.drop(rows()[3], { dataTransfer });
    dragValue("S", rows()[1]);
    fireEvent.drop(rows()[0], { dataTransfer });
    expect(order()).toEqual(["M", "S", "L", "XL"]);
    fireEvent.click(screen.getByRole("button", { name: "Thêm giá trị" }));
    expect((handle as HTMLButtonElement).disabled).toBe(true);
    expect(handle.getAttribute("draggable")).toBe("false");
    dragValue("S", rows()[0]);
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(order()).toEqual(["M", "S", "L", "XL"]);
    expect(writes()).toEqual([]);
  });
  it("retains edit identity and input when a value disappears during stale-edit recovery", async () => {
    const normal = handle;
    handle = c => {
      if (c.method === "patch") {
        current = {
          ...current,
          revision: 8,
          attribute: { ...attribute, revision: 8 },
          values: current.values.filter(v => v._id !== "s-id")
        };
        return fail(c, 404);
      }
      return normal(c);
    };
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Sửa S" }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await screen.findByText(/Giá trị không còn khả dụng/);
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Typed");
    expect(
      (screen.getByRole("button", { name: "Lưu giá trị" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("preserves handle focus when keyboard movement reaches a boundary", async () => {
    setup();
    await screen.findByText("Kích thước");
    const up = screen.getByRole("button", { name: "Sắp xếp S" });
    up.focus();
    fireEvent.keyDown(up, { key: "ArrowUp" });
    expect(order()).toEqual(["S", "M", "L", "XL"]);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(rows()[0]).getByRole("button", { name: "Sắp xếp S" })
      )
    );
  });
  it("protects actual list-back navigation while ordering is dirty", async () => {
    const router = setup();
    await moveS();
    await act(() => router.navigate("/catalog/attributes"));
    fireEvent.click(await screen.findByRole("button", { name: "Ở lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(order()).toEqual(["S", "M", "L", "XL"]);
    await act(() => router.navigate("/catalog/attributes"));
    fireEvent.click(await screen.findByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    await screen.findByText("Attribute list");
    expect(writes()).toEqual([]);
  });
  it("retains create input on a failed write and appends after explicit retry", async () => {
    const normal = handle;
    handle = c => (c.method === "post" ? fail(c, 400) : normal(c));
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Thêm giá trị" }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "XXL" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    await screen.findByText("Server unavailable");
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("XXL");
    handle = c => {
      if (c.method === "post") {
        current = {
          ...current,
          revision: 5,
          attribute: { ...attribute, revision: 5, valueCount: 5 },
          values: [...current.values, { ...value, _id: "xxl-id", value: "XXL", sortOrder: 4 }]
        };
        return { value: current.values[4], revision: 5 };
      }
      return normal(c);
    };
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    await screen.findByText("XXL");
    expect(order()).toEqual(["M", "S", "L", "XL", "XXL"]);
    expect(JSON.parse(writes()[1].data)).toEqual({ value: "XXL", expectedRevision: 4 });
  });
  it.each(["post", "patch", "delete"])(
    "blocks repeat %s after a successful mutation whose reload fails",
    async method => {
      const normal = handle;
      let saved = false;
      handle = c => {
        if (c.method === method) {
          saved = true;
          return normal(c);
        }
        if (saved) return fail(c, 503);
        return normal(c);
      };
      setup();
      await screen.findByText("Kích thước");
      if (method === "post") {
        fireEvent.click(screen.getByRole("button", { name: "Thêm giá trị" }));
        fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "XXL" } });
        fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
      } else if (method === "patch") {
        fireEvent.click(screen.getByRole("button", { name: "Sửa S" }));
        fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Xóa S" }));
        fireEvent.click(
          within(await screen.findByRole("dialog")).getByRole("button", { name: "Xóa" })
        );
      }
      await screen.findByText(/Đã lưu thay đổi nhưng chưa tải được dữ liệu mới/);
      expect(
        (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(writes()).toHaveLength(1);
      handle = normal;
      fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
        ).toBe(false)
      );
      expect(writes()).toHaveLength(1);
    }
  );
  it("keeps stale editable input disabled until a failed conflict reload recovers", async () => {
    const normal = handle;
    let conflict = false;
    handle = c => {
      if (c.method === "patch") {
        conflict = true;
        current = { ...current, revision: 8, attribute: { ...attribute, revision: 8 } };
        return fail(c, 409);
      }
      if (conflict) return fail(c, 503);
      return normal(c);
    };
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Sửa S" }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await screen.findByText(/Dữ liệu đã thay đổi/);
    expect(
      (screen.getByRole("button", { name: "Lưu giá trị" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Typed");
    handle = normal;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Lưu giá trị" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1].data).expectedRevision).toBe(8);
  });
  it("preserves a stale order on failed discard reload until a successful authoritative read", async () => {
    const normal = handle;
    let conflicted = false;
    handle = c => {
      if (c.method === "put") {
        conflicted = true;
        return fail(c, 409);
      }
      if (conflicted) return fail(c, 503);
      return normal(c);
    };
    setup();
    await moveS();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await screen.findByText(/Thứ tự đã thay đổi/);
    fireEvent.click(screen.getByRole("button", { name: "Hủy thay đổi" }));
    await screen.findByText("Server unavailable");
    expect(order()).toEqual(["S", "M", "L", "XL"]);
    expect((screen.getByRole("button", { name: "Lưu thứ tự" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    handle = normal;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(order()).toEqual(["M", "S", "L", "XL"]));
    expect(writes()).toHaveLength(1);
  });
  it("renders every one of 101 values and keeps keyboard moves within boundaries", async () => {
    current.values = Array.from({ length: 101 }, (_, i) => ({
      ...value,
      _id: `v${i}`,
      value: `Value ${i}`,
      sortOrder: i
    }));
    setup();
    await screen.findByText("Value 100");
    expect(rows()).toHaveLength(101);
    expect(screen.getByText("size")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Sắp xếp Value 0" }), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Sắp xếp Value 100" }), {
      key: "ArrowDown"
    });
    expect(order()[0]).toBe("Value 0");
    expect(order()[100]).toBe("Value 100");
    expect((screen.getByRole("button", { name: "Lưu thứ tự" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
  it("keeps a local draft, disables mutations and discards without a request", async () => {
    setup();
    await moveS();
    expect(order()).toEqual(["S", "M", "L", "XL"]);
    expect(writes()).toEqual([]);
    expect(
      (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
    ).toBe(true);
    for (const row of rows())
      for (const name of ["Sửa", "Xóa"])
        expect(
          (
            within(row).getByRole("button", {
              name: `${name} ${within(row).getAllByRole("cell")[2].textContent}`
            }) as HTMLButtonElement
          ).disabled
        ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hủy thay đổi" }));
    expect(order()).toEqual(["M", "S", "L", "XL"]);
    expect(writes()).toEqual([]);
  });
  it("saves a complete permutation with captured revision once and reloads coherent state", async () => {
    setup();
    await moveS();
    const save = screen.getByRole("button", { name: "Lưu thứ tự" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(calls.filter(c => c.method === "get")).toHaveLength(2));
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0].data)).toEqual({
      valueIds: ["s-id", "m-id", "l-id", "xl-id"],
      expectedRevision: 4
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    expect(order()).toEqual(["S", "M", "L", "XL"]);
  });
  it("retains the draft on network failure and retries only on explicit save", async () => {
    const normal = handle;
    handle = c => (c.method === "put" ? fail(c, 503) : normal(c));
    setup();
    await moveS();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await screen.findByText("Server unavailable");
    expect(order()).toEqual(["S", "M", "L", "XL"]);
    expect(writes()).toHaveLength(1);
    handle = normal;
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
  });
  it("never replays stale ordering or attaches old IDs to a new revision", async () => {
    const normal = handle;
    handle = c => (c.method === "put" ? fail(c, 409) : normal(c));
    setup();
    await moveS();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await screen.findByText(/Thứ tự đã thay đổi/);
    expect(writes()).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Lưu thứ tự" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    current = {
      ...current,
      revision: 8,
      attribute: { ...attribute, revision: 8 },
      values: [...current.values, { ...value, _id: "new-id", value: "New", sortOrder: 4 }]
    };
    fireEvent.click(screen.getByRole("button", { name: "Hủy thay đổi" }));
    await screen.findByText("New");
    expect(order()).toEqual(["M", "S", "L", "XL", "New"]);
    expect(writes()).toHaveLength(1);
  });
  it("blocks repeat saves after write success with failed reload and recovers via read", async () => {
    const normal = handle;
    let saved = false;
    handle = c => {
      if (c.method === "put") {
        saved = true;
        return normal(c);
      }
      if (saved) return fail(c, 503);
      return normal(c);
    };
    setup();
    await moveS();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await screen.findByText(/Đã lưu thay đổi nhưng chưa tải được dữ liệu mới/);
    expect((screen.getByRole("button", { name: "Lưu thứ tự" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    expect(writes()).toHaveLength(1);
    handle = normal;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Thêm giá trị" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    expect(writes()).toHaveLength(1);
  });
  it("retains stale value input, reloads and requires explicit submit with fresh revision", async () => {
    const normal = handle;
    handle = c => {
      if (c.method === "patch") {
        current = { ...current, revision: 8, attribute: { ...attribute, revision: 8 } };
        return fail(c, 409);
      }
      return normal(c);
    };
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Sửa S" }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await screen.findByText(/Dữ liệu đã thay đổi/);
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Typed");
    expect(writes()).toHaveLength(1);
    handle = normal;
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1].data)).toEqual({
      value: "Typed",
      meta: null,
      expectedRevision: 8
    });
    await screen.findByText("Typed");
  });
  it("confirms value deletion by label and refreshes authoritative usage", async () => {
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Xóa S" }));
    await screen.findByText(/Xóa giá trị “S”/);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(order()).toEqual(["M", "L", "XL"]));
    expect(writes()[0].params).toEqual({ expectedRevision: 4 });
  });
  it("explains used-value restriction with separate product and variant counts", async () => {
    current.values[1] = { ...current.values[1], productUsageCount: 2, variantUsageCount: 7 };
    setup();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Xóa S" }));
    await screen.findByText(/2 sản phẩm và 7 biến thể/);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Xóa" })).toBeNull();
    expect(writes()).toEqual([]);
  });
  it("shows unavailable when the parent was deleted", async () => {
    handle = c => fail(c, 404);
    setup();
    await screen.findByText("Thuộc tính không còn khả dụng.");
    expect(screen.queryByRole("link", { name: "Về danh sách thuộc tính" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("does not let attribute A's delayed read overwrite B", async () => {
    const pending = deferred<AttributeValuesResult>();
    handle = c =>
      c.url?.includes("size-id")
        ? pending.promise
        : {
            attribute: { ...attribute, _id: "b-id", name: "Attribute B", code: "b" },
            values: [],
            revision: 4
          };
    const router = setup();
    await act(async () => {
      await router.navigate("/catalog/attributes/b-id");
    });
    await screen.findByText("Attribute B");
    await act(async () => {
      pending.resolve(current);
    });
    expect(screen.queryByText("Kích thước")).toBeNull();
    expect(screen.getByText("Attribute B")).toBeTruthy();
  });
});

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("attribute value permission actions", () => {
  it("requires ATTRIBUTE_UPDATE for value create/edit/delete/reorder", async () => {
    useAppStore
      .getState()
      .setProfile(staffProfile(["ATTRIBUTE_READ", "ATTRIBUTE_CREATE", "ATTRIBUTE_DELETE"]));
    setup();
    await screen.findByText("Kích thước");
    for (const name of ["Thêm giá trị", "Sửa M", "Xóa M", "Sắp xếp M", "Lưu thứ tự"])
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  });
  it("keeps an open value draft while disabling its controls after refresh", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa M" }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Unsaved value" } });
    act(() => useAppStore.getState().setProfile(staffProfile(["ATTRIBUTE_READ"])));
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Unsaved value");
    expect(screen.getByRole("button", { name: "Lưu giá trị" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByLabelText("Tên giá trị").closest("form")!);
    await act(async () => {});
    expect(writes()).toHaveLength(0);
  });
});
