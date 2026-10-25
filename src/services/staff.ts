import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export interface InvitationRowInput {
  clientRowId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roleId: string;
}

export interface AssignableRoleView {
  id: string;
  code: string;
  name: string;
}

export interface InvitationView {
  id: string;
  clientRowId: string;
  email: string;
  role: AssignableRoleView;
  state: "pending" | "accepted" | "revoked";
  expiresAt: string;
  delivery: "pending" | "sending" | "sent" | "failed" | "unknown";
  revision: number;
  lastErrorCode: string | null;
}

export type InvitationBatchResultRow =
  | { clientRowId: string; outcome: "saved"; invitation: InvitationView }
  | { clientRowId: string; outcome: "conflict"; code: string; invitationId?: string };

export type InvitationBatchResult = { rows: InvitationBatchResultRow[] };

export interface StaffView {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: { id: string; code: string; name: string; revision: number } | null;
  lastLogin: string | null;
}

export type InvitationPreview =
  | { state: "unusable" | "expired" | "already_accepted" }
  | {
      state: "pending";
      email: string;
      roleName: string;
      expiresAt: string;
      passwordMode: "existing" | "set";
    };

export const previewInvitationAPI = (
  token: string,
  signal?: AbortSignal
): Promise<ApiResponse<InvitationPreview>> =>
  axiosRequest.post(
    "/staff/invitations/preview",
    { token },
    { skipAuth: true, toastError: false, signal }
  );

export const acceptInvitationAPI = (
  token: string,
  password: string
): Promise<ApiResponse<{ state: "accepted" | "already_accepted" }>> =>
  axiosRequest.post(
    "/staff/invitations/accept",
    { token, password },
    { skipAuth: true, toastError: false }
  );

const inlineErrors = { toastError: false };
// Gửi mail có thể lâu (SMTP chậm) — 60s/hàng theo kế hoạch; timeout chỉ là "không rõ kết quả"
const SEND_TIMEOUT_MS = 60_000;
const invitationPath = (id: string, action: string) =>
  `/staff/invitations/${encodeURIComponent(id)}/${action}`;
const staffPath = (id: string) => `/staff/${encodeURIComponent(id)}`;

export const listStaffAPI = (signal?: AbortSignal): Promise<ApiResponse<StaffView[]>> =>
  axiosRequest.get("/staff", { ...inlineErrors, signal });
export const listAssignableRolesAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<AssignableRoleView[]>> =>
  axiosRequest.get("/staff/assignable-roles", { ...inlineErrors, signal });
export const listInvitationsAPI = (signal?: AbortSignal): Promise<ApiResponse<InvitationView[]>> =>
  axiosRequest.get("/staff/invitations", { ...inlineErrors, signal });
export const bulkInviteAPI = (
  rows: InvitationRowInput[]
): Promise<ApiResponse<InvitationBatchResult>> =>
  axiosRequest.post("/staff/invitations/bulk", { rows }, inlineErrors);
export const sendInvitationAPI = (
  id: string,
  expectedRevision: number
): Promise<ApiResponse<InvitationView>> =>
  axiosRequest.post(
    invitationPath(id, "send"),
    { expectedRevision },
    {
      ...inlineErrors,
      timeout: SEND_TIMEOUT_MS
    }
  );
export const resendInvitationAPI = (
  id: string,
  expectedRevision: number
): Promise<ApiResponse<InvitationView>> =>
  axiosRequest.post(
    invitationPath(id, "resend"),
    { expectedRevision },
    {
      ...inlineErrors,
      timeout: SEND_TIMEOUT_MS
    }
  );
export const revokeInvitationAPI = (
  id: string,
  expectedRevision: number
): Promise<ApiResponse<InvitationView>> =>
  axiosRequest.post(invitationPath(id, "revoke"), { expectedRevision }, inlineErrors);
export const assignStaffRoleAPI = (
  id: string,
  roleId: string,
  expectedRoleId: string
): Promise<ApiResponse<StaffView>> =>
  axiosRequest.put(`${staffPath(id)}/role`, { roleId, expectedRoleId }, inlineErrors);
// Backend đọc expectedRoleId từ JSON body của DELETE (không dùng query param)
export const revokeStaffAccessAPI = (
  id: string,
  expectedRoleId: string
): Promise<ApiResponse<{ revoked: true }>> =>
  axiosRequest.delete(`${staffPath(id)}/access`, { ...inlineErrors, data: { expectedRoleId } });
