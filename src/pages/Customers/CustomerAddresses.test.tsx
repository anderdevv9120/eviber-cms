import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { deferred } from "@/test/attribute-fixtures";
import { ApiError } from "@/utils/request";
import * as api from "@/services/customers";
import CustomerAddresses from "./CustomerAddresses";
import { useAppStore } from "@/store/useAppStore";
import { ownerProfile, staffProfile } from "@/test/access-fixtures";

vi.mock("@/services/customers", () => ({
  getCustomerAddressesAPI: vi.fn(),
  addCustomerAddressAPI: vi.fn(),
  updateCustomerAddressAPI: vi.fn(),
  deleteCustomerAddressAPI: vi.fn()
}));
const address: api.CustomerAddress = {
  _id: "address-id",
  name: "Recipient",
  country: "Vietnam",
  city: "City",
  district: "District",
  ward: "Ward",
  specificAddress: "Street",
  phoneNumber: "0901234567",
  zip: "700000",
  primary: true
};
const response = (data: api.CustomerAddress[]) => ({ data, message: "success" });
beforeEach(() => {
  useAppStore.getState().setProfile(ownerProfile);
  vi.mocked(api.getCustomerAddressesAPI)
    .mockReset()
    .mockResolvedValue(response([address]));
  vi.mocked(api.addCustomerAddressAPI)
    .mockReset()
    .mockResolvedValue(response([address]));
  vi.mocked(api.updateCustomerAddressAPI)
    .mockReset()
    .mockResolvedValue({ data: address, message: "success" });
  vi.mocked(api.deleteCustomerAddressAPI)
    .mockReset()
    .mockResolvedValue({ data: { success: true }, message: "success" });
});
describe("Customer address book", () => {
  it("does not carry an uncertain save notice into a new delete confirmation", async () => {
    vi.mocked(api.updateCustomerAddressAPI).mockRejectedValueOnce(
      new ApiError("Write uncertain", 503)
    );
    render(<CustomerAddresses customerId='customer-id' />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa địa chỉ" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));
    await screen.findByText(/Write uncertain/);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Xóa địa chỉ" }));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });
  it("shows a denied delete once inside its confirmation", async () => {
    vi.mocked(api.deleteCustomerAddressAPI).mockRejectedValueOnce(
      new ApiError("Delete denied", 403)
    );
    render(<CustomerAddresses customerId='customer-id' />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa địa chỉ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    await within(screen.getByRole("dialog")).findByText("Delete denied");
    expect(screen.getAllByText("Delete denied")).toHaveLength(1);
    expect(api.getCustomerAddressesAPI).toHaveBeenCalledTimes(1);
  });
  it("RBAC rechecks a pending delete confirmation after authority changes", async () => {
    render(<CustomerAddresses customerId='customer-id' />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa địa chỉ" }));
    await act(async () => useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ"])));
    const confirm = screen.getByRole("button", { name: "Xác nhận xóa" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    confirm.disabled = false;
    fireEvent.click(confirm);
    expect(api.deleteCustomerAddressAPI).not.toHaveBeenCalled();
  });
  it("RBAC disables an open address form preserving its draft and blocks forced submit", async () => {
    render(<CustomerAddresses customerId='customer-id' />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa địa chỉ" }));
    fireEvent.change(screen.getByLabelText("Địa chỉ cụ thể"), {
      target: { value: "Unsaved street" }
    });
    await act(async () => useAppStore.getState().clearProfile());
    const button = screen.getByRole("button", { name: "Lưu địa chỉ" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect((screen.getByLabelText("Địa chỉ cụ thể") as HTMLInputElement).value).toBe(
      "Unsaved street"
    );
    await act(async () => fireEvent.submit(button.closest("form")!));
    expect(api.updateCustomerAddressAPI).not.toHaveBeenCalled();
  });
  it("displays primary and sends full address input on PUT before reloading", async () => {
    render(<CustomerAddresses customerId='customer-id' />);
    // scroll.x của bảng sinh thêm dòng đo độ rộng ẩn (ant-table-measure-row) lặp lại tiêu đề.
    await waitFor(() =>
      expect(
        screen.getAllByText("Địa chỉ chính", { ignore: ".ant-table-measure-row *" })
      ).toHaveLength(2)
    );
    fireEvent.click(screen.getByRole("button", { name: "Sửa địa chỉ" }));
    fireEvent.change(screen.getByLabelText("Địa chỉ cụ thể"), {
      target: { value: " New street " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));
    await waitFor(() => expect(api.updateCustomerAddressAPI).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateCustomerAddressAPI).mock.calls[0]).toEqual([
      "customer-id",
      "address-id",
      {
        name: "Recipient",
        country: "Vietnam",
        city: "City",
        district: "District",
        ward: "Ward",
        specificAddress: "New street",
        phoneNumber: "0901234567",
        zip: "700000",
        primary: true
      }
    ]);
    await waitFor(() => expect(api.getCustomerAddressesAPI).toHaveBeenCalledTimes(2));
  });
  it("shows the cap and requires confirmation before deleting", async () => {
    vi.mocked(api.getCustomerAddressesAPI).mockResolvedValue(
      response(
        Array.from({ length: 10 }, (_, i) => ({ ...address, _id: String(i), primary: i === 0 }))
      )
    );
    render(<CustomerAddresses customerId='customer-id' />);
    await screen.findByText("Đã đạt giới hạn 10 địa chỉ.");
    expect(
      (screen.getByRole("button", { name: "Thêm địa chỉ" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Xóa địa chỉ" })[0]);
    expect(api.deleteCustomerAddressAPI).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận xóa" }));
    await waitFor(() =>
      expect(api.deleteCustomerAddressAPI).toHaveBeenCalledWith("customer-id", "0")
    );
  });
  it("never repeats an uncertain write and disables writes until a recovery read succeeds", async () => {
    vi.mocked(api.updateCustomerAddressAPI).mockRejectedValueOnce(
      new ApiError("Write uncertain", 503)
    );
    vi.mocked(api.getCustomerAddressesAPI)
      .mockResolvedValueOnce(response([address]))
      .mockRejectedValueOnce(new Error("Reload failed"));
    render(<CustomerAddresses customerId='customer-id' />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa địa chỉ" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));
    await screen.findByText("Reload failed");
    expect(
      (screen.getByRole("button", { name: "Thêm địa chỉ" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await screen.findByRole("button", { name: "Sửa địa chỉ" });
    expect(api.updateCustomerAddressAPI).toHaveBeenCalledTimes(1);
  });
  it("does not display a previous customer's delayed address book", async () => {
    const pending = deferred<Awaited<ReturnType<typeof api.getCustomerAddressesAPI>>>();
    vi.mocked(api.getCustomerAddressesAPI).mockReturnValueOnce(pending.promise);
    const { rerender } = render(<CustomerAddresses customerId='a' />);
    rerender(<CustomerAddresses customerId='b' />);
    await screen.findByText("Recipient");
    await act(async () => pending.resolve(response([{ ...address, name: "Old recipient" }])));
    expect(screen.queryByText("Old recipient")).toBeNull();
  });
});
