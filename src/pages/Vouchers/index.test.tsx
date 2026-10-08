import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  roles: ["ADMIN"],
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
    change("Bắt đầu (UTC+07:00)", "2026-10-09T00:00");
    change("Kết thúc (UTC+07:00)", "2026-10-10T00:00");
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
  });
  it("keeps code immutable and sends literal percentage/cap, unlimited, and UTC dates", async () => {
    const save = vi.fn(async (_input: api.CouponInput) => {});
    render(<VoucherForm voucher={voucher} busy={false} onSubmit={save} />);
    expect((screen.getByLabelText("Mã voucher") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Bắt đầu (UTC+07:00)") as HTMLInputElement).value).toBe(
      "2026-10-09T00:00"
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
    change("Kết thúc (UTC+07:00)", "2026-10-08T00:00");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Kết thúc phải sau bắt đầu");
    change("Kết thúc (UTC+07:00)", "2026-10-10T00:00");
    await select("Phạm vi", "Sản phẩm đã chọn");
    fireEvent.click(screen.getByRole("button", { name: "Lưu voucher" }));
    await screen.findByText("Chọn ít nhất một mục");
    expect(save).not.toHaveBeenCalled();
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
    change("Tìm sản phẩm", "shirt");
    await waitFor(() => expect(api.listVoucherProductTargetsAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.listVoucherProductTargetsAPI).mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => pending.resolve(list([{ _id: categoryId, name: "OLD SELECTOR" }])));
    await select("Sản phẩm áp dụng", "Shirt");
    vi.mocked(api.listVoucherProductTargetsAPI).mockResolvedValue(list([]));
    change("Tìm sản phẩm", "unrelated");
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
