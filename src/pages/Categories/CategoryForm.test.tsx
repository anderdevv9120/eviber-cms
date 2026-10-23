import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/categories";
import * as imagesApi from "@/services/images";
import { CATEGORY_ERROR } from "./category-errors";
import CategoryForm from "./CategoryForm";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
vi.mock("@/services/categories", () => ({
  createCategoryAPI: vi.fn(),
  updateCategoryAPI: vi.fn()
}));
vi.mock("@/services/images", () => ({ uploadImageAPI: vi.fn() }));

const shirts: api.Category = {
  _id: "a",
  name: "Ao So Mi",
  slug: "ao-so-mi",
  description: "Mo ta",
  imageUrl: "/images/a.jpg",
  sortOrder: 0,
  revision: 3,
  productCount: 0,
  couponCount: 0,
  comboCount: 0
};
const ok = <T,>(data: T) => ({ data, message: "success" });

const renderForm = (props: Partial<ComponentProps<typeof CategoryForm>> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onReload: vi.fn<() => Promise<api.Category[] | undefined>>()
  };
  render(
    <StrictMode>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <CategoryForm open {...handlers} {...props} />
      </ConfigProvider>
    </StrictMode>
  );
  return handlers;
};
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const upload = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(["x"], "cat.png", { type: "image/png" })] }
  });
};
const preview = () =>
  screen.getByRole("img", { name: "Ảnh danh mục xem trước" }).getAttribute("src");
const save = () => fireEvent.click(screen.getByRole("button", { name: "Lưu danh mục" }));
const saveDisabled = () =>
  screen.getByRole("button", { name: "Lưu danh mục" }).hasAttribute("disabled");

describe("category form", () => {
  beforeEach(() => {
    vi.mocked(api.createCategoryAPI).mockReset().mockResolvedValue(ok(shirts));
    vi.mocked(api.updateCategoryAPI).mockReset().mockResolvedValue(ok(shirts));
    vi.mocked(imagesApi.uploadImageAPI)
      .mockReset()
      .mockResolvedValue(ok({ path: "/images/new.jpg" }));
  });

  it("creates with the uploaded image and an empty slug sent as null", async () => {
    const { onSaved } = renderForm();
    expect(screen.getByText("Tự tạo từ tên nếu để trống")).toBeTruthy();
    type("Tên danh mục", "Ao Khoac");
    upload();
    await waitFor(() => expect(preview()).toBe("http://api.test:8001/images/new.jpg"));
    save();
    await waitFor(() =>
      expect(api.createCategoryAPI).toHaveBeenCalledWith({
        name: "Ao Khoac",
        slug: null,
        description: "",
        imageUrl: "/images/new.jpg"
      })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("requires an image", async () => {
    renderForm();
    type("Tên danh mục", "Ao Khoac");
    save();
    expect(await screen.findByText("Vui lòng tải ảnh danh mục")).toBeTruthy();
    expect(api.createCategoryAPI).not.toHaveBeenCalled();
  });

  it("prefills an edit, warns about the slug and sends the revision", async () => {
    const { onSaved } = renderForm({ category: shirts });
    expect(field("Tên danh mục").value).toBe("Ao So Mi");
    expect(field("Slug").value).toBe("ao-so-mi");
    expect(field("Mô tả").value).toBe("Mo ta");
    expect(preview()).toBe("http://api.test:8001/images/a.jpg");
    expect(
      screen.getByText("Đổi slug sẽ làm hỏng các liên kết /collection?category= đã chia sẻ")
    ).toBeTruthy();
    type("Tên danh mục", "Ao So Mi Nam");
    save();
    await waitFor(() =>
      expect(api.updateCategoryAPI).toHaveBeenCalledWith("a", {
        name: "Ao So Mi Nam",
        slug: "ao-so-mi",
        description: "Mo ta",
        imageUrl: "/images/a.jpg",
        revision: 3
      })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it.each([
    [CATEGORY_ERROR.NAME_EXISTED, "Tên danh mục", "Tên danh mục đã tồn tại"],
    [CATEGORY_ERROR.SLUG_TAKEN, "Slug", "Slug đã được dùng"],
    [CATEGORY_ERROR.SLUG_INVALID, "Slug", "Slug không hợp lệ"]
  ])("shows %s under %s", async (code, label, message) => {
    vi.mocked(api.updateCategoryAPI).mockRejectedValue(new ApiError("conflict", 409, { code }));
    const { onSaved } = renderForm({ category: shirts });
    save();
    const error = await screen.findByText(message);
    expect(within(error.closest<HTMLElement>(".ant-form-item")!).getByLabelText(label)).toBe(
      field(label)
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks saving a stale category until it is reloaded", async () => {
    vi.mocked(api.updateCategoryAPI).mockRejectedValueOnce(
      new ApiError("stale", 409, { code: CATEGORY_ERROR.STALE_REVISION })
    );
    const { onReload } = renderForm({ category: shirts });
    onReload.mockResolvedValue([{ ...shirts, name: "Ao Moi", revision: 4 }]);
    type("Tên danh mục", "Ban nhap");
    save();
    expect(await screen.findByText("Danh mục đã được người khác sửa")).toBeTruthy();
    expect(saveDisabled()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(field("Tên danh mục").value).toBe("Ao Moi"));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Danh mục đã được người khác sửa")).toBeNull();
    expect(saveDisabled()).toBe(false);
    save();
    await waitFor(() =>
      expect(api.updateCategoryAPI).toHaveBeenLastCalledWith(
        "a",
        expect.objectContaining({ name: "Ao Moi", revision: 4 })
      )
    );
  });

  it("closes when the reloaded category is gone", async () => {
    vi.mocked(api.updateCategoryAPI).mockRejectedValueOnce(
      new ApiError("stale", 409, { code: CATEGORY_ERROR.STALE_REVISION })
    );
    const { onReload, onClose } = renderForm({ category: shirts });
    onReload.mockResolvedValue([]);
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows an upload failure and keeps the previous image", async () => {
    vi.mocked(imagesApi.uploadImageAPI).mockRejectedValue(new ApiError("File too large", 413));
    renderForm({ category: shirts });
    upload();
    expect(await screen.findByText("File too large")).toBeTruthy();
    expect(preview()).toBe("http://api.test:8001/images/a.jpg");
  });
});
