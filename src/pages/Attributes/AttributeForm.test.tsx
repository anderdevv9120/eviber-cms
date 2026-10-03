import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { ComponentProps } from "react";
import { attribute, deferred } from "@/test/attribute-fixtures";
import AttributeForm from "./AttributeForm";

const form = (props: ComponentProps<typeof AttributeForm>) => (
  <ConfigProvider theme={{ token: { motion: false } }}>
    <AttributeForm {...props} />
  </ConfigProvider>
);

describe("attribute form", () => {
  it("creates with explicit code/name and retains input on rejected submit", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Code already exists"));
    render(form({ onSubmit, onCancel: vi.fn() }));
    fireEvent.change(screen.getByLabelText("Tên thuộc tính"), { target: { value: "Dung lượng" } });
    fireEvent.change(screen.getByLabelText("Mã thuộc tính"), { target: { value: "capacity" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
    await screen.findByText("Code already exists");
    expect(onSubmit).toHaveBeenCalledWith({ name: "Dung lượng", code: "capacity" });
    expect((screen.getByLabelText("Tên thuộc tính") as HTMLInputElement).value).toBe("Dung lượng");
    expect((screen.getByLabelText("Mã thuộc tính") as HTMLInputElement).value).toBe("capacity");
  });

  it("keeps code read-only, explains shared labels and submits only name/revision", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(form({ attribute, onSubmit, onCancel: vi.fn() }));
    expect((screen.getByLabelText("Mã thuộc tính") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(/sản phẩm.*tham chiếu/i).textContent).toContain("đơn hàng");
    fireEvent.change(screen.getByLabelText("Tên thuộc tính"), { target: { value: "Size" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: "Size", expectedRevision: 4 })
    );
  });

  it("validates normalized empty/oversized labels and invalid codes before submitting", async () => {
    const onSubmit = vi.fn();
    render(form({ onSubmit, onCancel: vi.fn() }));
    fireEvent.change(screen.getByLabelText("Tên thuộc tính"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Mã thuộc tính"), { target: { value: "1 bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
    await screen.findByText(/Tên thuộc tính phải có từ 1 đến 255 ký tự/);
    await screen.findByText(/Mã phải bắt đầu bằng chữ cái/);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tên thuộc tính"), {
      target: { value: "x".repeat(256) }
    });
    fireEvent.change(screen.getByLabelText("Mã thuộc tính"), { target: { value: "valid" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo thuộc tính" }));
    await waitFor(() =>
      expect(screen.getByText(/Tên thuộc tính phải có từ 1 đến 255 ký tự/)).toBeTruthy()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prevents duplicate submits and preserves typed input when a fresh revision arrives", async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    const { rerender } = render(form({ attribute, onSubmit, onCancel: vi.fn() }));
    fireEvent.change(screen.getByLabelText("Tên thuộc tính"), { target: { value: "Typed label" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu tên" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    pending.reject(new Error("Reloaded; submit explicitly"));
    await screen.findByText("Reloaded; submit explicitly");
    rerender(
      form({
        attribute: { ...attribute, name: "Other admin", revision: 8 },
        onSubmit,
        onCancel: vi.fn()
      })
    );
    expect((screen.getByLabelText("Tên thuộc tính") as HTMLInputElement).value).toBe("Typed label");
    onSubmit.mockResolvedValue(undefined);
    const button = await screen.findByRole("button", { name: "Lưu tên" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({ name: "Typed label", expectedRevision: 8 })
    );
  });
});
