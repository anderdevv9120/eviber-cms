import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AxiosError } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/order-fixtures";
import { staffProfile } from "@/test/access-fixtures";
import { useAppStore } from "@/store/useAppStore";
import CustomerAddresses from "./CustomerAddresses";
import RegisteredCustomerDetail from "./RegisteredCustomerDetail";

const base = "/customers/registered/customer-id";
const address = {
  _id: "address-id",
  name: "Recipient",
  city: "City",
  ward: "Ward",
  specificAddress: "Street",
  phoneNumber: "0901234567",
  primary: true
};
const customer = {
  _id: "customer-id",
  email: "customer@example.test",
  status: "VERIFIED",
  accountType: "DEFAULT",
  firstName: "Original",
  addresses: [address]
};

beforeEach(() =>
  useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ", "CUSTOMER_UPDATE"]))
);

describe("RBAC review customer backend denial", () => {
  it.each(["address", "profile"])(
    "keeps the %s draft through HTTP 403 and read-only profile refresh",
    async kind => {
      const calls: string[] = [];
      axiosRequest.defaults.adapter = async config => {
        calls.push(`${config.method} ${config.url}`);
        if (config.url === "/auth/profile")
          return response(config, staffProfile(["CUSTOMER_READ"]));
        if (config.method !== "get")
          throw new AxiosError("Access denied", "ERR_BAD_REQUEST", config, null, {
            config,
            data: { message: "Write denied", errors: { code: "CMS_ACCESS_DENIED" } },
            status: 403,
            statusText: "Forbidden",
            headers: {}
          });
        if (config.url === `${base}/addresses`) return response(config, [address]);
        if (config.url === `${base}/orders`)
          return response(config, { data: [], page: 1, pageSize: 10, total: 0, totalPage: 0 });
        if (config.url === base) return response(config, customer);
        throw new Error(`Unexpected read ${config.url}`);
      };
      const element =
        kind === "address" ? (
          <CustomerAddresses customerId='customer-id' />
        ) : (
          <RegisteredCustomerDetail />
        );
      const router = createMemoryRouter([{ path: "/customers/registered/:customerId", element }], {
        initialEntries: [base]
      });
      render(<RouterProvider router={router} />);
      fireEvent.click(
        await screen.findByRole("button", {
          name: kind === "address" ? "Sửa địa chỉ" : "Sửa hồ sơ"
        })
      );
      const field = screen.getByLabelText(
        kind === "address" ? "Địa chỉ cụ thể" : "Tên"
      ) as HTMLInputElement;
      fireEvent.change(field, { target: { value: "Unsaved draft" } });
      const name = kind === "address" ? "Lưu địa chỉ" : "Lưu hồ sơ";
      const submitButton = screen.getByRole("button", { name }) as HTMLButtonElement;
      fireEvent.click(submitButton);
      await screen.findByText("Write denied");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(field.isConnected).toBe(true);
      expect(field.value).toBe("Unsaved draft");
      expect(field.disabled).toBe(true);
      expect(submitButton.isConnected).toBe(true);
      expect(submitButton.disabled).toBe(true);
      expect(useAppStore.getState().profile?.access.permissions).toEqual(["CUSTOMER_READ"]);
      expect(calls.filter(call => call === "get /auth/profile")).toHaveLength(1);
      expect(calls.filter(call => call === `get ${base}`)).toHaveLength(kind === "profile" ? 1 : 0);
      expect(calls.filter(call => call === `get ${base}/addresses`)).toHaveLength(1);
      const cancel = screen.getByRole("button", { name: "Hủy" }) as HTMLButtonElement;
      expect(cancel.disabled).toBe(false);
      await act(async () =>
        useAppStore.getState().setProfile(staffProfile(["CUSTOMER_READ", "CUSTOMER_UPDATE"]))
      );
      expect(field.disabled).toBe(false);
      expect(field.value).toBe("Unsaved draft");
      fireEvent.click(cancel);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  );
});
