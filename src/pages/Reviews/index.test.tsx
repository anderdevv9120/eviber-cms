import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/reviews";
import Reviews from "./index";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/reviews", async importOriginal => ({
  REVIEW_NEXT_STATUSES: (await importOriginal<typeof api>()).REVIEW_NEXT_STATUSES,
  listReviewsAPI: vi.fn(),
  getReviewAPI: vi.fn(),
  updateReviewStatusAPI: vi.fn(),
  saveReviewReplyAPI: vi.fn(),
  deleteReviewReplyAPI: vi.fn()
}));

const review = (overrides: Partial<api.AdminReview> = {}): api.AdminReview => ({
  _id: "r1",
  displayName: "Khách A",
  email: "guest@example.test",
  reviewerType: "guest",
  userId: null,
  rating: 4,
  title: "Ổn",
  content: "Áo đẹp, giao nhanh",
  images: [],
  status: "pending",
  adminReply: null,
  product: { _id: "p1", name: "Áo Thun", image: "/images/p1.jpg" },
  variantId: null,
  orderId: "o1",
  orderNumber: "ORD-1",
  created_at: "2026-10-05T00:00:00.000Z",
  updated_at: "2026-10-05T00:00:00.000Z",
  ...overrides
});
const ok = <T,>(data: T) => ({ data, message: "success" });
const page = (data: api.AdminReview[]) =>
  ok({ data, total: data.length, page: 1, pageSize: 20, totalPage: 1 });

const setup = (path = "/reviews") => {
  const router = createMemoryRouter(
    [
      { path: "/reviews", element: <Reviews /> },
      { path: "*", element: <p>Other page</p> }
    ],
    { initialEntries: [path] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};
const openDrawer = async (name = "Khách A") => {
  fireEvent.click(await screen.findByRole("button", { name: `Xem đánh giá của ${name}` }));
  return screen.findByRole("dialog");
};

describe("reviews page", () => {
  beforeEach(() => {
    vi.mocked(api.listReviewsAPI)
      .mockReset()
      .mockResolvedValue(page([review()]));
    vi.mocked(api.getReviewAPI).mockReset().mockResolvedValue(ok(review()));
    vi.mocked(api.updateReviewStatusAPI)
      .mockReset()
      .mockResolvedValue(ok(review({ status: "approved" })));
    vi.mocked(api.saveReviewReplyAPI).mockReset();
    vi.mocked(api.deleteReviewReplyAPI).mockReset();
  });

  it("loads pending reviews by default", async () => {
    setup();
    expect(await screen.findByText("Áo Thun")).toBeTruthy();
    expect(api.listReviewsAPI).toHaveBeenCalledWith(
      { status: "pending", page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    );
  });

  it("reads filters from the URL and writes tab changes back", async () => {
    const router = setup("/reviews?status=approved&rating=5&search=%C3%A1o");
    await screen.findByText("Áo Thun");
    expect(api.listReviewsAPI).toHaveBeenLastCalledWith(
      { status: "approved", page: 1, pageSize: 20, rating: 5, search: "áo" },
      expect.any(AbortSignal)
    );
    fireEvent.click(screen.getByRole("tab", { name: "Đã từ chối" }));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?status=rejected&rating=5&search=%C3%A1o")
    );
  });

  it("offers approve and reject for a pending review and refreshes the list after approving", async () => {
    setup();
    const drawer = await openDrawer();
    await within(drawer).findByText("Áo đẹp, giao nhanh");
    expect(within(drawer).getByRole("button", { name: "Từ chối" })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Duyệt" }));
    await waitFor(() => expect(api.updateReviewStatusAPI).toHaveBeenCalledWith("r1", "approved"));
    await waitFor(() => expect(api.listReviewsAPI).toHaveBeenCalledTimes(2));
  });

  it("offers only reject for an approved review", async () => {
    vi.mocked(api.getReviewAPI).mockResolvedValue(ok(review({ status: "approved" })));
    setup("/reviews?status=approved");
    const drawer = await openDrawer();
    await within(drawer).findByRole("button", { name: "Từ chối" });
    expect(within(drawer).queryByRole("button", { name: "Duyệt" })).toBeNull();
  });

  it("links to the order and the guest buyer page", async () => {
    setup();
    const drawer = await openDrawer();
    expect((await within(drawer).findByRole("link", { name: "ORD-1" })).getAttribute("href")).toBe(
      "/orders/o1"
    );
    expect(within(drawer).getByRole("link", { name: "Khách A" }).getAttribute("href")).toBe(
      "/customers/guests/detail?email=guest%40example.test"
    );
  });

  it("links registered reviewers to their customer page", async () => {
    vi.mocked(api.getReviewAPI).mockResolvedValue(
      ok(review({ reviewerType: "registered", userId: "u1" }))
    );
    setup();
    const drawer = await openDrawer();
    expect(
      (await within(drawer).findByRole("link", { name: "Khách A" })).getAttribute("href")
    ).toBe("/customers/registered/u1");
  });

  it("shows a deleted product clearly", async () => {
    vi.mocked(api.getReviewAPI).mockResolvedValue(ok(review({ product: null })));
    setup();
    const drawer = await openDrawer();
    expect(await within(drawer).findByText("Sản phẩm đã bị xóa")).toBeTruthy();
  });

  it("saves a trimmed reply and notes it is not on the storefront yet", async () => {
    vi.mocked(api.saveReviewReplyAPI).mockResolvedValue(
      ok(
        review({
          adminReply: { content: "Cảm ơn", repliedAt: "2026-10-06T00:00:00.000Z", repliedBy: "a" }
        })
      )
    );
    setup();
    const drawer = await openDrawer();
    expect(await within(drawer).findByText(/chưa hiển thị trên trang bán hàng/)).toBeTruthy();
    fireEvent.change(within(drawer).getByLabelText("Nội dung phản hồi"), {
      target: { value: "  Cảm ơn  " }
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Lưu phản hồi" }));
    await waitFor(() => expect(api.saveReviewReplyAPI).toHaveBeenCalledWith("r1", "Cảm ơn"));
    expect(await within(drawer).findByRole("button", { name: "Xóa phản hồi" })).toBeTruthy();
  });

  it("keeps the typed reply when saving fails", async () => {
    vi.mocked(api.saveReviewReplyAPI).mockRejectedValue(new ApiError("Máy chủ lỗi", 500));
    setup();
    const drawer = await openDrawer();
    const box = await within(drawer).findByLabelText("Nội dung phản hồi");
    fireEvent.change(box, { target: { value: "Cảm ơn bạn" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Lưu phản hồi" }));
    expect(await within(drawer).findByText("Máy chủ lỗi")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("Cảm ơn bạn");
  });
});
