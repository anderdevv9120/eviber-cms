import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/storeContent";
import Policies from "./index";

vi.mock("@/constants/env", () => ({
  ADMIN_API_URL: "http://api.test:8001/admin/v1",
  STOREFRONT_URL: "http://shop.test"
}));
vi.mock("@/services/storeContent", () => ({
  listPoliciesAPI: vi.fn(),
  getPolicyAPI: vi.fn(),
  savePolicyAPI: vi.fn()
}));
vi.mock("@/utils/notification", () => ({
  successNotification: vi.fn(),
  errorNotification: vi.fn()
}));
// Mirrors the real editor's timing: HTML arrives 300 ms after a change, and once after mount
// when initialHtml is non-empty
vi.mock("@/components/RichEditor", async () => {
  const { useEffect, useRef } = await vi.importActual<typeof import("react")>("react");
  return {
    RichEditor: ({
      initialHtml,
      onChange
    }: {
      initialHtml?: string;
      onChange?: (html: string) => void;
    }) => {
      // Mount-time props, like the real editor which loads initialHtml once per key
      const mount = useRef({ initialHtml, onChange });
      useEffect(() => {
        const { initialHtml: html, onChange: emit } = mount.current;
        if (!html) return;
        const timer = setTimeout(() => emit?.(`<p dir="ltr">${html}</p>`), 300);
        return () => clearTimeout(timer);
      }, []);
      return (
        <textarea
          aria-label='Nội dung'
          defaultValue={initialHtml}
          onChange={event => {
            const html = event.target.value;
            setTimeout(() => onChange?.(html), 300);
          }}
        />
      );
    }
  };
});

const summary = (
  slug: api.PolicySlug,
  title: string,
  isPublished = false
): api.PolicyPageSummary => ({
  slug,
  title,
  isPublished,
  updatedAt: isPublished ? "2026-10-09T03:00:00.000Z" : null
});
const rows = [
  summary("dieu-khoan", "Điều khoản – Điều kiện"),
  summary("doi-tra", "Chính sách đổi trả", true),
  summary("ho-tro", "Chính sách hỗ trợ"),
  summary("bao-mat", "Chính sách bảo mật")
];
const returnsPage: api.PolicyPage = {
  ...rows[1],
  contentHtml: "<p>7 ngày</p>",
  revision: 2
};
const ok = <T,>(data: T) => ({ data, message: "success" });
const setup = () =>
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <Policies />
    </ConfigProvider>
  );
const openReturns = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Sửa Chính sách đổi trả" }));
  return screen.findByLabelText("Nội dung");
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("policy pages", () => {
  beforeEach(() => {
    vi.mocked(api.listPoliciesAPI).mockReset().mockResolvedValue(ok(rows));
    vi.mocked(api.getPolicyAPI).mockReset().mockResolvedValue(ok(returnsPage));
    vi.mocked(api.savePolicyAPI)
      .mockReset()
      .mockImplementation(async (slug, input) =>
        ok({
          ...returnsPage,
          ...input,
          slug,
          contentHtml: "<p>Đã làm sạch</p>",
          revision: input.revision + 1
        })
      );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the four pages with their status", async () => {
    setup();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Đã xuất bản")).toBeTruthy();
    expect(within(table).getAllByText("Nháp")).toHaveLength(3);
  });

  it("saves the last keystroke even when Save follows typing immediately", async () => {
    setup();
    const editor = await openReturns();
    fireEvent.change(editor, { target: { value: "<p>Mới nhất</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(api.savePolicyAPI).toHaveBeenCalledWith("doi-tra", {
        title: "Chính sách đổi trả",
        contentHtml: "<p>Mới nhất</p>",
        isPublished: true,
        revision: 2
      })
    );
  });

  it("shows the sanitized HTML returned by the server and refreshes the list", async () => {
    setup();
    const editor = await openReturns();
    fireEvent.change(editor, { target: { value: "<p>x</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Nội dung") as HTMLTextAreaElement).value).toBe(
        "<p>Đã làm sạch</p>"
      )
    );
    expect(api.listPoliciesAPI).toHaveBeenCalledTimes(2);
  });

  it("locks the editor while saving so typing cannot be lost on remount", async () => {
    setup();
    const editor = await openReturns();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(editor.closest("[inert]")).not.toBeNull();
    await waitFor(() => expect(api.savePolicyAPI).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Nội dung").closest("[inert]")).toBeNull());
  });

  it("closes without a prompt when only the editor's mount emission happened", async () => {
    const confirm = vi.spyOn(window, "confirm");
    setup();
    await openReturns();
    await wait(400);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByLabelText("Nội dung")).toBeNull());
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before discarding edits and keeps the drawer when cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup();
    await openReturns();
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Đổi trả 7 ngày" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(confirm).toHaveBeenCalledWith("Bỏ các thay đổi chưa lưu?");
    expect(screen.getByLabelText("Nội dung")).toBeTruthy();
  });

  it("blocks saving after a stale revision until the admin reloads", async () => {
    vi.mocked(api.savePolicyAPI).mockRejectedValueOnce(new ApiError("Stale", 409));
    setup();
    await openReturns();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(
      await screen.findByText("Nội dung đã thay đổi. Tải lại để bỏ bản nháp trước khi lưu.")
    ).toBeTruthy();
    expect((screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(api.getPolicyAPI).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
  });

  it("links published pages to the storefront", async () => {
    setup();
    await openReturns();
    expect(screen.getByRole("link", { name: "Xem trên cửa hàng" }).getAttribute("href")).toBe(
      "http://shop.test/chinh-sach/doi-tra"
    );
  });
});
