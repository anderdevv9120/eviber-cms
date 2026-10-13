import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/storeContent";
import { uploadImageAPI } from "@/services/banners";
import StoreContent from "./index";

vi.mock("@/constants/env", () => ({
  ADMIN_API_URL: "http://api.test:8001/admin/v1",
  STOREFRONT_URL: "http://shop.test"
}));
vi.mock("@/services/storeContent", () => ({
  getStoreSettingsAPI: vi.fn(),
  saveStoreSettingsAPI: vi.fn()
}));
vi.mock("@/services/banners", () => ({ uploadImageAPI: vi.fn() }));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));

const settings: api.Revisioned<api.StoreSettings> = {
  contact: { address: "Số 8 Phạm Hùng", email: "hotro@clothes.vn", phone: "1900 0000" },
  socials: { facebook: "", instagram: "", twitter: "" },
  promoTiles: [
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
  ],
  homePromises: [1, 2, 3, 4].map(n => ({ title: `Cam kết ${n}`, description: `Mô tả ${n}` })),
  productPromises: ["Giao nhanh", "Đổi size", "COD"],
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
const setup = () =>
  render(
    // StrictMode like main.tsx: dev double-mount must not wipe the loaded form
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <StoreContent />
      </ConfigProvider>
    </StrictMode>
  );
const save = () => fireEvent.click(screen.getByRole("button", { name: "Lưu nội dung" }));
const storyCard = () =>
  screen.getByText("Câu chuyện thương hiệu").closest(".ant-card") as HTMLElement;
const storySwitch = () => screen.getByRole("switch", { name: "Hiển thị trên trang chủ" });
const typeIn = (label: string, value: string) =>
  fireEvent.change(within(storyCard()).getByLabelText(label), { target: { value } });

describe("store content page", () => {
  beforeEach(() => {
    vi.mocked(api.getStoreSettingsAPI).mockReset().mockResolvedValue(ok(settings));
    vi.mocked(api.saveStoreSettingsAPI)
      .mockReset()
      .mockImplementation(async input => ok({ ...input, revision: input.revision + 1 }));
    vi.mocked(uploadImageAPI).mockReset();
  });

  it("saves the full settings payload with the loaded revision", async () => {
    setup();
    expect(((await screen.findByLabelText("Số điện thoại")) as HTMLInputElement).value).toBe(
      "1900 0000"
    );
    fireEvent.change(await screen.findByLabelText("Số điện thoại"), {
      target: { value: "0900 111 222" }
    });
    save();
    await waitFor(() =>
      expect(api.saveStoreSettingsAPI).toHaveBeenCalledWith({
        ...settings,
        contact: { ...settings.contact, phone: "0900 111 222" },
        revision: 3
      })
    );
  });

  it("uploads a tile image and saves its path", async () => {
    vi.mocked(uploadImageAPI).mockResolvedValue(ok({ path: "/images/new.jpg" }));
    const { container } = setup();
    await screen.findByLabelText("Số điện thoại");
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
    await waitFor(() => expect(api.saveStoreSettingsAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreSettingsAPI).mock.calls[0][0].promoTiles[0].image).toBe(
      "/images/new.jpg"
    );
  });

  it("blocks saving after a stale revision until the admin reloads", async () => {
    vi.mocked(api.saveStoreSettingsAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    setup();
    fireEvent.change(await screen.findByLabelText("Số điện thoại"), {
      target: { value: "0900 draft" }
    });
    vi.mocked(api.getStoreSettingsAPI).mockResolvedValue(
      ok({ ...settings, contact: { ...settings.contact, phone: "0911 fresh" }, revision: 4 })
    );
    save();
    expect(
      await screen.findByText("Nội dung đã thay đổi. Tải lại để bỏ bản nháp trước khi lưu.")
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Lưu nội dung" }) as HTMLButtonElement).disabled
    ).toBe(true);

    const loads = vi.mocked(api.getStoreSettingsAPI).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() =>
      expect(vi.mocked(api.getStoreSettingsAPI).mock.calls.length).toBeGreaterThan(loads)
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Lưu nội dung" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    // Reload discards the draft and shows the other admin's saved copy
    expect((screen.getByLabelText("Số điện thoại") as HTMLInputElement).value).toBe("0911 fresh");
  });

  it("blocks saving while a tile image is uploading", async () => {
    let finishUpload: (value: ReturnType<typeof ok<{ path: string }>>) => void = () => {};
    vi.mocked(uploadImageAPI).mockReturnValue(
      new Promise(resolve => {
        finishUpload = resolve;
      }) as ReturnType<typeof uploadImageAPI>
    );
    const { container } = setup();
    await screen.findByLabelText("Số điện thoại");
    const saveButton = screen.getByRole("button", { name: "Lưu nội dung" }) as HTMLButtonElement;
    fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0], {
      target: { files: [new File(["x"], "tile.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(saveButton.disabled).toBe(true));
    finishUpload(ok({ path: "/images/new.jpg" }));
    await waitFor(() => expect(saveButton.disabled).toBe(false));
  });

  it("loads with the brand story switched off when settings have none", async () => {
    setup();
    await screen.findByLabelText("Số điện thoại");
    expect(storySwitch().getAttribute("aria-checked")).toBe("false");
    expect(within(storyCard()).queryByLabelText("Tiêu đề")).toBeNull();
    save();
    await waitFor(() => expect(api.saveStoreSettingsAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreSettingsAPI).mock.calls[0][0].brandStory).toBeNull();
  });

  it("saves a filled brand story with an uploaded image", async () => {
    vi.mocked(uploadImageAPI).mockResolvedValue(ok({ path: "/images/story.jpg" }));
    setup();
    await screen.findByLabelText("Số điện thoại");
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
    await waitFor(() => expect(api.saveStoreSettingsAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreSettingsAPI).mock.calls[0][0].brandStory).toEqual(story);
  });

  it("blocks saving a brand story with only a CTA label", async () => {
    vi.mocked(api.getStoreSettingsAPI).mockResolvedValue(
      ok({ ...settings, brandStory: { title: story.title, body: story.body, image: story.image } })
    );
    setup();
    await screen.findByLabelText("Số điện thoại");
    typeIn("Nội dung nút", "Xem thêm");
    save();
    expect(await within(storyCard()).findByText("Vui lòng nhập đường dẫn cho nút")).toBeTruthy();
    expect(api.saveStoreSettingsAPI).not.toHaveBeenCalled();
  });

  it("sends null after switching an existing story off", async () => {
    vi.mocked(api.getStoreSettingsAPI).mockResolvedValue(ok({ ...settings, brandStory: story }));
    setup();
    await screen.findByLabelText("Số điện thoại");
    expect(storySwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(storySwitch());
    save();
    await waitFor(() => expect(api.saveStoreSettingsAPI).toHaveBeenCalled());
    expect(vi.mocked(api.saveStoreSettingsAPI).mock.calls[0][0].brandStory).toBeNull();
  });

  it("shows a retryable load error", async () => {
    vi.mocked(api.getStoreSettingsAPI).mockRejectedValue(new ApiError("Máy chủ lỗi", 500));
    setup();
    expect(await screen.findByText("Không tải được nội dung cửa hàng")).toBeTruthy();
    vi.mocked(api.getStoreSettingsAPI).mockResolvedValue(ok(settings));
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText("Số điện thoại")).toBeTruthy();
  });
});
