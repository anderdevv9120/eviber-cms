import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";
import type { AdminOrderSummary } from "./orders";

export type CustomerStatus = "VERIFIED" | "UNVERIFIED" | "DELETED";
export type CustomerGender = "MALE" | "FEMALE" | "OTHER";
export interface RegisteredCustomerSummary {
  _id: string;
  email: string;
  status: CustomerStatus;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: CustomerGender;
  imgUrl?: string;
  accountType?: "DEFAULT" | "GOOGLE";
  lastLogin?: string;
  created_at?: string;
  updated_at?: string;
}
export interface CustomerAddressInput {
  name: string;
  country?: string;
  city: string;
  district?: string;
  ward: string;
  specificAddress: string;
  phoneNumber: string;
  zip?: string;
  primary?: boolean;
}
export type CustomerAddress = CustomerAddressInput & { _id: string };
export type RegisteredCustomerDetail = RegisteredCustomerSummary & { addresses: CustomerAddress[] };
export interface GuestBuyerSummary {
  email: string;
  orderCount: number;
  name?: string;
  phoneNumber?: string;
  latestOrderAt?: string;
}
export type GuestBuyerDetail = GuestBuyerSummary & {
  shippingInfo?: Partial<AdminOrderSummary["shippingInfo"]>;
};
export type CustomerOrderRow = Omit<AdminOrderSummary, "sessionId">;
export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: CustomerGender;
  imgUrl?: string;
}
export interface CreateCustomerInput extends UpdateCustomerInput {
  email: string;
  password: string;
}
export interface CustomerListQuery {
  tab: "registered" | "guests";
  page: number;
  pageSize: number;
  search?: string;
  status?: CustomerStatus;
}
export interface CustomerListResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

const customerPath = (id: string) => `/customers/registered/${encodeURIComponent(id)}`;
const inlineErrors = { toastError: false };
const profileInput = ({
  firstName,
  lastName,
  phone,
  gender,
  imgUrl
}: UpdateCustomerInput): UpdateCustomerInput => ({ firstName, lastName, phone, gender, imgUrl });

export const listCustomersAPI = (
  { page, pageSize, search, status }: CustomerListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<CustomerListResult<RegisteredCustomerSummary>>> =>
  axiosRequest.get("/customers", {
    ...inlineErrors,
    params: { page, pageSize, search, status },
    signal
  });
export const listGuestBuyersAPI = (
  { page, pageSize, search }: CustomerListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<CustomerListResult<GuestBuyerSummary>>> =>
  axiosRequest.get("/customers/guests", {
    ...inlineErrors,
    params: { page, pageSize, search },
    signal
  });
export const getCustomerAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<RegisteredCustomerDetail>> =>
  axiosRequest.get(customerPath(id), { ...inlineErrors, signal });
export const createCustomerAPI = (
  input: CreateCustomerInput
): Promise<ApiResponse<RegisteredCustomerDetail>> =>
  axiosRequest.post(
    "/customers",
    { email: input.email, password: input.password, ...profileInput(input) },
    inlineErrors
  );
export const updateCustomerAPI = (
  id: string,
  input: UpdateCustomerInput
): Promise<ApiResponse<RegisteredCustomerDetail>> =>
  axiosRequest.patch(customerPath(id), profileInput(input), inlineErrors);
export const getGuestBuyerAPI = (
  email: string,
  signal?: AbortSignal
): Promise<ApiResponse<GuestBuyerDetail>> =>
  axiosRequest.get("/customers/guests/detail", { ...inlineErrors, params: { email }, signal });
