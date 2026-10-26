import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { deferred } from "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/customers";
import Customers from "./index";
import CustomerForm from "./CustomerForm";
import RegisteredCustomerDetail from "./RegisteredCustomerDetail";
import GuestBuyerDetail from "./GuestBuyerDetail";
import { order } from "@/test/order-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";

vi.mock("@/services/customers", () => ({
  listCustomersAPI: vi.fn(),
  listGuestBuyersAPI: vi.fn(),
  createCustomerAPI: vi.fn(),
  getCustomerAPI: vi.fn(),
  updateCustomerAPI: vi.fn(),
  getGuestBuyerAPI: vi.fn(),
  getCustomerAddressesAPI: vi.fn(),
  getCustomerOrdersAPI: vi.fn(),
  getGuestBuyerOrdersAPI: vi.fn()
}));
const customer: api.RegisteredCustomerDetail = {
  _id: "customer-id",
  email: "an@example.test",
  status: "UNVERIFIED",
  accountType: "DEFAULT",
  firstName: "An",
  phone: "+84901234567",
  created_at: "2026-10-05T00:00:00.000Z",
  addresses: []
};
const guest: api.GuestBuyerSummary = {
  email: "guest@example.test",
  name: "Latest Contact",
  phoneNumber: "0901234567",
  orderCount: 7,
  latestOrderAt: "2026-10-05T00:00:00.000Z"
};
const list = <T,>(data: T[], page = 1, total = data.length, pageSize = 10) => ({
  data: { data, page, pageSize, total, totalPage: Math.ceil(total / pageSize) },
  message: "success"
});
const renderList = (path = "/customers") => {
  const router = createMemoryRouter(
    [
      { path: "/customers", element: <Customers /> },
      { path: "/customers/registered/:customerId", element: <RegisteredCustomerDetail /> },
      { path: "/customers/guests/detail", element: <GuestBuyerDetail /> }
    ],
    {
      initialEntries: [path]
    }
  );
  const rendered = render(<RouterProvider router={router} />);
  return { router, ...rendered };
};
const fillCreate = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Thêm khách hàng" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "AN@example.test" } });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "Example1!" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo khách hàng" }));
};
beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
  vi.mocked(api.getCustomerAPI)
    .mockReset()
    .mockImplementation(async id => ({ data: { ...customer, _id: id }, message: "success" }));
  vi.mocked(api.updateCustomerAPI)
    .mockReset()
    .mockResolvedValue({ data: customer, message: "success" });
  vi.mocked(api.getGuestBuyerAPI)
    .mockReset()
    .mockResolvedValue({ data: guest, message: "success" });
  vi.mocked(api.getCustomerAddressesAPI)
    .mockReset()
    .mockResolvedValue({ data: [], message: "success" });
  vi.mocked(api.getCustomerOrdersAPI)
    .mockReset()
    .mockResolvedValue(list([order]));
  vi.mocked(api.getGuestBuyerOrdersAPI)
    .mockReset()
    .mockResolvedValue(list([{ ...order, status: "returned" }]));
  vi.mocked(api.listCustomersAPI)
    .mockReset()
    .mockResolvedValue(list([customer]));
  vi.mocked(api.listGuestBuyersAPI)
    .mockReset()
    .mockResolvedValue(list([guest]));
  vi.mocked(api.createCustomerAPI)
    .mockReset()
    .mockResolvedValue({ data: customer, message: "success" });
});

describe("Customers list and creation", () => {
  it("RBAC backend create denial preserves the draft and never navigates to a new customer", async () => {
    useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ", "CUSTOMER_CREATE"]));
    vi.mocked(api.createCustomerAPI).mockRejectedValueOnce(
      new ApiError("Customer access denied", 403)
    );
    const { router } = renderList();
    await fillCreate();
    await screen.findByText("Customer access denied");
    expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/customers");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("AN@example.test");
    expect((screen.getByLabelText("Mật khẩu") as HTMLInputElement).value).toBe("Example1!");
  });
  it("RBAC customer read cannot create, edit profile or link to full orders", async () => {
    useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ"]));
    const { router } = renderList();
    await screen.findByText("an@example.test");
    expect(
      (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
    ).toBe(true);
    await act(async () => router.navigate("/customers/registered/customer-id"));
    await screen.findByRole("region", { name: "Lịch sử mua hàng" });
    expect((screen.getByRole("button", { name: "Sửa hồ sơ" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    await screen.findByText("ORD-SNAPSHOT");
    expect(screen.queryByRole("link", { name: "ORD-SNAPSHOT" })).toBeNull();
  });
  it.each([false, true])(
    "RBAC preserves an open customer draft on refresh (edit %s)",
    async editing => {
      useAppStore
        .getState()
        .setProfile(
          staffProfile(["CUSTOMER_READ", editing ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE"])
        );
      const onSubmit = vi.fn(async () => undefined);
      render(
        <CustomerForm
          customer={editing ? customer : undefined}
          onSubmit={onSubmit}
          onCancel={() => {}}
        />
      );
      fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Unsaved" } });
      if (!editing) {
        fireEvent.change(screen.getByLabelText("Email"), {
          target: { value: "draft@example.test" }
        });
        fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "Example1!" } });
      }
      await act(async () => useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ"])));
      const button = screen.getByRole("button", { name: editing ? "Lưu hồ sơ" : "Tạo khách hàng" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText("Tên") as HTMLInputElement).value).toBe("Unsaved");
      await act(async () => fireEvent.submit(button.closest("form")!));
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );
  it("loads only guests and shows complete grouped count/latest contact", async () => {
    renderList("/customers?tab=guests&status=VERIFIED");
    expect(await screen.findByText("Latest Contact")).toBeTruthy();
    const table = within(screen.getByRole("table"));
    const link = table.getByRole("link", { name: guest.email });
    const url = new URL(link.getAttribute("href")!, "http://test.local");
    expect(url.pathname).toBe("/customers/guests/detail");
    expect(url.searchParams.get("email")).toBe(guest.email);
    expect(url.searchParams.get("returnTo")).toBe("/customers?tab=guests");
    expect(table.queryByRole("link", { name: "Chi tiết" })).toBeNull();
    expect(table.queryByRole("columnheader", { name: "Thao tác" })).toBeNull();
    expect(table.getByText("7")).toBeTruthy();
    expect(table.getByText("0901234567")).toBeTruthy();
    expect(screen.getByText("Tổng 1 khách hàng")).toBeTruthy();
    expect(api.listCustomersAPI).not.toHaveBeenCalled();
    expect(vi.mocked(api.listGuestBuyersAPI).mock.calls[0][0]).toEqual({
      tab: "guests",
      page: 1,
      pageSize: 10
    });
    expect(screen.queryByRole("combobox", { name: "Lọc trạng thái khách hàng" })).toBeNull();
  });
  it("shows loading, error/retry and empty results separately", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.listCustomersAPI>>>();
    vi.mocked(api.listCustomersAPI)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(list([]));
    renderList();
    expect(screen.getByLabelText("Đang tải danh sách khách hàng")).toBeTruthy();
    expect(screen.queryByText("Không có khách hàng")).toBeNull();
    await act(async () => pending.reject(new Error("Read failed")));
    expect(await screen.findByText("Read failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có khách hàng")).toBeTruthy();
  });
  it("resets page for search/tab changes and clears registered status", async () => {
    vi.mocked(api.listCustomersAPI).mockImplementation(async query =>
      list([customer], query.page, 65, query.pageSize)
    );
    const { router } = renderList("/customers?page=3&status=VERIFIED");
    const link = await screen.findByRole("link", { name: "An" });
    const url = new URL(link.getAttribute("href")!, "http://test.local");
    expect(url.pathname).toBe("/customers/registered/customer-id");
    expect(url.searchParams.get("returnTo")).toBe("/customers?page=3&status=VERIFIED");
    expect(screen.queryByRole("link", { name: "Chi tiết" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Thao tác" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Tìm khách hàng"), { target: { value: "An" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("page")).toBeNull()
    );
    fireEvent.click(screen.getByRole("tab", { name: "Khách vãng lai" }));
    await screen.findByText("Latest Contact");
    expect(router.state.location.search).toBe("?tab=guests&search=An");
  });
  it.each([
    [25, 3],
    [0, 1]
  ])("recovers an out-of-range page once (total %s)", async (total, last) => {
    vi.mocked(api.listCustomersAPI).mockImplementation(async query =>
      list(query.page === last && total > 0 ? [customer] : [], query.page, total)
    );
    const { router } = renderList("/customers?page=9");
    await screen.findByText(total > 0 ? "an@example.test" : "Không có khách hàng");
    expect(vi.mocked(api.listCustomersAPI).mock.calls.map(([query]) => query.page)).toEqual([
      9,
      last
    ]);
    expect(new URLSearchParams(router.state.location.search).get("page")).toBe(
      last === 1 ? null : String(last)
    );
  });
  it("ignores a late registered completion after switching tabs", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.listCustomersAPI>>>();
    vi.mocked(api.listCustomersAPI).mockReturnValueOnce(pending.promise);
    renderList();
    fireEvent.click(screen.getByRole("tab", { name: "Khách vãng lai" }));
    await screen.findByText("Latest Contact");
    await act(async () => pending.resolve(list([customer])));
    expect(screen.queryByText("an@example.test")).toBeNull();
    expect(vi.mocked(api.listCustomersAPI).mock.calls[0][1]?.aborted).toBe(true);
  });
  it("locks duplicate submissions and opens the created customer detail", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.createCustomerAPI>>>();
    vi.mocked(api.createCustomerAPI).mockReturnValueOnce(pending.promise);
    const { router } = renderList();
    await fillCreate();
    await waitFor(() => expect(api.createCustomerAPI).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Tạo khách hàng" }));
    expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: customer, message: "success" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByRole("heading", { name: "Khách hàng đã đăng ký" });
    expect(router.state.location.pathname).toBe("/customers/registered/customer-id");
    await act(() => router.navigate("/customers"));
    fireEvent.click(await screen.findByRole("button", { name: "Thêm khách hàng" }));
    expect((screen.getByLabelText("Mật khẩu") as HTMLInputElement).value).toBe("");
  });
  it.each([undefined, 503])(
    "blocks resubmission after uncertain creation (%s) until email read succeeds",
    async status => {
      vi.mocked(api.createCustomerAPI).mockRejectedValueOnce(
        new ApiError("Write uncertain", status)
      );
      renderList();
      await fillCreate();
      const search = await screen.findByRole("button", { name: "Tìm email đã gửi" });
      expect(
        (screen.getByRole("button", { name: "Tạo khách hàng" }) as HTMLButtonElement).disabled
      ).toBe(true);
      vi.mocked(api.listCustomersAPI).mockRejectedValueOnce(new Error("Search unavailable"));
      fireEvent.click(search);
      await screen.findByText("Search unavailable");
      expect(
        (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
      vi.mocked(api.listCustomersAPI).mockResolvedValueOnce(list([customer]));
      fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
      await screen.findByText("an@example.test");
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
        ).toBe(false)
      );
      const reads = vi.mocked(api.listCustomersAPI).mock.calls;
      expect(reads[reads.length - 1]?.[0].search).toBe("an@example.test");
      fireEvent.click(screen.getByRole("button", { name: "Thêm khách hàng" }));
      expect((screen.getByLabelText("Mật khẩu") as HTMLInputElement).value).toBe("");
      expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
    }
  );
  it("keeps ordinary 400 errors editable without a recovery POST/read", async () => {
    vi.mocked(api.createCustomerAPI).mockRejectedValueOnce(new ApiError("Invalid email", 400));
    renderList();
    await fillCreate();
    await screen.findByText("Invalid email");
    expect(screen.queryByRole("button", { name: "Tìm email đã gửi" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Tạo khách hàng" }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(api.listCustomersAPI).toHaveBeenCalledTimes(1);
  });
  it("never treats pre-creation results as a successful recovery read", async () => {
    const otherRead = deferred<Awaited<ReturnType<typeof api.listCustomersAPI>>>();
    const recoveryRead = deferred<Awaited<ReturnType<typeof api.listCustomersAPI>>>();
    vi.mocked(api.listCustomersAPI)
      .mockResolvedValueOnce(list([customer]))
      .mockReturnValueOnce(otherRead.promise)
      .mockReturnValueOnce(recoveryRead.promise);
    vi.mocked(api.createCustomerAPI).mockRejectedValueOnce(new ApiError("Write uncertain"));
    renderList("/customers?search=an@example.test");
    await screen.findByText("an@example.test");
    fireEvent.change(screen.getByLabelText("Tìm khách hàng"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() => expect(api.listCustomersAPI).toHaveBeenCalledTimes(2));
    await fillCreate();
    fireEvent.click(await screen.findByRole("button", { name: "Tìm email đã gửi" }));
    await waitFor(() => expect(api.listCustomersAPI).toHaveBeenCalledTimes(3));
    expect(
      (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.queryByText("an@example.test")).toBeNull();
    await act(async () => recoveryRead.reject(new Error("Recovery read failed")));
    await screen.findByText("Recovery read failed");
    expect(
      (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
    ).toBe(true);
    await act(async () => otherRead.resolve(list([customer])));
    expect(
      (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Thêm khách hàng" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    expect(api.listCustomersAPI).toHaveBeenCalledTimes(4);
    expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
  });
  it("update mode sends only profile fields and has no password", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<CustomerForm customer={customer} onSubmit={submit} onCancel={() => {}} />);
    expect(screen.queryByLabelText("Mật khẩu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toEqual({ firstName: "An", phone: "+84901234567" });
  });
});

describe("Customer detail integration", () => {
  it.each([
    ["GOOGLE", "Google"],
    [undefined, "—"]
  ] as const)("shows actual optional account type %s", async (accountType, label) => {
    vi.mocked(api.getCustomerAPI).mockResolvedValueOnce({
      data: { ...customer, accountType },
      message: "success"
    });
    renderList("/customers/registered/customer-id");
    await screen.findByRole("heading", { name: "Khách hàng đã đăng ký" });
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText("Email / mật khẩu")).toBeNull();
  });
  it("recovers an out-of-range history page once using only the customer endpoint", async () => {
    vi.mocked(api.getCustomerOrdersAPI).mockImplementation(async (_id, pagination) =>
      list([order], pagination.page, pagination.page === 1 ? 25 : 1, pagination.pageSize)
    );
    renderList("/customers/registered/customer-id");
    await screen.findByRole("link", { name: "ORD-SNAPSHOT" });
    fireEvent.click(screen.getByTitle("3"));
    await waitFor(() =>
      expect(vi.mocked(api.getCustomerOrdersAPI).mock.calls.map(([, query]) => query.page)).toEqual(
        [1, 3, 1]
      )
    );
    expect(api.getGuestBuyerOrdersAPI).not.toHaveBeenCalled();
  });
  it("keeps account fields readonly, edits only profile and links identity-filtered history", async () => {
    renderList("/customers/registered/customer-id?returnTo=%2Fcustomers%3Fpage%3D2");
    await screen.findByRole("heading", { name: "Khách hàng đã đăng ký" });
    expect(screen.getByText("Email / mật khẩu")).toBeTruthy();
    expect(screen.getByText("Chưa xác minh")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Về danh sách khách hàng" })).toBeNull();
    expect((await screen.findByRole("link", { name: "ORD-SNAPSHOT" })).getAttribute("href")).toBe(
      `/orders/order-id?${new URLSearchParams({
        returnTo: "/customers/registered/customer-id?returnTo=%2Fcustomers%3Fpage%3D2"
      })}`
    );
    expect(vi.mocked(api.getCustomerOrdersAPI).mock.calls[0][0]).toBe("customer-id");
    expect(api.getGuestBuyerOrdersAPI).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sửa hồ sơ" }));
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Mật khẩu")).toBeNull();
    fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() => expect(api.updateCustomerAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateCustomerAPI).mock.calls[0]).toEqual([
      "customer-id",
      { firstName: "Changed", phone: "+84901234567" }
    ]);
  });
  it("blocks profile editing after an uncertain write until a fresh read succeeds", async () => {
    vi.mocked(api.updateCustomerAPI).mockRejectedValueOnce(new ApiError("Write uncertain", 503));
    vi.mocked(api.getCustomerAPI)
      .mockResolvedValueOnce({ data: customer, message: "success" })
      .mockRejectedValueOnce(new Error("Recovery failed"));
    renderList("/customers/registered/customer-id");
    fireEvent.click(await screen.findByRole("button", { name: "Sửa hồ sơ" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await screen.findByText("Recovery failed");
    expect(screen.queryByRole("button", { name: "Sửa hồ sơ" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("button", { name: "Sửa hồ sơ" });
    expect(api.updateCustomerAPI).toHaveBeenCalledTimes(1);
  });
  it("shows latest guest contact as readonly and keeps matching account history separate", async () => {
    vi.mocked(api.getGuestBuyerAPI).mockResolvedValueOnce({
      data: { ...guest, email: customer.email },
      message: "success"
    });
    renderList("/customers/guests/detail?email=AN%40example.test");
    await screen.findByText("Thông tin liên hệ từ đơn hàng gần nhất");
    expect(screen.getByText("Latest Contact")).toBeTruthy();
    expect(await screen.findByText("Đã trả hàng")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sửa hồ sơ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm địa chỉ" })).toBeNull();
    expect(api.getCustomerAPI).not.toHaveBeenCalled();
    expect(api.getCustomerOrdersAPI).not.toHaveBeenCalled();
    expect(vi.mocked(api.getGuestBuyerOrdersAPI).mock.calls[0][0]).toBe(customer.email);
  });
  it.each(["", "?email=", "?email=a&email=b", `?email=${"a".repeat(256)}`])(
    "never reads a broad guest detail for invalid query %s",
    async query => {
      renderList(`/customers/guests/detail${query}`);
      await screen.findByText("Khách vãng lai không còn khả dụng");
      expect(api.getGuestBuyerAPI).not.toHaveBeenCalled();
      expect(api.getGuestBuyerOrdersAPI).not.toHaveBeenCalled();
    }
  );
  it("ignores old detail and history reads after switching registered identity", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.getCustomerAPI>>>();
    const history = deferred<Awaited<ReturnType<typeof api.getCustomerOrdersAPI>>>();
    vi.mocked(api.getCustomerAPI).mockReturnValueOnce(pending.promise);
    const { router } = renderList("/customers/registered/a");
    await waitFor(() => expect(api.getCustomerAPI).toHaveBeenCalled());
    await act(() => router.navigate("/customers/registered/b"));
    await screen.findByText(customer.email);
    await act(async () =>
      pending.resolve({
        data: { ...customer, _id: "a", email: "old@example.test" },
        message: "success"
      })
    );
    expect(screen.queryByText("old@example.test")).toBeNull();
    vi.mocked(api.getCustomerOrdersAPI).mockReturnValueOnce(history.promise);
    await act(() => router.navigate("/customers/registered/c"));
    await waitFor(() =>
      expect(vi.mocked(api.getCustomerOrdersAPI).mock.calls.some(([id]) => id === "c")).toBe(true)
    );
    await act(() => router.navigate("/customers/registered/d"));
    await screen.findByRole("link", { name: "ORD-SNAPSHOT" });
    await act(async () => history.resolve(list([{ ...order, orderNumber: "OLD-HISTORY" }])));
    expect(screen.queryByText("OLD-HISTORY")).toBeNull();
  });
  it("ignores old guest detail after switching normalized email", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.getGuestBuyerAPI>>>();
    vi.mocked(api.getGuestBuyerAPI).mockReturnValueOnce(pending.promise);
    const { router } = renderList("/customers/guests/detail?email=old@example.test");
    await waitFor(() => expect(api.getGuestBuyerAPI).toHaveBeenCalled());
    await act(() => router.navigate("/customers/guests/detail?email=guest@example.test"));
    await screen.findByText("Latest Contact");
    await act(async () =>
      pending.resolve({
        data: { ...guest, name: "Old contact", email: "old@example.test" },
        message: "success"
      })
    );
    expect(screen.queryByText("Old contact")).toBeNull();
  });
});
