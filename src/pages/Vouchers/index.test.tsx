import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { deferred } from "@/test/attribute-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/request";
import * as api from "@/services/vouchers";
import Vouchers from "./index";
import VoucherForm from "./VoucherForm";
import VoucherDrawer from "./VoucherDrawer";

vi.mock("@/services/vouchers", () => ({
  listVouchersAPI: vi.fn(),
  getVoucherAPI: vi.fn(),
  createVoucherAPI: vi.fn(),
  updateVoucherAPI: vi.fn(),
  listVoucherRedemptionsAPI: vi.fn(),
  listVoucherProductTargetsAPI: vi.fn(),
  listVoucherCategoryTargetsAPI: vi.fn()
}));
const productId = "000000000000000000000001";
const categoryId = "000000000000000000000002";
const voucher: api.AdminCouponDetail = {
  _id: "voucher-id",
  code: "SAVE_20",
  name: "Summer",
  discountType: "percentage",
  discountValue: 20,
  maxDiscountAmount: 50000,
  minOrderAmount: 300000,
  scopeType: "all",
  scopeProductIds: [],
  scopeCategoryIds: [],
  selectedProducts: [],
  selectedCategories: [],
  isActive: true,
  startDate: "2026-10-08T17:00:00.000Z",
  endDate: "2026-10-09T17:00:00.000Z",
  usageLimit: 10,
  perUserLimit: 1,
  usedCount: 7,
  remainingUses: 3,
  availability: "active",
  revision: 0,
  created_at: "2026-10-08T00:00:00.000Z",
  updated_at: "2026-10-08T00:00:00.000Z"
};
const redemption: api.AdminCouponRedemption = {
  _id: "redemption",
  couponId: "voucher-id",
  couponCode: "SAVE_20",
  couponRevision: 0,
  rulesSnapshot: {
    discountType: "percentage",
    discountValue: 20,
    maxDiscountAmount: 50000,
    minOrderAmount: 300000,
    scopeType: "all",
    scopeProductIds: [],
    scopeCategoryIds: []
  },
  orderId: "order/1",
  orderNumber: "ORD-1",
  userId: "customer",
  email: "an@example.test",
  displayName: "An",
  eligibleSubtotal: 350000,
  discountAmount: 50000,
  consumedAt: "2026-10-08T18:00:00.000Z",
  state: "released",
  releasedAt: "2026-10-08T19:00:00.000Z",
  releaseReason: "cancelled"
};
const list = <T,>(data: T[], page = 1, total = data.length, pageSize = 10) => ({
  data: { data, page, pageSize, total, totalPage: Math.ceil(total / pageSize) },
  message: "success"
});
const profile = {
  _id: "admin-a",
  email: "admin@example.test",
  phone: "",
  firstName: "Admin",
  lastName: "",
  roles: ["SUPER_ADMIN"],
  access: ownerProfile.access,
  status: "ACTIVE"
};
const renderList = (path = "/vouchers") => {
  const router = createMemoryRouter([{ path: "/vouchers", element: <Vouchers /> }], {
    initialEntries: [path]
  });
  return { router, ...render(<RouterProvider router={router} />) };
};
// Drawer needs the real router for its order links.
const drawer = () => {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <VoucherDrawer voucherId='voucher-id' onClose={vi.fn()} onChanged={vi.fn()} />
    }
  ]);
  return render(<RouterProvider router={router} />);
};
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
// Typing a full `DD/MM/YYYY HH:mm:ss` value and pressing Enter commits the antd picker.
const pickDate = (label: string, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const search = (label: string, value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
const select = async (label: string, text: string) => {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByText(text, { selector: ".ant-select-item-option-content" }));
};
beforeEach(() => {
  useAppStore.getState().setProfile(profile);
  vi.mocked(api.listVouchersAPI)
    .mockReset()
    .mockImplementation(async query => list([voucher], query.page, 1, query.pageSize));
  vi.mocked(api.getVoucherAPI).mockReset().mockResolvedValue({ data: voucher, message: "success" });
  vi.mocked(api.createVoucherAPI)
    .mockReset()
    .mockResolvedValue({ data: voucher, message: "success" });
  vi.mocked(api.updateVoucherAPI)
    .mockReset()
    .mockResolvedValue({ data: { ...voucher, revision: 1 }, message: "success" });
  vi.mocked(api.listVoucherRedemptionsAPI)
    .mockReset()
    .mockImplementation(async (_id, query) => list([redemption], query.page, 1, query.pageSize));
  vi.mocked(api.listVoucherProductTargetsAPI)
    .mockReset()
    .mockImplementation(async query =>
      list([{ _id: productId, name: "Shirt" }], query.page, 1, query.pageSize)
    );
  vi.mocked(api.listVoucherCategoryTargetsAPI)
    .mockReset()
    .mockImplementation(async query =>
      list([{ _id: categoryId, name: "Clothes" }], query.page, 1, query.pageSize)
    );
});

describe("voucher rules form", () => {
  it("creates a normalized code with default one-account use and shop dates", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Thêm voucher" }));
    change("Mã voucher", " save_20 ");
    change("Tên voucher", " Sale ");
    change("Giảm tối đa (VND)", "50000");
    pickDate("Thời điểm có hiệu lực", "09/10/2026 00:00:00");
    pickDate("Thời điểm kết thúc", "10/10/2026 00:00:00");
    fireEvent.click(screen.getByRole("button", { name: "Tạo voucher" }));
    await waitFor(() => expect(api.createVoucherAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createVoucherAPI).mock.calls[0][0]).toEqual({
      code: "SAVE_20",
      name: "Sale",
      discountType: "percentage",
      discountValue: 20,
      maxDiscountAmount: 50000,
      minOrderAmount: 0,
      scopeType: "all",
      scopeProductIds: [],
      scopeCategoryIds: [],
      isActive: true,
      usageLimit: null,
      perUserLimit: 1,
      startDate: "2026-10-08T17:00:00.000Z",
      endDate: "2026-10-09T17:00:00.000Z"
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tạo voucher" })).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("Đã lưu voucher thành công");
  });
  it("keeps code immutable and sends literal percentage/cap, unlimited, and UTC dates", async () => {
    const save = vi.fn(async (_input: api.CouponInput) => {});
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={save} />);
    expect((screen.getByLabelText("Mã voucher") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Thời điểm có hiệu lực") as HTMLInputElement).value).toBe(
      "09/10/2026 00:00:00"
    );
    change("Giới hạn toàn bộ", "");
    change("Giới hạn mỗi tài khoản", "");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({
      code: "SAVE_20",
      name: "Summer",
      discountType: "percentage",
      discountValue: 20,
      maxDiscountAmount: 50000,
      minOrderAmount: 300000,
      scopeType: "all",
      scopeProductIds: [],
      scopeCategoryIds: [],
      startDate: "2026-10-08T17:00:00.000Z",
      endDate: "2026-10-09T17:00:00.000Z",
      isActive: true,
      usageLimit: null,
      perUserLimit: null
    });
  });
  it.each([
    ["Giá trị giảm", "20.5"],
    ["Giá trị giảm", "101"],
    ["Đơn tối thiểu (VND)", "-1"],
    ["Giới hạn toàn bộ", "0"],
    ["Giới hạn mỗi tài khoản", "9007199254740992"]
  ])("rejects invalid integer %s=%s", async (label, value) => {
    const save = vi.fn();
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={save} />);
    change(label, value);
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText(/Số nguyên/);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects reversed dates and an empty selected scope", async () => {
    const save = vi.fn();
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={save} />);
    pickDate("Thời điểm kết thúc", "08/10/2026 00:00:00");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Kết thúc phải sau bắt đầu");
    pickDate("Thời điểm kết thúc", "10/10/2026 00:00:00");
    await select("Phạm vi", "Sản phẩm đã chọn");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Chọn ít nhất một mục");
    expect(save).not.toHaveBeenCalled();
  });
  it.each([
    ["Thời điểm có hiệu lực", "00:00:00"],
    ["Thời điểm kết thúc", "23:59:59"]
  ])("saves %s with default %s on a day click, keeping the picker open", async (label, time) => {
    render(<VoucherForm voucher={null} busy={false} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    const panel = await waitFor(() => document.querySelector<HTMLElement>(".ant-picker-dropdown")!);
    fireEvent.click(panel.querySelector(".ant-picker-cell-in-view .ant-picker-cell-inner")!);
    await waitFor(() => expect(input.value.endsWith(time)).toBe(true));
    expect(panel.classList.contains("ant-picker-dropdown-hidden")).toBe(false);
    expect(within(panel).queryByRole("button", { name: "OK" })).toBeNull();
  });
  it("groups VND thousands and deletes the digit beside a separator", () => {
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText("Đơn tối thiểu (VND)") as HTMLInputElement;
    expect(input.value).toBe("300,000");
    input.setSelectionRange(4, 4);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(input.selectionStart).toBe(3);
    input.setSelectionRange(3, 3);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(input.selectionStart).toBe(4);
  });
  it("selects products/categories and explicitly clears irrelevant targets and cap", async () => {
    const save = vi.fn(async (_input: api.CouponInput) => {});
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={save} />);
    await select("Phạm vi", "Sản phẩm đã chọn");
    await select("Sản phẩm áp dụng", "Shirt");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({
      scopeType: "products",
      scopeProductIds: [productId],
      scopeCategoryIds: []
    });
    await select("Phạm vi", "Danh mục đã chọn");
    await select("Danh mục áp dụng", "Clothes");
    await select("Loại giảm", "Số tiền cố định");
    change("Giá trị giảm", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toMatchObject({
      discountType: "fixed_amount",
      discountValue: 50000,
      maxDiscountAmount: null,
      scopeType: "categories",
      scopeProductIds: [],
      scopeCategoryIds: [categoryId]
    });
  });
  it("keeps selected targets outside search results and preserves draft after a failed save", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Write failed"));
    vi.mocked(api.listVoucherProductTargetsAPI).mockResolvedValue(list([]));
    render(
      <VoucherForm
        voucher={{
          ...voucher,
          scopeType: "products",
          scopeProductIds: [productId],
          selectedProducts: [{ _id: productId, name: "Old selection", unavailable: false }]
        }}
        busy={false}
        onSubmit={save}
      />
    );
    expect(screen.getByText("Old selection")).toBeTruthy();
    change("Tên voucher", "Dirty draft");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Write failed");
    expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe("Dirty draft");
    expect(save.mock.calls[0][0].scopeProductIds).toEqual([productId]);
  });
  it("aborts superseded selectors, ignores late data, and retains a newly chosen target", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.listVoucherProductTargetsAPI>>>();
    vi.mocked(api.listVoucherProductTargetsAPI)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(list([{ _id: productId, name: "Shirt" }]));
    const { unmount } = render(
      <VoucherForm
        voucher={{ ...voucher, scopeType: "products" }}
        busy={false}
        onSubmit={vi.fn()}
      />
    );
    await waitFor(() => expect(api.listVoucherProductTargetsAPI).toHaveBeenCalledTimes(1));
    search("Sản phẩm áp dụng", "shirt");
    await waitFor(() => expect(api.listVoucherProductTargetsAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.listVoucherProductTargetsAPI).mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => pending.resolve(list([{ _id: categoryId, name: "OLD SELECTOR" }])));
    await select("Sản phẩm áp dụng", "Shirt");
    vi.mocked(api.listVoucherProductTargetsAPI).mockResolvedValue(list([]));
    search("Sản phẩm áp dụng", "unrelated");
    await waitFor(() => expect(api.listVoucherProductTargetsAPI).toHaveBeenCalledTimes(3));
    expect(
      screen.getByText("Shirt", { selector: ".ant-select-selection-item-content" })
    ).toBeTruthy();
    expect(screen.queryByText("OLD SELECTOR")).toBeNull();
    unmount();
    expect(vi.mocked(api.listVoucherProductTargetsAPI).mock.calls[2][1]?.aborted).toBe(true);
  });
});

describe("voucher list, revision recovery and history", () => {
  it("preserves unsaved rules through a confirmed toggle and saves them with the new revision", async () => {
    vi.mocked(api.updateVoucherAPI)
      .mockResolvedValueOnce({
        data: { ...voucher, isActive: false, availability: "disabled", revision: 1 },
        message: "success"
      })
      .mockResolvedValueOnce({
        data: { ...voucher, name: "Dirty name", discountValue: 30, isActive: false, revision: 2 },
        message: "success"
      });
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "SAVE_20" }));
    await screen.findByLabelText("Tên voucher");
    change("Tên voucher", "Dirty name");
    change("Giá trị giảm", "30");
    fireEvent.click(screen.getByRole("button", { name: "Tắt voucher" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("button", { name: "Bật voucher" });
    expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe("Dirty name");
    expect((screen.getByLabelText("Giá trị giảm") as HTMLInputElement).value).toBe("30");
    expect(screen.getByRole("status").textContent).toBe("Đã lưu voucher thành công");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await waitFor(() => expect(api.updateVoucherAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateVoucherAPI).mock.calls[1][1]).toMatchObject({
      expectedRevision: 1,
      name: "Dirty name",
      discountValue: 30,
      isActive: false
    });
    await screen.findByText("Phiên bản hiện tại: 2");
    expect(screen.getByRole("status").textContent).toBe("Đã lưu voucher thành công");
  });
  it("keeps a stale draft locked if recovery fails and requires an explicit fresh read", async () => {
    vi.mocked(api.getVoucherAPI)
      .mockResolvedValueOnce({ data: voucher, message: "success" })
      .mockRejectedValueOnce(new Error("Recovery failed"))
      .mockResolvedValue({
        data: { ...voucher, name: "Reviewed rules", revision: 2 },
        message: "success"
      });
    vi.mocked(api.updateVoucherAPI).mockRejectedValueOnce(new ApiError("Stale revision", 409));
    drawer();
    await screen.findByLabelText("Tên voucher");
    change("Tên voucher", "Dirty draft");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Không tải được phiên bản mới: Recovery failed");
    expect(screen.queryByText("Phiên bản hiện tại: 0")).toBeNull();
    expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe("Dirty draft");
    expect(
      (screen.getByRole("button", { name: "Lưu voucher" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại và bỏ bản nháp" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe(
        "Reviewed rules"
      )
    );
    expect(api.updateVoucherAPI).toHaveBeenCalledTimes(1);
  });
  it("confirms enabling with the current revision and blocks duplicate pending writes", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.updateVoucherAPI>>>();
    vi.mocked(api.getVoucherAPI).mockResolvedValue({
      data: { ...voucher, isActive: false, availability: "disabled" },
      message: "success"
    });
    vi.mocked(api.updateVoucherAPI).mockReturnValueOnce(pending.promise);
    drawer();
    fireEvent.click(await screen.findByRole("button", { name: "Bật voucher" }));
    expect(api.updateVoucherAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(api.updateVoucherAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateVoucherAPI).mock.calls[0][1]).toEqual({
      expectedRevision: 0,
      isActive: true
    });
    expect(
      (screen.getByRole("button", { name: "Lưu voucher" }) as HTMLButtonElement).disabled
    ).toBe(true);
    await act(async () =>
      pending.resolve({ data: { ...voucher, revision: 1 }, message: "success" })
    );
    await screen.findByRole("button", { name: "Tắt voucher" });
  });
  it("does not loop if the recovered last page shrinks again", async () => {
    vi.mocked(api.listVouchersAPI)
      .mockResolvedValueOnce(list([], 3, 15))
      .mockResolvedValueOnce(list([], 2, 0));
    const { router } = renderList("/vouchers?page=3");
    await screen.findByText("Không có voucher");
    expect(api.listVouchersAPI).toHaveBeenCalledTimes(2);
    expect(router.state.location.search).toBe("?page=2");
  });
  it("paginates history independently from the voucher list", async () => {
    vi.mocked(api.listVoucherRedemptionsAPI).mockImplementation(async (_id, query) =>
      list([redemption], query.page, 25, query.pageSize)
    );
    drawer();
    await screen.findByRole("link", { name: "ORD-1" });
    const history = screen.getByRole("region", { name: "Lịch sử sử dụng voucher" });
    fireEvent.click(history.querySelector(".ant-pagination-item-2")!);
    await waitFor(() =>
      expect(api.listVoucherRedemptionsAPI).toHaveBeenLastCalledWith(
        "voucher-id",
        { page: 2, pageSize: 10 },
        expect.any(AbortSignal)
      )
    );
    await select("Lọc lượt sử dụng", "Đã hoàn lượt");
    await waitFor(() =>
      expect(api.listVoucherRedemptionsAPI).toHaveBeenLastCalledWith(
        "voucher-id",
        { page: 1, pageSize: 10, state: "released" },
        expect.any(AbortSignal)
      )
    );
    expect(api.listVouchersAPI).not.toHaveBeenCalled();
  });
  it("separates loading, error/retry and empty states without inventing zero counts", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.listVouchersAPI>>>();
    vi.mocked(api.listVouchersAPI).mockReturnValueOnce(pending.promise).mockResolvedValue(list([]));
    renderList();
    expect(screen.getByLabelText("Đang tải voucher")).toBeTruthy();
    expect(screen.queryByText("Tổng 0 voucher")).toBeNull();
    await act(async () => pending.reject(new Error("Read failed")));
    await screen.findByText("Read failed");
    expect(screen.queryByText("Tổng 0 voucher")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByText("Không có voucher");
  });
  it("commits URL filters, resets page and recovers a shrunk last page only once", async () => {
    vi.mocked(api.listVouchersAPI).mockImplementation(async query =>
      list(query.page === 3 ? [] : [voucher], query.page, 15, query.pageSize)
    );
    const { router } = renderList("/vouchers?page=3&search=SAVE");
    await screen.findByRole("button", { name: "SAVE_20" });
    expect(router.state.location.search).toBe("?page=2&search=SAVE");
    expect(api.listVouchersAPI).toHaveBeenCalledTimes(2);
    change("Tìm voucher", "new");
    expect(api.listVouchersAPI).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
    await waitFor(() => expect(router.state.location.search).toBe("?search=new"));
    await select("Lọc tình trạng voucher", "Đã tắt");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?search=new&availability=disabled")
    );
  });
  it("uses backend counted/remaining uses and safely links audit orders with separate filter/retry", async () => {
    vi.mocked(api.listVoucherRedemptionsAPI)
      .mockRejectedValueOnce(new Error("History failed"))
      .mockResolvedValue(list([redemption]));
    drawer();
    await screen.findByText("Đã dùng: 7");
    expect(screen.getByText("Còn lại: 3")).toBeTruthy();
    await screen.findByText("History failed");
    expect(screen.queryByText("Tổng 0 lượt sử dụng")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại lịch sử" }));
    const link = await screen.findByRole("link", { name: "ORD-1" });
    expect(link.getAttribute("href")).toBe("/orders/order%2F1");
    expect(screen.getByText("an@example.test")).toBeTruthy();
    expect(screen.getByText("cancelled")).toBeTruthy();
    await select("Lọc lượt sử dụng", "Đã hoàn lượt");
    await waitFor(() =>
      expect(api.listVoucherRedemptionsAPI).toHaveBeenLastCalledWith(
        "voucher-id",
        { page: 1, pageSize: 10, state: "released" },
        expect.any(AbortSignal)
      )
    );
  });
  it("stale save preserves revision 0 and draft; fresh revision 1 is reviewed only on explicit discard", async () => {
    vi.mocked(api.getVoucherAPI)
      .mockResolvedValueOnce({ data: voucher, message: "success" })
      .mockResolvedValue({
        data: { ...voucher, name: "Other tab", revision: 1, usedCount: 8, remainingUses: 2 },
        message: "success"
      });
    vi.mocked(api.updateVoucherAPI).mockRejectedValueOnce(new ApiError("Stale revision", 409));
    drawer();
    await screen.findByLabelText("Tên voucher");
    change("Tên voucher", "My dirty draft");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Phiên bản hiện tại: 1");
    expect(screen.getByText("Đã dùng: 8")).toBeTruthy();
    expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe("My dirty draft");
    expect(vi.mocked(api.updateVoucherAPI).mock.calls[0][1]).toMatchObject({
      expectedRevision: 0,
      name: "My dirty draft"
    });
    expect(vi.mocked(api.updateVoucherAPI).mock.calls[0][1]).not.toHaveProperty("code");
    expect(
      (screen.getByRole("button", { name: "Lưu voucher" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại và bỏ bản nháp" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe("Other tab")
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await waitFor(() => expect(api.updateVoucherAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateVoucherAPI).mock.calls[1][1].expectedRevision).toBe(1);
  });
  it("shows missing selections, never broadens scope, and confirms a sparse disable", async () => {
    const missing = {
      ...voucher,
      scopeType: "products" as const,
      scopeProductIds: [productId],
      selectedProducts: [{ _id: productId, name: null, unavailable: true }]
    };
    vi.mocked(api.getVoucherAPI).mockResolvedValue({ data: missing, message: "success" });
    vi.mocked(api.listVoucherProductTargetsAPI).mockResolvedValue(list([]));
    drawer();
    await screen.findByText(`Không còn khả dụng (${productId})`);
    fireEvent.click(screen.getByRole("button", { name: "Tắt voucher" }));
    expect(api.updateVoucherAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận" }));
    await waitFor(() =>
      expect(api.updateVoucherAPI).toHaveBeenCalledWith("voucher-id", {
        expectedRevision: 0,
        isActive: false
      })
    );
    expect(screen.queryByRole("button", { name: /Xóa/ })).toBeNull();
  });
  it("keys list and open drawer by account; late old selector/history/list responses stay hidden", async () => {
    const history = deferred<Awaited<ReturnType<typeof api.listVoucherRedemptionsAPI>>>();
    const targets = deferred<Awaited<ReturnType<typeof api.listVoucherProductTargetsAPI>>>();
    const oldList = deferred<Awaited<ReturnType<typeof api.listVouchersAPI>>>();
    vi.mocked(api.getVoucherAPI).mockResolvedValue({
      data: {
        ...voucher,
        scopeType: "products",
        scopeProductIds: [productId],
        selectedProducts: [{ _id: productId, name: "Selected", unavailable: false }]
      },
      message: "success"
    });
    vi.mocked(api.listVoucherRedemptionsAPI).mockReturnValueOnce(history.promise);
    vi.mocked(api.listVoucherProductTargetsAPI).mockReturnValueOnce(targets.promise);
    const { unmount } = renderList();
    fireEvent.click(await screen.findByRole("button", { name: "SAVE_20" }));
    await screen.findByLabelText("Tên voucher");
    await waitFor(() => expect(api.listVoucherProductTargetsAPI).toHaveBeenCalled());
    vi.mocked(api.listVouchersAPI).mockReturnValueOnce(oldList.promise).mockResolvedValue(list([]));
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(api.listVouchersAPI).toHaveBeenCalledTimes(2));
    await act(async () => useAppStore.getState().setProfile({ ...profile, _id: "admin-b" }));
    await screen.findByText("Không có voucher");
    await act(async () => {
      history.resolve(list([{ ...redemption, orderNumber: "OLD HISTORY" }]));
      targets.resolve(list([{ _id: categoryId, name: "OLD TARGET" }]));
      oldList.resolve(list([{ ...voucher, code: "OLD LIST" }]));
    });
    expect(screen.queryByText("OLD HISTORY")).toBeNull();
    expect(screen.queryByText("OLD TARGET")).toBeNull();
    expect(screen.queryByText("OLD LIST")).toBeNull();
    expect(vi.mocked(api.listVoucherRedemptionsAPI).mock.calls[0][2]?.aborted).toBe(true);
    expect(vi.mocked(api.listVoucherProductTargetsAPI).mock.calls[0][1]?.aborted).toBe(true);
    unmount();
  });
  it("ignores late history after filter change and unmount", async () => {
    const history = deferred<Awaited<ReturnType<typeof api.listVoucherRedemptionsAPI>>>();
    vi.mocked(api.listVoucherRedemptionsAPI).mockReturnValueOnce(history.promise);
    const rendered = drawer();
    await screen.findByLabelText("Tên voucher");
    await select("Lọc lượt sử dụng", "Đã hoàn lượt");
    await screen.findByRole("link", { name: "ORD-1" });
    await act(async () => history.resolve(list([{ ...redemption, orderNumber: "OLD HISTORY" }])));
    expect(screen.queryByText("OLD HISTORY")).toBeNull();
    rendered.unmount();
    expect(vi.mocked(api.listVoucherRedemptionsAPI).mock.calls[1][2]?.aborted).toBe(true);
  });
});

describe("voucher permission actions", () => {
  it.each([
    ["products", "create"],
    ["categories", "create"],
    ["products", "update"],
    ["categories", "update"]
  ] as const)(
    "retains unsaved %s labels and IDs across %s permission refresh",
    async (scope, action) => {
      const permission = action === "create" ? "COUPON_CREATE" : "COUPON_UPDATE";
      const writer = staffProfile(["COUPON_READ", permission]);
      useAppStore.getState().setProfile(writer);
      const targets =
        scope === "products" ? api.listVoucherProductTargetsAPI : api.listVoucherCategoryTargetsAPI;
      const otherTargets =
        scope === "products" ? api.listVoucherCategoryTargetsAPI : api.listVoucherProductTargetsAPI;
      const label = scope === "products" ? "Sản phẩm áp dụng" : "Danh mục áp dụng";
      const name = scope === "products" ? "Shirt" : "Clothes";
      const id = scope === "products" ? productId : categoryId;
      const save = vi.fn(async (_input: api.CouponInput) => {});
      render(
        <VoucherForm voucher={action === "create" ? null : voucher} busy={false} onSubmit={save} />
      );
      if (action === "create") {
        change("Mã voucher", "DRAFT");
        pickDate("Thời điểm có hiệu lực", "09/10/2026 00:00:00");
        pickDate("Thời điểm kết thúc", "10/10/2026 00:00:00");
      }
      change("Tên voucher", "Unsaved target draft");
      await select("Phạm vi", scope === "products" ? "Sản phẩm đã chọn" : "Danh mục đã chọn");
      await select(label, name);
      const pending = deferred<Awaited<ReturnType<typeof targets>>>();
      vi.mocked(targets).mockReturnValueOnce(pending.promise).mockResolvedValue(list([]));
      search(label, "unrelated");
      await waitFor(() => expect(targets).toHaveBeenCalledTimes(2));
      await act(async () => useAppStore.getState().setProfile(staffProfile(["COUPON_READ"])));
      expect(vi.mocked(targets).mock.calls[1][1]?.aborted).toBe(true);
      await act(async () =>
        pending.resolve(list([{ _id: "000000000000000000000003", name: "Late target" }]))
      );
      expect(
        screen.queryByText(name, { selector: ".ant-select-selection-item-content" })?.textContent
      ).toBe(name);
      expect(screen.queryByText("Late target")).toBeNull();
      expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe(
        "Unsaved target draft"
      );
      const submit = screen.getByRole("button", {
        name: action === "create" ? "Tạo voucher" : "Lưu voucher"
      });
      expect(submit.hasAttribute("disabled")).toBe(true);
      const selector = screen.getByRole("combobox", { name: label });
      expect(selector.hasAttribute("disabled")).toBe(true);
      // Bypass disabled controls to exercise the request and submit guards.
      fireEvent.change(selector, { target: { value: "forced search" } });
      fireEvent.submit(submit.closest("form")!);
      await act(async () => {});
      expect(targets).toHaveBeenCalledTimes(2);
      expect(otherTargets).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      await act(async () => useAppStore.getState().setProfile(writer));
      await waitFor(() => expect(targets).toHaveBeenCalledTimes(3));
      expect(
        screen.getByText(name, { selector: ".ant-select-selection-item-content" }).textContent
      ).toBe(name);
      fireEvent.click(submit);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0][0]).toMatchObject({
        name: "Unsaved target draft",
        scopeType: scope,
        scopeProductIds: scope === "products" ? [id] : [],
        scopeCategoryIds: scope === "categories" ? [id] : []
      });
    },
    15000
  );
  it("keeps voucher detail/history readable and disables create/edit/toggle", async () => {
    useAppStore.getState().setProfile(staffProfile(["COUPON_READ"]));
    renderList();
    expect(screen.getByRole("button", { name: "Thêm voucher" }).hasAttribute("disabled")).toBe(
      true
    );
    fireEvent.click(await screen.findByRole("button", { name: "SAVE_20" }));
    const save = await screen.findByRole("button", { name: "Lưu voucher" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Tắt voucher" }).hasAttribute("disabled")).toBe(true);
    expect(await screen.findByText("ORD-1")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ORD-1" })).toBeNull();
  });
  it("preserves the voucher draft and blocks forced form submit after refresh", async () => {
    drawer();
    await screen.findByRole("button", { name: "Lưu voucher" });
    change("Tên voucher", "Unsaved voucher");
    act(() => useAppStore.getState().setProfile(staffProfile(["COUPON_READ"])));
    expect((screen.getByLabelText("Tên voucher") as HTMLInputElement).value).toBe(
      "Unsaved voucher"
    );
    expect(screen.getByRole("button", { name: "Lưu voucher" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByLabelText("Tên voucher").closest("form")!);
    await act(async () => {});
    expect(api.updateVoucherAPI).not.toHaveBeenCalled();
  });
  it("rechecks authority when a pending activation confirmation is accepted", async () => {
    drawer();
    fireEvent.click(await screen.findByRole("button", { name: "Tắt voucher" }));
    const confirm = await screen.findByRole("button", { name: "Xác nhận" });
    act(() => useAppStore.getState().setProfile(staffProfile(["COUPON_READ"])));
    fireEvent.click(confirm);
    expect(api.updateVoucherAPI).not.toHaveBeenCalled();
  });
  it("does not fetch write-only target selectors in a readonly scoped voucher", async () => {
    vi.mocked(api.getVoucherAPI).mockResolvedValue({
      data: {
        ...voucher,
        scopeType: "products",
        scopeProductIds: [productId],
        selectedProducts: [{ _id: productId, name: "Shirt", unavailable: false }]
      },
      message: "success"
    });
    useAppStore.getState().setProfile(staffProfile(["COUPON_READ"]));
    drawer();
    await screen.findByRole("button", { name: "Lưu voucher" });
    expect(screen.getByText("Shirt")).toBeTruthy();
    expect(api.listVoucherProductTargetsAPI).not.toHaveBeenCalled();
  });
});

it("COUPON_CREATE does not allow updating or activating an existing voucher", async () => {
  useAppStore.getState().setProfile(staffProfile(["COUPON_READ", "COUPON_CREATE"]));
  drawer();
  expect(
    (await screen.findByRole("button", { name: "Lưu voucher" })).hasAttribute("disabled")
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Tắt voucher" }).hasAttribute("disabled")).toBe(true);
});
