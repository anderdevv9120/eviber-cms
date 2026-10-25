import axiosRequest from "@/utils/request";
import type { PermissionCode } from "@/constants/permissions";
import type { ApiResponse } from "./auth";

export interface RoleView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scope: "CMS" | "STOREFRONT";
  permissionIds: string[];
  revision: number;
  assignedStaffCount: number;
}

export interface PermissionCatalogEntry {
  id: string;
  code: PermissionCode;
  label: string;
  group: string;
  description: string;
  requires: PermissionCode[];
}

export interface RoleListQuery {
  page: number;
  pageSize: number;
  search?: string;
}
export interface RoleListResult {
  data: RoleView[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}
export interface PermissionCatalogResult extends Omit<RoleListResult, "data"> {
  data: PermissionCatalogEntry[];
}
export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
  permissionIds: string[];
}
export interface UpdateRoleInput extends Omit<CreateRoleInput, "code"> {
  expectedRevision: number;
}

const inlineErrors = { toastError: false };
const rolePath = (id: string) => `/roles/${encodeURIComponent(id)}`;
export const listRolesAPI = (
  query: RoleListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<RoleListResult>> =>
  axiosRequest.get("/roles", { ...inlineErrors, params: query, signal });
export const listPermissionsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<PermissionCatalogResult>> =>
  axiosRequest.get("/permissions", { ...inlineErrors, params: { page: 1, pageSize: 100 }, signal });
export const getRoleAPI = (id: string, signal?: AbortSignal): Promise<ApiResponse<RoleView>> =>
  axiosRequest.get(rolePath(id), { ...inlineErrors, signal });
export const createRoleAPI = (input: CreateRoleInput): Promise<ApiResponse<RoleView>> =>
  axiosRequest.post("/roles", input, inlineErrors);
export const updateRoleAPI = (id: string, input: UpdateRoleInput): Promise<ApiResponse<RoleView>> =>
  axiosRequest.put(rolePath(id), input, inlineErrors);
export const deleteRoleAPI = (
  id: string,
  expectedRevision: number
): Promise<ApiResponse<boolean>> =>
  axiosRequest.delete(rolePath(id), { ...inlineErrors, params: { expectedRevision } });
