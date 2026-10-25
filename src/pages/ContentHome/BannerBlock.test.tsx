import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import { deferred } from "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/banners";
import * as imagesApi from "@/services/images";
import BannerBlock from "./BannerBlock";
import { PATH } from "@/constants/paths";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/banners", () => ({
  listBannersAPI: vi.fn(),
  createBannerAPI: vi.fn(),
  updateBannerAPI: vi.fn(),
  deleteBannerAPI: vi.fn(),
  reorderBannersAPI: vi.fn()
}));
vi.mock("@/services/images", () => ({ uploadImageAPI: vi.fn() }));

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
      {
        path: PATH.CONTENT_HOME,
        element: (
          <App component={false}>
            <BannerBlock />
          </App>
        )
      },
      { path: "/other", element: <p>Trang khác</p> }
    ],
    { initialEntries: [PATH.CONTENT_HOME] }
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
    useAppStore.getState().setProfile(ownerProfile);
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
    vi.mocked(imagesApi.uploadImageAPI)
      .mockReset()
      .mockResolvedValue(ok({ path: "/images/hero_1.png" }));
  });

  it("blocks every banner mutation for read-only staff", async () => {
    useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"]));
    setup();
    await screen.findByText("Banner A");
    for (const name of ["Thêm banner", "Sửa Banner A", "Xóa Banner A", "Sắp xếp Banner A"])
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("switch", { name: "Hiển thị Banner A" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("preserves a selected image and draft when permission is revoked in the banner form", async () => {
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: "Sale draft" } });
    act(() => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"])));
    expect((within(dialog).getByLabelText("Tiêu đề") as HTMLInputElement).value).toBe("Sale draft");
    const button = within(dialog).getByRole("button", { name: "Lưu banner" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.disabled = false;
    fireEvent.click(button);
    await act(async () => {});
    expect(imagesApi.uploadImageAPI).not.toHaveBeenCalled();
    expect(api.createBannerAPI).not.toHaveBeenCalled();
  });

  it("rechecks authority when an already-open delete confirmation is accepted", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Banner A" }));
    const confirm = await screen.findByRole("button", { name: "Xóa banner" });
    act(() => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"])));
    fireEvent.click(confirm);
    await act(async () => {});
    expect(api.deleteBannerAPI).not.toHaveBeenCalled();
  });

  it("retains unsaved ordering but disables saving when permission changes", async () => {
    setup();
    await screen.findByText("Banner A");
    drag("Banner B", rows()[0]);
    act(() => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"])));
    expect(rows().map(row => within(row).getByText(/Banner [AB]/).textContent)).toEqual([
      "Banner B",
      "Banner A"
    ]);
    expect((screen.getByRole("button", { name: "Lưu thứ tự" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("does not write the banner when authority changes during an authorized upload", async () => {
    const pending = deferred<Awaited<ReturnType<typeof imagesApi.uploadImageAPI>>>();
    vi.mocked(imagesApi.uploadImageAPI).mockReturnValueOnce(pending.promise);
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), { target: { value: "Sale draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu banner" }));
    await waitFor(() => expect(imagesApi.uploadImageAPI).toHaveBeenCalledTimes(1));
    act(() => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"])));
    await act(async () => pending.resolve(ok({ path: "/images/uploaded.jpg" })));
    expect(api.createBannerAPI).not.toHaveBeenCalled();
    expect((within(dialog).getByLabelText("Tiêu đề") as HTMLInputElement).value).toBe("Sale draft");
    expect(
      (within(dialog).getByRole("button", { name: "Lưu banner" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("keeps an authorized draft when the backend denies a forced banner submission", async () => {
    vi.mocked(api.updateBannerAPI).mockRejectedValueOnce(new ApiError("Không có quyền", 403));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Banner A" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tiêu đề"), {
      target: { value: "Draft denied" }
    });
    const button = within(dialog).getByRole("button", { name: "Lưu banner" }) as HTMLButtonElement;
    button.disabled = false;
    fireEvent.click(button);
    await within(dialog).findByText("Không có quyền");
    expect((within(dialog).getByLabelText("Tiêu đề") as HTMLInputElement).value).toBe(
      "Draft denied"
    );
    expect(api.updateBannerAPI).toHaveBeenCalledExactlyOnceWith(
      "a",
      expect.objectContaining({ title: "Draft denied" })
    );
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
    expect(imagesApi.uploadImageAPI).not.toHaveBeenCalled();
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
    expect(imagesApi.uploadImageAPI).not.toHaveBeenCalled();
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
    expect(imagesApi.uploadImageAPI).toHaveBeenCalledTimes(1);
  });

  it("cancels a selected image without uploading", async () => {
    setup();
    const dialog = await openCreate();
    upload(dialog);
    await within(dialog).findByAltText("Ảnh banner xem trước");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(imagesApi.uploadImageAPI).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/banner-preview");
  });

  it("keeps the selection for retry when upload fails and does not save the banner", async () => {
    vi.mocked(imagesApi.uploadImageAPI).mockRejectedValueOnce(new ApiError("File too large", 413));
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
    expect(imagesApi.uploadImageAPI).toHaveBeenCalledTimes(2);
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
    expect(imagesApi.uploadImageAPI).toHaveBeenCalledTimes(1);
  });

  it("deletes a banner after confirmation", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Xóa Banner A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa banner" }));
    await waitFor(() => expect(api.deleteBannerAPI).toHaveBeenCalledWith("a"));
  });
});
