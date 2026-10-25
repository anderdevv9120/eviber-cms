import { ownerProfile, staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router";
import "@/test/attribute-fixtures";
import * as api from "@/services/storeContent";
import { ApiError } from "@/utils/request";
import { uploadImageAPI } from "@/services/images";
import ContentHome from "./index";

vi.mock("@/constants/env", () => ({
  ADMIN_API_URL: "http://api.test:8001/admin/v1",
  STOREFRONT_URL: "http://shop.test"
}));
vi.mock("@/services/storeContent", () => ({
  getStoreHomeAPI: vi.fn(),
  saveStoreHomeAPI: vi.fn()
}));
vi.mock("@/services/banners", () => ({
  listBannersAPI: vi.fn(async () => ({ data: [], message: "success" })),
  createBannerAPI: vi.fn(),
  updateBannerAPI: vi.fn(),
  deleteBannerAPI: vi.fn(),
  reorderBannersAPI: vi.fn()
}));
vi.mock("@/services/images", () => ({ uploadImageAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const tiles: api.PromoTile[] = [
  {
    title: "Ưu đãi",
    description: "Giảm giá",
    ctaLabel: "Mua ngay",
    href: "/collection",
    image: "https://img.test/a.jpg",
    theme: "light"
  },
  {
    title: "Hàng mới",
    description: "Mỗi tuần",
    ctaLabel: "Khám phá",
    href: "/collection",
    image: "https://img.test/b.jpg",
    theme: "dark"
  }
];
const settings: api.Revisioned<api.StoreHomeSettings> = {
  promoTiles: tiles,
  homePromises: [1, 2, 3, 4].map(n => ({ title: `Cam kết ${n}`, description: `Mô tả ${n}` })),
  brandStory: null,
  revision: 3
};
const story: api.BrandStory = {
  title: "Câu chuyện của chúng tôi",
  body: "Dòng một\nDòng hai",
  image: "/images/story.jpg",
  ctaLabel: "Xem thêm",
  href: "/collection"
};
const ok = <T,>(data: T) => ({ data, message: "success" });
const setup = () => {
  // BannerBlock blocks navigation while an order draft is unsaved, which needs a data router
  const router = createMemoryRouter([{ path: "/", element: <ContentHome /> }]);
  return render(
    // StrictMode like main.tsx: dev double-mount must not wipe the loaded form
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </StrictMode>
  );
};
const ready = () => screen.findByLabelText("Ô 1 · Vận chuyển — tiêu đề");
const save = () => fireEvent.click(screen.getByRole("button", { name: "Lưu trang chủ" }));
const storyCard = () =>
  screen.getByText("Câu chuyện thương hiệu").closest(".ant-card") as HTMLElement;
const storySwitch = () => screen.getByRole("switch", { name: "Hiển thị trên trang chủ" });
const typeIn = (label: string, value: string) =>
  fireEvent.change(within(storyCard()).getByLabelText(label), { target: { value } });

describe("content home page", () => {
  beforeEach(() => {
    useAppStore.getState().setProfile(ownerProfile);
    vi.mocked(api.getStoreHomeAPI).mockReset().mockResolvedValue(ok(settings));
    vi.mocked(api.saveStoreHomeAPI)
      .mockReset()
      .mockImplementation(async input => ok({ ...input, revision: input.revision + 1 }));
    vi.mocked(uploadImageAPI).mockReset();
  });

  it.each([null, staffProfile(["CONTENT_HOME_READ"])])(
    "denies home writes and uploads for %j",
    async profile => {
      useAppStore.setState({ profile });
      const { container } = setup();
      await ready();
      const button = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      button.disabled = false;
      fireEvent.click(button);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]');
      if (input)
        fireEvent.change(input, {
          target: { files: [new File(["x"], "tile.png", { type: "image/png" })] }
        });
      await act(async () => {});
      expect(api.saveStoreHomeAPI).not.toHaveBeenCalled();
      expect(uploadImageAPI).not.toHaveBeenCalled();
      for (const button of screen.getAllByRole("button", { name: /Đổi ảnh/ }))
        expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  );

  it("preserves a home draft and disables submission after authority refresh", async () => {
    setup();
    const input = (await ready()) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bản nháp riêng" } });
    act(() => useAppStore.getState().setProfile(staffProfile(["CONTENT_HOME_READ"])));
    expect(input.value).toBe("Bản nháp riêng");
    expect(input.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("lists the four storefront blocks in page order with a storefront link", async () => {
    setup();
    await ready();
    const blocks = screen
      .getAllByLabelText(/^Vị trí \d$/)
      .map(tag => [tag.textContent, tag.nextElementSibling?.textContent]);
    expect(blocks).toEqual([
      ["1", "Banner carousel"],
      ["2", "Ô khuyến mãi"],
      ["3", "Câu chuyện thương hiệu"],
      ["4", "Cam kết"]
    ]);
    expect(screen.getByRole("link", { name: /Xem cửa hàng/ }).getAttribute("href")).toBe(
      "http://shop.test"
    );
  });
  it("uploads a tile image and saves its path", async () => {
    vi.mocked(uploadImageAPI).mockResolvedValue(ok({ path: "/images/new.jpg" }));
    const { container } = setup();
    await ready();
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0];
    fireEvent.change(input, {
      target: { files: [new File(["x"], "tile.png", { type: "image/png" })] }
    });
    await waitFor(() =>
      expect(screen.getByAltText("Ảnh ô khuyến mãi 1").getAttribute("src")).toContain(
        "/images/new.jpg"
      )
    );
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].promoTiles[0].image).toBe(
      "/images/new.jpg"
    );
  });

  it("blocks saving while a tile image is uploading", async () => {
    let finishUpload: (value: ReturnType<typeof ok<{ path: string }>>) => void = () => {};
    vi.mocked(uploadImageAPI).mockReturnValue(
      new Promise(resolve => {
        finishUpload = resolve;
      }) as ReturnType<typeof uploadImageAPI>
    );
    const { container } = setup();
    await ready();
    const saveButton = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
    fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], {
      target: { files: [new File(["x"], "tile.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(saveButton.disabled).toBe(true));
    finishUpload(ok({ path: "/images/new.jpg" }));
    await waitFor(() => expect(saveButton.disabled).toBe(false));
  });

  it("keeps saving blocked until every parallel upload finishes", async () => {
    const finish: ((value: ReturnType<typeof ok<{ path: string }>>) => void)[] = [];
    vi.mocked(uploadImageAPI).mockImplementation(
      () =>
        new Promise(resolve => {
          finish.push(resolve);
        }) as ReturnType<typeof uploadImageAPI>
    );
    const { container } = setup();
    await ready();
    const saveButton = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    for (const input of [inputs[0], inputs[1]])
      fireEvent.change(input, {
        target: { files: [new File(["x"], "tile.png", { type: "image/png" })] }
      });
    await waitFor(() => expect(finish).toHaveLength(2));
    finish[0](ok({ path: "/images/one.jpg" }));
    await waitFor(() =>
      expect(screen.getByAltText("Ảnh ô khuyến mãi 1").getAttribute("src")).toContain("one.jpg")
    );
    expect(saveButton.disabled).toBe(true);
    finish[1](ok({ path: "/images/two.jpg" }));
    await waitFor(() => expect(saveButton.disabled).toBe(false));
  });

  it("keeps the image picked last when the same tile is uploaded twice", async () => {
    const finish: ((value: ReturnType<typeof ok<{ path: string }>>) => void)[] = [];
    vi.mocked(uploadImageAPI).mockImplementation(
      () =>
        new Promise(resolve => {
          finish.push(resolve);
        }) as ReturnType<typeof uploadImageAPI>
    );
    const { container } = setup();
    await ready();
    const saveButton = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
    // rc-upload remounts its file input after each pick, so query it again for the second pick
    const pick = (name: string) =>
      fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], {
        target: { files: [new File(["x"], name, { type: "image/png" })] }
      });
    pick("first.png");
    await waitFor(() => expect(finish).toHaveLength(1));
    pick("second.png");
    await waitFor(() => expect(finish).toHaveLength(2));
    finish[1](ok({ path: "/images/second.jpg" }));
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    finish[0](ok({ path: "/images/first.jpg" }));
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].promoTiles[0].image).toBe(
      "/images/second.jpg"
    );
  });

  it("ignores an upload that finishes after the draft was reloaded", async () => {
    let finishUpload: (value: ReturnType<typeof ok<{ path: string }>>) => void = () => {};
    vi.mocked(uploadImageAPI).mockReturnValue(
      new Promise(resolve => {
        finishUpload = resolve;
      }) as ReturnType<typeof uploadImageAPI>
    );
    vi.mocked(api.getStoreHomeAPI)
      .mockResolvedValueOnce(ok(settings))
      .mockResolvedValueOnce(ok(settings))
      .mockResolvedValue(ok({ ...settings, revision: 5 }));
    vi.mocked(api.saveStoreHomeAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    const { container } = setup();
    await ready();
    save();
    const reloadButton = await screen.findByRole("button", { name: "Tải lại" });
    fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], {
      target: { files: [new File(["x"], "late.png", { type: "image/png" })] }
    });
    fireEvent.click(reloadButton);
    await waitFor(() => expect(screen.queryByText(/Nội dung đã thay đổi/)).toBeNull());
    await ready();
    finishUpload(ok({ path: "/images/late.jpg" }));
    const saveButton = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalledTimes(2));
    const retry = vi.mocked(api.saveStoreHomeAPI).mock.calls[1][0];
    expect(retry.revision).toBe(5);
    expect(retry.promoTiles[0].image).toBe(tiles[0].image);
  });

  it("loads with the brand story switched off when settings have none", async () => {
    setup();
    await ready();
    expect(storySwitch().getAttribute("aria-checked")).toBe("false");
    expect(within(storyCard()).queryByLabelText("Tiêu đề")).toBeNull();
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].brandStory).toBeNull();
  });

  it("saves a filled brand story with an uploaded image", async () => {
    vi.mocked(uploadImageAPI).mockResolvedValue(ok({ path: "/images/story.jpg" }));
    setup();
    await ready();
    fireEvent.click(storySwitch());
    typeIn("Tiêu đề", "  Câu chuyện của chúng tôi  ");
    typeIn("Nội dung", " Dòng một\nDòng hai ");
    fireEvent.change(storyCard().querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(["x"], "story.png", { type: "image/png" })] }
    });
    await waitFor(() =>
      expect(screen.getByAltText("Ảnh câu chuyện thương hiệu").getAttribute("src")).toContain(
        "/images/story.jpg"
      )
    );
    typeIn("Nội dung nút", " Xem thêm ");
    typeIn("Đường dẫn", "/collection");
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].brandStory).toEqual(story);
  });

  it("saves the optional title accent and second image", async () => {
    vi.mocked(api.getStoreHomeAPI).mockResolvedValue(ok({ ...settings, brandStory: story }));
    vi.mocked(uploadImageAPI).mockResolvedValue(ok({ path: "/images/story-2.jpg" }));
    setup();
    await ready();
    typeIn("Phần nhấn của tiêu đề", "  mặc thật lâu.  ");
    fireEvent.change(storyCard().querySelectorAll<HTMLInputElement>('input[type="file"]')[1], {
      target: { files: [new File(["x"], "story-2.png", { type: "image/png" })] }
    });
    await waitFor(() =>
      expect(screen.getByAltText("Ảnh thứ 2 câu chuyện thương hiệu").getAttribute("src")).toContain(
        "/images/story-2.jpg"
      )
    );
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].brandStory).toEqual({
      ...story,
      titleAccent: "mặc thật lâu.",
      image2: "/images/story-2.jpg"
    });
  });

  it("omits a blank title accent and a removed second image", async () => {
    vi.mocked(api.getStoreHomeAPI).mockResolvedValue(
      ok({
        ...settings,
        brandStory: { ...story, titleAccent: "nhấn", image2: "/images/story-2.jpg" }
      })
    );
    setup();
    await ready();
    typeIn("Phần nhấn của tiêu đề", "   ");
    fireEvent.click(within(storyCard()).getByRole("button", { name: "Xoá ảnh thứ 2" }));
    await waitFor(() =>
      expect(screen.queryByAltText("Ảnh thứ 2 câu chuyện thương hiệu")).toBeNull()
    );
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].brandStory).toEqual(story);
  });

  it("blocks saving a brand story with only a CTA label", async () => {
    vi.mocked(api.getStoreHomeAPI).mockResolvedValue(
      ok({ ...settings, brandStory: { title: story.title, body: story.body, image: story.image } })
    );
    setup();
    await ready();
    typeIn("Nội dung nút", "Xem thêm");
    save();
    expect(await within(storyCard()).findByText("Vui lòng nhập đường dẫn cho nút")).toBeTruthy();
    expect(api.saveStoreHomeAPI).not.toHaveBeenCalled();
  });

  it("sends null after switching an existing story off", async () => {
    vi.mocked(api.getStoreHomeAPI).mockResolvedValue(ok({ ...settings, brandStory: story }));
    setup();
    await ready();
    expect(storySwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(storySwitch());
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[0][0].brandStory).toBeNull();
  });

  it("keeps a hidden story draft when the switch goes back on", async () => {
    vi.mocked(api.getStoreHomeAPI).mockResolvedValue(ok({ ...settings, brandStory: story }));
    setup();
    await ready();
    typeIn("Tiêu đề", "Bản nháp");
    fireEvent.click(storySwitch());
    expect(within(storyCard()).queryByLabelText("Tiêu đề")).toBeNull();
    fireEvent.click(storySwitch());
    expect((within(storyCard()).getByLabelText("Tiêu đề") as HTMLInputElement).value).toBe(
      "Bản nháp"
    );
  });

  it("reloads the newer server copy after a conflict, including its story switch", async () => {
    vi.mocked(api.getStoreHomeAPI)
      .mockResolvedValueOnce(ok({ ...settings, brandStory: story }))
      .mockResolvedValueOnce(ok({ ...settings, brandStory: story }))
      .mockResolvedValue(ok({ ...settings, brandStory: null, revision: 5 }));
    vi.mocked(api.saveStoreHomeAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    setup();
    await ready();
    typeIn("Tiêu đề", "Bản nháp");
    save();
    expect(await screen.findByText(/Nội dung đã thay đổi/)).toBeTruthy();
    const saveButton = screen.getByRole("button", { name: "Lưu trang chủ" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(storySwitch().getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByText(/Nội dung đã thay đổi/)).toBeNull();
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalledTimes(2));
    const retry = vi.mocked(api.saveStoreHomeAPI).mock.calls[1][0];
    expect(retry.revision).toBe(5);
    expect(retry.brandStory).toBeNull();
  });

  it("drops optional story fields the newer server copy no longer has after a conflict", async () => {
    const accented = { ...story, titleAccent: "nhấn cũ", image2: "/images/old-2.jpg" };
    vi.mocked(api.getStoreHomeAPI)
      .mockResolvedValueOnce(ok({ ...settings, brandStory: accented }))
      .mockResolvedValueOnce(ok({ ...settings, brandStory: accented }))
      .mockResolvedValue(ok({ ...settings, brandStory: story, revision: 5 }));
    vi.mocked(api.saveStoreHomeAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    setup();
    await ready();
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByText(/Nội dung đã thay đổi/)).toBeNull());
    await ready();
    expect(
      (within(storyCard()).getByLabelText("Phần nhấn của tiêu đề") as HTMLInputElement).value
    ).toBe("");
    save();
    await waitFor(() => expect(api.saveStoreHomeAPI).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.saveStoreHomeAPI).mock.calls[1][0].brandStory).toEqual(story);
  });

  it("shows a retryable load error without hiding the banner block", async () => {
    vi.mocked(api.getStoreHomeAPI)
      .mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500))
      .mockRejectedValueOnce(new ApiError("Máy chủ lỗi", 500));
    setup();
    expect(await screen.findByText("Không tải được nội dung trang chủ")).toBeTruthy();
    expect(screen.getByText("Banner carousel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await ready();
  });
});
