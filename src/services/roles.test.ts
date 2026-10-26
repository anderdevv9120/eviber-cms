import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import {
  adminRole,
  catalogList,
  productReadId,
  productUpdateId,
  roleList
} from "@/test/role-fixtures";
import * as api from "./roles";

describe("role transport", () => {
  it("uses catalog/role envelopes, encoded IDs, revisions and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(
        config,
        config.url === "/permissions"
          ? catalogList
          : config.url === "/roles" && config.method === "get"
            ? roleList()
            : config.method === "delete"
              ? true
              : adminRole
      );
    };
    const signal = new AbortController().signal;
    expect((await api.listRolesAPI({ page: 2, pageSize: 10 }, signal)).data).toEqual(roleList());
    expect((await api.listPermissionsAPI(signal)).data).toEqual(catalogList);
    expect((await api.getRoleAPI("id/1", signal)).data).toEqual(adminRole);
    const input = {
      code: "EDITOR",
      name: "Biên tập viên",
      description: "Sản phẩm",
      permissionIds: [productReadId, productUpdateId]
    };
    expect((await api.createRoleAPI(input)).data).toEqual(adminRole);
    const update = {
      name: input.name,
      description: input.description,
      permissionIds: input.permissionIds,
      expectedRevision: 3
    };
    await api.updateRoleAPI("id/1", update);
    expect((await api.deleteRoleAPI("id/1", 3)).data).toBe(true);
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["get", "/roles", false],
      ["get", "/permissions", false],
      ["get", "/roles/id%2F1", false],
      ["post", "/roles", false],
      ["put", "/roles/id%2F1", false],
      ["delete", "/roles/id%2F1", false]
    ]);
    expect(calls[0].params).toEqual({ page: 2, pageSize: 10 });
    expect(calls[1].params).toEqual({ page: 1, pageSize: 100 });
    expect(calls.slice(0, 3).every(c => c.signal === signal)).toBe(true);
    expect(JSON.parse(calls[3].data)).toEqual(input);
    expect(JSON.parse(calls[4].data)).toEqual(update);
    expect(calls[5].params).toEqual({ expectedRevision: 3 });
  });
});
