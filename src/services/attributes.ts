import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export interface UsageCounts {
  productUsageCount: number;
  variantUsageCount: number;
}
export interface AttributeOption {
  _id: string;
  code: string;
  name: string;
  values: { _id: string; value: string }[];
}
export interface AttributeSummary extends UsageCounts {
  _id: string;
  code: string;
  name: string;
  revision: number;
  valueCount: number;
  created_at: string;
  updated_at: string;
}
export interface AttributeValueSummary extends UsageCounts {
  _id: string;
  attributeId: string;
  value: string;
  meta: string | null;
  sortOrder: number;
  created_at: string;
  updated_at: string;
}
export interface AttributeListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}
export interface AttributeListResult {
  data: AttributeSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}
export interface AttributeValuesResult {
  attribute: AttributeSummary;
  values: AttributeValueSummary[];
  revision: number;
}
export interface CreateAttributeInput {
  code: string;
  name: string;
}
export interface UpdateAttributeInput {
  name: string;
  expectedRevision: number;
}
export interface CreateAttributeValueInput {
  value: string;
  meta?: string | null;
  expectedRevision: number;
}
export type UpdateAttributeValueInput = CreateAttributeValueInput;
export interface ReorderAttributeValuesInput {
  valueIds: string[];
  expectedRevision: number;
}
export interface AttributeValueMutationResult {
  value: AttributeValueSummary;
  revision: number;
}
export interface AttributeValueDeleteResult {
  _id: string;
  revision: number;
}
export interface AttributeDeleteResult {
  _id: string;
  removedValueCount: number;
}
export interface AttributeOrderResult {
  values: AttributeValueSummary[];
  revision: number;
}

const attributePath = (id: string) => `/attributes/${encodeURIComponent(id)}`;
const valuePath = (id: string, valueId: string) =>
  `${attributePath(id)}/values/${encodeURIComponent(valueId)}`;
const inlineErrors = { toastError: false };

export const listAttributeOptionsAPI = (
  attributeIds: string[],
  signal?: AbortSignal
): Promise<ApiResponse<AttributeOption[]>> =>
  axiosRequest.get("/attributes/options", {
    ...inlineErrors,
    params: attributeIds.length ? { attributeIds: attributeIds.join(",") } : undefined,
    signal
  });

export const listAttributesAPI = (
  query: AttributeListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<AttributeListResult>> =>
  axiosRequest.get("/attributes", { ...inlineErrors, params: query, signal });
export const getAttributeAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<AttributeSummary>> =>
  axiosRequest.get(attributePath(id), { ...inlineErrors, signal });
export const getAttributeValuesAPI = (
  id: string,
  signal?: AbortSignal
): Promise<ApiResponse<AttributeValuesResult>> =>
  axiosRequest.get(`${attributePath(id)}/values`, { ...inlineErrors, signal });
export const createAttributeAPI = (
  input: CreateAttributeInput
): Promise<ApiResponse<AttributeSummary>> => axiosRequest.post("/attributes", input, inlineErrors);
export const updateAttributeAPI = (
  id: string,
  input: UpdateAttributeInput
): Promise<ApiResponse<AttributeSummary>> =>
  axiosRequest.patch(attributePath(id), input, inlineErrors);
export const deleteAttributeAPI = (
  id: string,
  expectedRevision: number
): Promise<ApiResponse<AttributeDeleteResult>> =>
  axiosRequest.delete(attributePath(id), { ...inlineErrors, params: { expectedRevision } });
export const createAttributeValueAPI = (
  id: string,
  input: CreateAttributeValueInput
): Promise<ApiResponse<AttributeValueMutationResult>> =>
  axiosRequest.post(`${attributePath(id)}/values`, input, inlineErrors);
export const updateAttributeValueAPI = (
  id: string,
  valueId: string,
  input: UpdateAttributeValueInput
): Promise<ApiResponse<AttributeValueMutationResult>> =>
  axiosRequest.patch(valuePath(id, valueId), input, inlineErrors);
export const deleteAttributeValueAPI = (
  id: string,
  valueId: string,
  expectedRevision: number
): Promise<ApiResponse<AttributeValueDeleteResult>> =>
  axiosRequest.delete(valuePath(id, valueId), { ...inlineErrors, params: { expectedRevision } });
export const saveAttributeOrderAPI = (
  id: string,
  input: ReorderAttributeValuesInput
): Promise<ApiResponse<AttributeOrderResult>> =>
  axiosRequest.put(`${attributePath(id)}/values/order`, input, inlineErrors);
