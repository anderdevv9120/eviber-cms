import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { ComponentProps } from "react";
import { value, deferred } from "@/test/attribute-fixtures";
import AttributeValueForm from "./AttributeValueForm";

const form = (props: ComponentProps<typeof AttributeValueForm>) => (
  <ConfigProvider theme={{ token: { motion: false } }}>
    <AttributeValueForm {...props} />
  </ConfigProvider>
);
describe("value form", () => {
  it("provides a native keyboard-accessible color trigger that cannot submit the form", async () => {
    const onSubmit = vi.fn();
    render(form({ expectedRevision: 4, onSubmit, onCancel: vi.fn() }));
    fireEvent.click(screen.getByRole("switch", { name: "Sử dụng màu" }));
    const trigger = screen.getByRole("button", { name: "Chọn màu #000000" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(document.querySelector(".ant-color-picker-inner-content")).not.toBeNull()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("creates text without metadata and retains input on network failure", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Unavailable"));
    render(form({ expectedRevision: 4, onSubmit, onCancel: vi.fn() }));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Medium" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    await screen.findByText("Unavailable");
    expect(onSubmit).toHaveBeenCalledWith({ value: "Medium", expectedRevision: 4 });
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Medium");
  });
  it("previews an optional color and clears it explicitly when disabled on edit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      form({
        value: { ...value, meta: "#AABBCC" },
        expectedRevision: 4,
        onSubmit,
        onCancel: vi.fn()
      })
    );
    expect(screen.getByLabelText("Màu #AABBCC")).toBeTruthy();
    expect(screen.getByText(/sản phẩm.*tham chiếu/).textContent).toContain("đơn hàng");
    fireEvent.click(screen.getByRole("switch", { name: "Sử dụng màu" }));
    expect(screen.queryByLabelText("Màu #AABBCC")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ value: "S", meta: null, expectedRevision: 4 })
    );
  });
  it("enables color for any attribute, validates labels, and prevents duplicate submissions", async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    render(form({ expectedRevision: 4, onSubmit, onCancel: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    await screen.findByText(/Tên giá trị phải có từ 1 đến 255 ký tự/);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Colored size" } });
    fireEvent.click(screen.getByRole("switch", { name: "Sử dụng màu" }));
    expect(screen.getByLabelText("Màu #000000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo giá trị" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      value: "Colored size",
      meta: "#000000",
      expectedRevision: 4
    });
    pending.reject(new Error("Retry later"));
    await screen.findByText("Retry later");
  });
  it("retains typed label/color as revision changes for explicit reapplication", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Conflict"))
      .mockResolvedValue(undefined);
    const props = { value, expectedRevision: 4, onSubmit, onCancel: vi.fn() };
    const { rerender } = render(form(props));
    fireEvent.change(screen.getByLabelText("Tên giá trị"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("switch", { name: "Sử dụng màu" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await screen.findByText("Conflict");
    rerender(form({ ...props, value: { ...value, value: "Other" }, expectedRevision: 8 }));
    expect((screen.getByLabelText("Tên giá trị") as HTMLInputElement).value).toBe("Typed");
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá trị" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        value: "Typed",
        meta: "#000000",
        expectedRevision: 8
      })
    );
  });
});
