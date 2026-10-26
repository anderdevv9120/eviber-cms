import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./staff";

const invitation = (over: Partial<api.InvitationView> = {}): api.InvitationView => ({
  id: "inv-1",
  clientRowId: "row-1",
  email: "an@example.test",
  role: { id: "admin-role", code: "ADMIN", name: "Nhân viên" },
  state: "pending",
  expiresAt: "2026-10-27T00:00:00.000Z",
  delivery: "pending",
  revision: 0,
  lastErrorCode: null,
  ...over
});

describe("staff transport", () => {
  it("uses exact staff routes, JSON bodies, encoded IDs and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, config.method === "get" ? [] : invitation());
    };
    const signal = new AbortController().signal;
    await api.listStaffAPI(signal);
    await api.listAssignableRolesAPI(signal);
    await api.listInvitationsAPI(signal);
    const rows: api.InvitationRowInput[] = [
      {
        clientRowId: "row-1",
        email: "an@example.test",
        firstName: "An",
        lastName: "Nguyễn",
        roleId: "admin-role"
      }
    ];
    await api.bulkInviteAPI(rows);
    await api.sendInvitationAPI("id/1", 2);
    await api.resendInvitationAPI("id/1", 3);
    await api.revokeInvitationAPI("id/1", 4);
    await api.assignStaffRoleAPI("id/1", "new-role", "old-role");
    await api.revokeStaffAccessAPI("id/1", "old-role");
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["get", "/staff", false],
      ["get", "/staff/assignable-roles", false],
      ["get", "/staff/invitations", false],
      ["post", "/staff/invitations/bulk", false],
      ["post", "/staff/invitations/id%2F1/send", false],
      ["post", "/staff/invitations/id%2F1/resend", false],
      ["post", "/staff/invitations/id%2F1/revoke", false],
      ["put", "/staff/id%2F1/role", false],
      ["delete", "/staff/id%2F1/access", false]
    ]);
    expect(calls.slice(0, 3).every(c => c.signal === signal)).toBe(true);
    expect(JSON.parse(calls[3].data)).toEqual({ rows });
    expect(JSON.parse(calls[4].data)).toEqual({ expectedRevision: 2 });
    expect(JSON.parse(calls[5].data)).toEqual({ expectedRevision: 3 });
    expect(JSON.parse(calls[6].data)).toEqual({ expectedRevision: 4 });
    expect(JSON.parse(calls[7].data)).toEqual({ roleId: "new-role", expectedRoleId: "old-role" });
    expect(JSON.parse(calls[8].data)).toEqual({ expectedRoleId: "old-role" });
  });

  it("waits up to 60 seconds per invitation send and keeps queries parameter-free", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, invitation());
    };
    await api.sendInvitationAPI("inv-1", 0);
    await api.resendInvitationAPI("inv-1", 1);
    await api.revokeInvitationAPI("inv-1", 2);
    await api.listInvitationsAPI();
    expect(calls.map(c => c.timeout)).toEqual([60_000, 60_000, 15_000, 15_000]);
    expect(calls.map(c => c.params)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("posts invitation secrets only in public request bodies without admin credentials", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { state: "already_accepted" });
    };
    const signal = new AbortController().signal;
    await api.previewInvitationAPI("secret-token", signal);
    await api.acceptInvitationAPI("secret-token", "Current password");
    expect(calls.map(c => [c.method, c.url, c.toastError, c.skipAuth])).toEqual([
      ["post", "/staff/invitations/preview", false, true],
      ["post", "/staff/invitations/accept", false, true]
    ]);
    expect(calls.map(c => JSON.parse(c.data))).toEqual([
      { token: "secret-token" },
      { token: "secret-token", password: "Current password" }
    ]);
    expect(calls[0].signal).toBe(signal);
    expect(calls.every(c => !c.headers.Authorization && c.params === undefined)).toBe(true);
  });
});
