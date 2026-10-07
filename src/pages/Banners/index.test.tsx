import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/banners";
import Banners from "./index";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/banners", () => ({
  listBannersAPI: vi.fn(),
  createBannerAPI: vi.fn(),
  updateBannerAPI: vi.fn(),
  deleteBannerAPI: vi.fn(),
  reorderBannersAPI: vi.fn(),
  uploadImageAPI: vi.fn()
}));

const banner = (id: string, title: string, sortOrder: number): api.Banner => ({
  _id: id,
  image: `/images/${id}.jpg`,
  title,
  ctaLabel: "Mua ngay",
  ctaHref: "/collection",
  sortOrder,
  isActive: true
});
const first = banner("a", "Banner A", 0);
const second = banner("b", "Banner B", 1);
const ok = <T,>(data: T) => ({ data, message: "success" });

const setup = () => {
  const router = createMemoryRouter(
    [
      { path: "/banners", element: <Banners /> },
      { path: "/other", element: <p>Trang khác</p> }
    ],
    { initialEntries: ["/banners"] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  return router;
};
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const drag = (label: string, target: HTMLElement) => {
  const handle = screen.getByRole("button", { name: `Sắp xếp ${label}` });
  const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(handle, { dataTransfer });
};
const openCreate = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Thêm banner" }));
  return screen.findByRole("dialog");
};
const upload = (dialog: HTMLElement) => {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(["x"], "hero.png", { type: "image/png" })] }
  });
};

describe("banners page", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:http://localhost/banner-preview");
        static revokeObjectURL = vi.fn();
      }
    );
    vi.mocked(api.listBannersAPI)
      .mockReset()
      .mockResolvedValue(ok([first, second]));
    vi.mocked(api.reorderBannersAPI)
      .mockReset()
      .mockResolvedValue(ok([second, first]));
    vi.mocked(api.updateBannerAPI)
      .mockReset()
      .mockResolvedValue(ok({ ...first, isActive: false }));
    vi.mocked(api.createBannerAPI).mockReset();
    vi.mocked(api.deleteBannerAPI)
      .mockReset()
      .mockResolvedValue(ok({ success: true }));
    vi.mocked(api.uploadImageAPI)
      .mockReset()
      .mockResolvedValue(ok({ path: "/images/hero_1.png" }));
  });

  it("lists banners in order with thumbnails from the API host", async () => {
    setup();
    expect(await screen.findByText("Banner A")).toBeTruthy();
    expect(rows().map(row => row.querySelector("img")?.getAttribute("src"))).toEqual([
      "http://api.test:8001/images/a.jpg",
      "http://api.test:8001/images/b.jpg"
    ]);
  });

  it("shows the empty state and still allows creating a banner", async () => {
    vi.mocked(api.listBannersAPI).mockResolvedValue(ok([]));
    setup();
    expect(await screen.findByText("Chưa có banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thêm banner" }).hasAttribute("disabled")).toBe(
      false
    );
  });

  it("saves a dragged order", async () => {
    setup();
    await screen.findByText("Banner A");
    drag("Banner B", rows()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    await waitFor(() => expect(api.reorderBannersAPI).toHaveBeenCalledWith(["b", "a"]));
  });

  it("asks before leaving with an unsaved order", async () => {
    const router = setup();
    await screen.findByText("Banner A");
    drag("Banner B", rows()[0]);
    void router.navigate("/other");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Thứ tự chưa được lưu").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Bỏ thay đổi và rời đi" }));
    expect(await screen.findByText("Trang khác")).toBeTruthy();
  });

  it("reloads and explains when the saved order is stale", async () => {
    vi.mocked(api.reorderBannersAPI).mockRejectedValue(new ApiError("stale", 409));
    setup();
    await screen.findByText("Banner A");
    drag("Banner B", rows()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự" }));
    expect(await screen.findByText(/Danh sách banner đã thay đổi/)).toBeTruthy();
    expect(api.listBannersAPI).toHaveBeenCalledTimes(2);
  });

  it("switches a banner off from the table", async () => {
    setup();
    fireEvent.click(await screen.findByRole("switch", { name: "Hiển thị Banner A" }));
    await waitFor(() => expect(api.updateBannerAPI).toHaveBeenCalledWith("a", { isActive: false }));
  });

  it("requires button text and link together", async () => {
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: "Sale" } });
    fireEvent.change(within(dialog).getByLabelText("Nội dung nút"), { target: { value: "Mua" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    expect(await within(dialog).findByText(/Nhập cả nội dung nút và đường dẫn/)).toBeTruthy();
    expect(api.createBannerAPI).not.toHaveBeenCalled();
    expect(api.uploadImageAPI).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "/\\evil.example"])(
    "rejects an unsafe button link %s",
    async href => {
      setup();
      const dialog = await openCreate();
      fireEvent.change(within(dialog).getByLabelText("Đường dẫn nút"), { target: { value: href } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
      expect(await within(dialog).findByText(/Đường dẫn phải bắt đầu bằng/)).toBeTruthy();
    }
  );

  it("previews locally and uploads only when saving the banner", async () => {
    vi.mocked(api.createBannerAPI).mockResolvedValue(ok(banner("c", "Sale", 2)));
    setup();
    const dialog = await openCreate();
    upload(dialog);
    const preview = await within(dialog).findByAltText("Ảnh banner xem trước");
    expect(preview.getAttribute("src")).toBe("blob:http://localhost/banner-preview");
    expect(api.uploadImageAPI).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: " Sale " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    await waitFor(() =>
      expect(api.createBannerAPI).toHaveBeenCalledWith({
        image: "/images/hero_1.png",
        title: "Sale",
        subtitle: "",
        ctaLabel: "",
        ctaHref: "",
        isActive: true
      })
    );
    expect(api.uploadImageAPI).toHaveBeenCalledTimes(1);
  });

  it("cancels a selected image without uploading", async () => {
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.uploadImageAPI).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/banner-preview");
  });

  it("keeps the selection for retry when upload fails and does not save the banner", async () => {
    vi.mocked(api.uploadImageAPI).mockRejectedValueOnce(new ApiError("File too large", 413));
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: "Sale" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    expect(await within(dialog).findByText("File too large")).toBeTruthy();
    expect(api.createBannerAPI).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    await waitFor(() => expect(api.createBannerAPI).toHaveBeenCalledTimes(1));
    expect(api.uploadImageAPI).toHaveBeenCalledTimes(2);
  });

  it("keeps the form open with the error when saving fails", async () => {
    vi.mocked(api.createBannerAPI).mockRejectedValue(new ApiError("Tiêu đề quá dài", 400));
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: "Sale" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    expect(await within(dialog).findByText("Tiêu đề quá dài")).toBeTruthy();
    expect((within(dialog).getByLabelText("Tiêu đề") as HTMLInputElement).value).toBe("Sale");
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    await waitFor(() => expect(api.createBannerAPI).toHaveBeenCalledTimes(2));
    expect(api.uploadImageAPI).toHaveBeenCalledTimes(1);
  });

  it("deletes a banner after confirmation", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Banner A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa banner" }));
    await waitFor(() => expect(api.deleteBannerAPI).toHaveBeenCalledWith("a"));
  });
});
