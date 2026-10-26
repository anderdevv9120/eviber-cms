import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import "@/test/attribute-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ApiError } from "@/utils/request";
import * as api from "@/services/inventory";
import { INVENTORY_ERROR } from "./inventory-errors";
import StockHistoryDrawer from "./StockHistoryDrawer";

vi.mock("@/services/inventory", () => ({ getInventoryMovementsAPI: vi.fn() }));

const variant: api.InventoryRow = {
  variantId: "v1",
  productId: "p1",
  productName: "Áo thun",
  productStatus: "PUBLISH",
  sku: "SKU-1",
  attributeLabels: ["Đỏ", "M"],
  image: null,
  variantStatus: "ACTIVE",
  inventoryCount: 42
};
const movement = (overrides: Partial<api.InventoryMovement>): api.InventoryMovement => ({
  id: "m1",
  createdAt: "2026-10-14T03:00:00.000Z",
  reason: "manual_adjust",
  delta: 5,
  stockAfter: 42,
  note: "Nhập kho",
  actor: { id: "u1", name: "Lan" },
  order: null,
  ...overrides
});
const list = (data: api.InventoryMovement[], page = 1, total = data.length) => ({
  data: {
    data,
    total,
    page,
    pageSize: 10,
    totalPage: Math.max(1, Math.ceil(total / 10)),
    variant
  },
  message: "success"
});
const fullRows = [
  movement({
    id: "m1",
    reason: "order",
    delta: -3,
    stockAfter: 37,
    order: { id: "o1", orderNumber: "DH-001" }
  }),
  movement({
    id: "m2",
    reason: "cancel_restock",
    delta: 3,
    order: { id: "o2", orderNumber: "DH-002" }
  }),
  movement({ id: "m3", reason: "return", delta: 1, note: null }),
  movement({ id: "m4", reason: "manual_adjust", delta: 5, note: "Kiểm kê tay" })
];
const renderDrawer = (refreshKey = 0) => {
  const ui = (key: number) => (
    <MemoryRouter>
      <StockHistoryDrawer variantId='v1' open onClose={() => undefined} refreshKey={key} />
    </MemoryRouter>
  );
  const view = render(ui(refreshKey));
  return { rerenderWith: (key: number) => view.rerender(ui(key)) };
};
const fetchMovements = vi.mocked(api.getInventoryMovementsAPI);

beforeEach(() => {
  fetchMovements.mockReset().mockResolvedValue(list(fullRows));
});

describe("StockHistoryDrawer", () => {
  it("shows the variant header and one row per movement with tags and signed deltas", async () => {
    renderDrawer();
    expect(await screen.findByText("Áo thun")).toBeTruthy();
    expect(screen.getByText("Đỏ / M")).toBeTruthy();
    expect(screen.getByText("SKU-1")).toBeTruthy();
    expect(screen.getByText("42", { selector: "strong" })).toBeTruthy();
    expect(fetchMovements).toHaveBeenCalledWith("v1", { page: 1, pageSize: 10 }, expect.anything());
    for (const tag of ["Đơn hàng", "Hoàn kho huỷ đơn", "Hoàn trả", "Điều chỉnh tay"])
      expect(screen.getByText(tag, { selector: ".ant-tag" })).toBeTruthy();
    expect(screen.getByText("−3").className).toContain("ant-typography-danger");
    expect(screen.getByText("+5").className).toContain("ant-typography-success");
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getAllByText("Lan", { selector: "td" })).toHaveLength(4);
    expect(screen.getByText("Kiểm kê tay")).toBeTruthy();
  });

  it("links the order number to the order detail", async () => {
    renderDrawer();
    expect((await screen.findByRole("link", { name: "DH-001" })).getAttribute("href")).toBe(
      "/orders/o1"
    );
  });

  it("shows a dash and no link for a missing note, actor and order", async () => {
    fetchMovements.mockResolvedValue(
      list([movement({ id: "legacy", note: null, actor: null, order: null })])
    );
    renderDrawer();
    const cells = within((await screen.findByText("+5")).closest("tr")!).getAllByRole("cell");
    expect(cells.filter(cell => cell.textContent === "—")).toHaveLength(3); // actor, note, order
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a not-found message and no spinner when the variant is gone", async () => {
    fetchMovements.mockRejectedValue(
      new ApiError("Biến thể không tồn tại", 404, { code: INVENTORY_ERROR.VARIANT_NOT_FOUND })
    );
    renderDrawer();
    expect(
      await screen.findByText("Biến thể không còn tồn tại hoặc sản phẩm đã bị xoá.")
    ).toBeTruthy();
    expect(screen.queryByLabelText("Đang tải lịch sử tồn kho")).toBeNull();
    expect(document.querySelector(".ant-spin")).toBeNull();
  });

  it("shows other failures with a retry", async () => {
    fetchMovements.mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500));
    renderDrawer();
    expect(await screen.findByText("Máy chủ lỗi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("DH-001")).toBeTruthy();
  });

  it("requests page 2 from the pagination", async () => {
    fetchMovements.mockImplementation(async (_id, query) => list(fullRows, query.page, 25));
    renderDrawer();
    await screen.findByText("DH-001");
    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() =>
      expect(fetchMovements).toHaveBeenLastCalledWith(
        "v1",
        { page: 2, pageSize: 10 },
        expect.anything()
      )
    );
  });

  it("refetches page 1 when refreshKey changes", async () => {
    fetchMovements.mockImplementation(async (_id, query) => list(fullRows, query.page, 25));
    const { rerenderWith } = renderDrawer();
    await screen.findByText("DH-001");
    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() => expect(fetchMovements).toHaveBeenCalledTimes(2));
    await screen.findByText("DH-001");
    rerenderWith(1);
    await waitFor(() => expect(fetchMovements).toHaveBeenCalledTimes(3));
    expect(fetchMovements).toHaveBeenLastCalledWith(
      "v1",
      { page: 1, pageSize: 10 },
      expect.anything()
    );
  });
});

beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
});

it("retains order numbers as plain text without ORDER_READ", async () => {
  useAppStore.getState().setProfile(staffProfile(["INVENTORY_READ"]));
  renderDrawer();
  await screen.findByText("DH-001");
  expect(screen.queryByRole("link", { name: "DH-001" })).toBeNull();
});
