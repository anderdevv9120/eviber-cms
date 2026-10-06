import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { deferred } from "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/customers";
import Customers from "./index";
import CustomerForm from "./CustomerForm";

vi.mock("@/services/customers", () => ({
  listCustomersAPI: vi.fn(),
  listGuestBuyersAPI: vi.fn(),
  createCustomerAPI: vi.fn()
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
  const router = createMemoryRouter([{ path: "/customers", element: <Customers /> }], {
    initialEntries: [path]
  });
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
  it("loads only guests and shows complete grouped count/latest contact", async () => {
    renderList("/customers?tab=guests&status=VERIFIED");
    expect(await screen.findByText("Latest Contact")).toBeTruthy();
    const table = within(screen.getByRole("table"));
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
    await screen.findByText("an@example.test");
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
  it("locks duplicate submissions, clears the password and refreshes after success", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.createCustomerAPI>>>();
    vi.mocked(api.createCustomerAPI).mockReturnValueOnce(pending.promise);
    renderList();
    await fillCreate();
    await waitFor(() => expect(api.createCustomerAPI).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Tạo khách hàng" }));
    expect(api.createCustomerAPI).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: customer, message: "success" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(api.listCustomersAPI).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Thêm khách hàng" }));
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
  it("update mode sends only profile fields and has no password", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<CustomerForm customer={customer} onSubmit={submit} onCancel={() => {}} />);
    expect(screen.queryByLabelText("Mật khẩu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toEqual({ firstName: "An", phone: "+84901234567" });
  });
});
