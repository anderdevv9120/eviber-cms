import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { ConfigProvider } from "antd";
import axiosRequest from "@/utils/request";
import { attribute, value, list, response, deferred } from "@/test/attribute-fixtures";
import Attributes from "./index";
import AttributeDetail from "./AttributeDetail";

vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

let calls: InternalAxiosRequestConfig[];
let handle: (config: InternalAxiosRequestConfig) => unknown | Promise<unknown>;
beforeEach(() => {
  calls = [];
  handle = config => {
    if (config.url?.endsWith("/values")) return { attribute, values: [value], revision: 4 };
    if (config.method === "post") return attribute;
    if (config.method === "patch") return { ...attribute, ...JSON.parse(config.data), revision: 5 };
    if (config.method === "delete") return { _id: attribute._id, removedValueCount: 4 };
    return list();
  };
  axiosRequest.defaults.adapter = async config => {
    calls.push(config);
    return response(config, await handle(config));
  };
});
const renderList = (initialEntries = ["/catalog/attributes"]) => {
  const router = createMemoryRouter(
    [
      { path: "/catalog/attributes", element: <Attributes /> },
      { path: "/catalog/attributes/:attributeId", element: <AttributeDetail /> },
      { path: "/away", element: <h1>Chosen destination</h1> }
    ],
    { initialEntries }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fail = (config: InternalAxiosRequestConfig, status = 503) => {
  throw new AxiosError("failed", String(status), config, null, {
    config,
    status,
    statusText: "Failed",
    headers: {},
    data: { message: "Server unavailable" }
  });
};

describe("attribute list workflows", () => {
  it.each(["write", "refresh"])(
    "keeps the Back destination when a delayed create %s resolves after leaving",
    async phase => {
      const pending = deferred<typeof attribute | ReturnType<typeof list>>();
      let wrote = false;
      handle = config => {
        if (config.method === "post") {
          wrote = true;
          return phase === "write" ? pending.promise : attribute;
        }
        if (wrote && phase === "refresh") return pending.promise;
        return list();
      };
      const router = renderList(["/away", "/catalog/attributes"]);
      await screen.findByText("Kích thước");
      fireEvent.click(screen.getByRole("button", { name: "Thêm thuộc tính" }));
      change("Tên thuộc tính", "Capacity");
      change("Mã thuộc tính", "capacity");
      fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
      await waitFor(() => expect(calls.filter(c => c.method === "post")).toHaveLength(1));
      if (phase === "refresh")
        await waitFor(() =>
          expect(calls.filter(c => c.method === "get" && c.url === "/attributes")).toHaveLength(2)
        );
      act(() => {
        void router.navigate(-1);
      });
      await screen.findByRole("heading", { name: "Chosen destination" });
      await act(async () => {
        pending.resolve(phase === "write" ? attribute : list());
      });
      expect(router.state.location.pathname).toBe("/away");
      expect(screen.getByRole("heading", { name: "Chosen destination" })).toBeTruthy();
      expect(calls.filter(c => c.method === "get" && c.url === "/attributes")).toHaveLength(
        phase === "write" ? 1 : 2
      );
    }
  );

  it("shows authoritative columns/counts and page-size choices; search resets page 1", async () => {
    handle = config => list([attribute], config.params.page, 25, config.params.pageSize);
    renderList();
    await screen.findByText("Kích thước");
    const table = screen.getByRole("table");
    for (const name of [
      "Tên thuộc tính",
      "Mã",
      "Số giá trị",
      "Sản phẩm sử dụng",
      "Biến thể sử dụng",
      "Thao tác"
    ]) {
      expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
    }
    expect(within(table).getByText("size")).toBeTruthy();
    expect(within(table).getByText("4")).toBeTruthy();
    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() =>
      expect(calls[calls.length - 1]?.params).toEqual({ page: 2, pageSize: 10, search: "" })
    );
    change("Tìm thuộc tính", "capacity");
    await waitFor(() =>
      expect(calls[calls.length - 1]?.params).toEqual({ page: 1, pageSize: 10, search: "capacity" })
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Số thuộc tính mỗi trang" }));
    expect(await screen.findByText("20 / trang")).toBeTruthy();
    expect(screen.getByText("50 / trang")).toBeTruthy();
    fireEvent.click(screen.getByText("20 / trang"));
    await waitFor(() =>
      expect(calls[calls.length - 1]?.params).toEqual({ page: 1, pageSize: 20, search: "capacity" })
    );
  });

  it("creates an explicit code/name, reloads, then opens saved values detail", async () => {
    const router = renderList();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Thêm thuộc tính" }));
    change("Tên thuộc tính", "Dung lượng");
    change("Mã thuộc tính", "capacity");
    fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
    await screen.findByText("S");
    expect(router.state.location.pathname).toBe("/catalog/attributes/size-id");
    expect(calls.filter(c => c.method === "post").map(c => JSON.parse(c.data))).toEqual([
      { name: "Dung lượng", code: "capacity" }
    ]);
    expect(calls.filter(c => c.url === "/attributes" && c.method === "get")).toHaveLength(2);
    expect(await screen.findByText("S")).toBeTruthy();
  });

  it("names unused parent and child count before deletion; reloads after confirmed deletion", async () => {
    let removed = false;
    handle = config => {
      if (config.method === "delete") {
        removed = true;
        return { _id: attribute._id, removedValueCount: 4 };
      }
      return list(removed ? [] : [attribute]);
    };
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Kích thước" }));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText(/Kích thước.*4 giá trị/)).toBeTruthy();
    expect(calls.filter(c => c.method === "delete")).toHaveLength(0);
    fireEvent.click(within(modal).getByRole("button", { name: "Xóa" }));
    await screen.findByText("Chưa có thuộc tính");
    expect(calls.filter(c => c.method === "delete").map(c => [c.url, c.params])).toEqual([
      ["/attributes/size-id", { expectedRevision: 4 }]
    ]);
  });

  it("explains referenced deletion with distinct counts and offers no destructive confirmation", async () => {
    handle = () => list([{ ...attribute, productUsageCount: 2, variantUsageCount: 7 }]);
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Kích thước" }));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText(/2 sản phẩm.*7 biến thể/)).toBeTruthy();
    expect(within(modal).queryByRole("button", { name: "Xóa" })).toBeNull();
    expect(calls.filter(c => c.method === "delete")).toHaveLength(0);
  });

  it("retains rename input after conflict, refreshes revision and never replays automatically", async () => {
    let conflicted = false;
    handle = config => {
      if (config.method === "patch" && !conflicted) {
        conflicted = true;
        return fail(config, 409);
      }
      if (config.method === "patch") return { ...attribute, name: "Typed", revision: 9 };
      return list([
        {
          ...attribute,
          name: conflicted ? "Other admin" : attribute.name,
          revision: conflicted ? 8 : 4
        }
      ]);
    };
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Kích thước" }));
    change("Tên thuộc tính", "Typed");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await screen.findByText(/Dữ liệu đã thay đổi/);
    expect((screen.getByLabelText("Tên thuộc tính") as HTMLInputElement).value).toBe("Typed");
    expect(calls.filter(c => c.method === "patch")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await waitFor(() => expect(calls.filter(c => c.method === "patch")).toHaveLength(2));
    expect(JSON.parse(calls.filter(c => c.method === "patch")[1].data)).toEqual({
      name: "Typed",
      expectedRevision: 8
    });
  });

  it("retains failed create input and permits explicit retry", async () => {
    handle = config => (config.method === "post" ? fail(config) : list());
    renderList();
    await screen.findByText("Kích thước");
    fireEvent.click(screen.getByRole("button", { name: "Thêm thuộc tính" }));
    change("Tên thuộc tính", "Capacity");
    change("Mã thuộc tính", "capacity");
    fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
    await screen.findByText("Server unavailable");
    expect((screen.getByLabelText("Mã thuộc tính") as HTMLInputElement).value).toBe("capacity");
    expect(
      (screen.getByRole("button", { name: "Tạo thuộc tính" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("keeps a successful rename outside the search results successful even if an unnecessary detail read would fail", async () => {
    let renamed = false;
    handle = config => {
      if (config.method === "patch") {
        renamed = true;
        return { ...attribute, name: "Different name", revision: 5 };
      }
      if (config.url !== "/attributes") return fail(config);
      return list(renamed ? [] : [attribute]);
    };
    renderList();
    await screen.findByText("Kích thước");
    change("Tìm thuộc tính", "Kích thước");
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Kích thước" }));
    change("Tên thuộc tính", "Different name");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await waitFor(() =>
      expect(calls.filter(c => c.method === "get" && c.url === "/attributes")).toHaveLength(3)
    );
    expect(calls.filter(c => c.method === "get" && c.url !== "/attributes")).toHaveLength(0);
    expect(await screen.findByText("Chưa có thuộc tính")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("keeps a conflicted form locked when refresh fails; retry obtains the new revision without losing input", async () => {
    let conflicted = false;
    let unavailable = true;
    handle = config => {
      if (config.method === "patch" && !conflicted) {
        conflicted = true;
        return fail(config, 409);
      }
      if (config.method === "patch") return { ...attribute, name: "Typed", revision: 12 };
      if (conflicted && unavailable) return fail(config);
      return list([
        {
          ...attribute,
          name: conflicted ? "Other admin" : attribute.name,
          revision: conflicted ? 11 : 4
        }
      ]);
    };
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Kích thước" }));
    change("Tên thuộc tính", "Typed");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await screen.findByText(/Dữ liệu đã thay đổi/);
    const modal = screen.getByRole("dialog");
    expect(
      (within(modal).getByRole("button", { name: /Lưu tên/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    unavailable = false;
    fireEvent.click(within(modal).getByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Lưu tên/ }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    expect((screen.getByLabelText("Tên thuộc tính") as HTMLInputElement).value).toBe("Typed");
    expect(calls.filter(c => c.method === "patch")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Lưu tên/ }));
    await waitFor(() => expect(calls.filter(c => c.method === "patch")).toHaveLength(2));
    expect(JSON.parse(calls.filter(c => c.method === "patch")[1].data)).toEqual({
      name: "Typed",
      expectedRevision: 11
    });
  });

  it("reloads deletion conflicts into a referenced restriction without replaying the delete", async () => {
    let blocked = false;
    handle = config => {
      if (config.method === "delete") {
        blocked = true;
        return fail(config, 409);
      }
      return list([
        {
          ...attribute,
          revision: blocked ? 5 : 4,
          productUsageCount: blocked ? 3 : 0,
          variantUsageCount: blocked ? 2 : 0
        }
      ]);
    };
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Kích thước" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
    await screen.findByText(/3 sản phẩm.*2 biến thể/);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Xóa" })).toBeNull();
    expect(calls.filter(c => c.method === "delete")).toHaveLength(1);
  });

  it("clears stale rows on active query failure and retries instead of showing empty success", async () => {
    handle = config => (config.params.search ? fail(config) : list());
    renderList();
    await screen.findByText("Kích thước");
    change("Tìm thuộc tính", "bad query");
    await screen.findByText("Server unavailable");
    expect(screen.queryByText("Kích thước")).toBeNull();
    expect(screen.queryByText("Chưa có thuộc tính")).toBeNull();
    handle = () => list([{ ...attribute, name: "Recovered" }]);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Recovered");
  });

  it("rejects missing list payload as a retryable error", async () => {
    handle = () => null;
    renderList();
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(screen.queryByText("Chưa có thuộc tính")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Thêm thuộc tính" }) as HTMLButtonElement).disabled
    ).toBe(true);
    handle = () => list();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Kích thước");
  });

  it("can cancel a conflicted form after failed reload and recover list writes", async () => {
    let conflicted = false;
    let unavailable = true;
    handle = config => {
      if (config.method === "patch") {
        conflicted = true;
        return fail(config, 409);
      }
      if (conflicted && unavailable) return fail(config);
      return list();
    };
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Kích thước" }));
    change("Tên thuộc tính", "Typed");
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await screen.findByText(/Dữ liệu đã thay đổi/);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    unavailable = false;
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Kích thước");
    expect(
      (screen.getByRole("button", { name: "Thêm thuộc tính" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("ignores a superseded delayed search response", async () => {
    const pending = deferred<ReturnType<typeof list>>();
    let oldSignal: AbortSignal | undefined;
    handle = config => {
      if (config.params.search === "old") {
        oldSignal = config.signal as AbortSignal;
        return pending.promise;
      }
      return list([
        { ...attribute, name: config.params.search === "new" ? "Current result" : attribute.name }
      ]);
    };
    renderList();
    await screen.findByText("Kích thước");
    change("Tìm thuộc tính", "old");
    await waitFor(() => expect(oldSignal).toBeDefined());
    change("Tìm thuộc tính", "new");
    await screen.findByText("Current result");
    await act(async () => {
      pending.resolve(list([{ ...attribute, name: "Obsolete result" }]));
    });
    expect(oldSignal?.aborted).toBe(true);
    expect(screen.queryByText("Obsolete result")).toBeNull();
    expect(screen.getByText("Current result")).toBeTruthy();
  });

  it.each(["post", "patch", "delete"])(
    "locks further writes after successful %s with failed reload, then recovers",
    async method => {
      let wrote = false;
      let failReload = true;
      handle = config => {
        if (config.method === method) {
          wrote = true;
          return attribute;
        }
        if (wrote && failReload) return fail(config);
        return list();
      };
      renderList();
      await screen.findByText("Kích thước");
      if (method === "post") {
        fireEvent.click(screen.getByRole("button", { name: "Thêm thuộc tính" }));
        change("Tên thuộc tính", "Capacity");
        change("Mã thuộc tính", "capacity");
        fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
      } else if (method === "patch") {
        fireEvent.click(screen.getByRole("button", { name: "Sửa Kích thước" }));
        change("Tên thuộc tính", "Renamed");
        fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Xóa Kích thước" }));
        fireEvent.click(
          within(await screen.findByRole("dialog")).getByRole("button", { name: "Xóa" })
        );
      }
      await screen.findByText(/Đã lưu thay đổi.*chưa tải được dữ liệu mới/);
      expect(
        (screen.getByRole("button", { name: "Thêm thuộc tính" }) as HTMLButtonElement).disabled
      ).toBe(true);
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Tạo thuộc tính" })).toBeNull()
      );
      expect(calls.filter(c => c.method === method)).toHaveLength(1);
      failReload = false;
      fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
      await screen.findByText("Kích thước");
      expect(
        (screen.getByRole("button", { name: "Thêm thuộc tính" }) as HTMLButtonElement).disabled
      ).toBe(false);
      expect(calls.filter(c => c.method === method)).toHaveLength(1);
    }
  );
});

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

describe("attribute permission actions", () => {
  it("preserves the dictionary but disables read-only mutations", async () => {
    useAppStore.getState().setProfile(staffProfile(["ATTRIBUTE_READ"]));
    renderList();
    await screen.findByText("Kích thước");
    for (const name of ["Thêm thuộc tính", "Sửa Kích thước", "Xóa Kích thước"])
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  });
  it("preserves the open rename draft when update is removed", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Kích thước" }));
    change("Tên thuộc tính", "Unsaved name");
    act(() =>
      useAppStore.getState().setProfile(staffProfile(["ATTRIBUTE_READ", "ATTRIBUTE_CREATE"]))
    );
    expect((screen.getByLabelText("Tên thuộc tính") as HTMLInputElement).value).toBe(
      "Unsaved name"
    );
    expect(screen.getByRole("button", { name: "Lưu tên" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByLabelText("Tên thuộc tính").closest("form")!);
    await act(async () => {});
    expect(calls.filter(c => c.method === "patch")).toHaveLength(0);
  });
  it("rechecks delete authority in an already open confirmation", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Kích thước" }));
    const dialog = await screen.findByRole("dialog");
    act(() =>
      useAppStore.getState().setProfile(staffProfile(["ATTRIBUTE_READ", "ATTRIBUTE_UPDATE"]))
    );
    const button = within(dialog).getByRole("button", { name: "Xóa" });
    button.removeAttribute("disabled");
    fireEvent.click(button);
    expect(calls.filter(c => c.method === "delete")).toHaveLength(0);
  });
});
