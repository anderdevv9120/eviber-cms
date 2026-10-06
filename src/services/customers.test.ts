import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./customers";
import { errorNotification } from "@/utils/notification";

vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));

describe("customer transport", () => {
  it("preserves one envelope, whitelists list filters and encodes IDs/emails", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    const payload = { data: [], page: 1, pageSize: 10, total: 0, totalPage: 0 };
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, payload);
    };
    const signal = new AbortController().signal;
    const query: api.CustomerListQuery = {
      tab: "registered",
      page: 1,
      pageSize: 10,
      search: "a+b",
      status: "VERIFIED"
    };
    expect(await api.listCustomersAPI(query, signal)).toEqual({
      data: payload,
      message: "success"
    });
    await api.listGuestBuyersAPI(query, signal);
    await api.getCustomerAPI("id/with?chars", signal);
    const email = "a+b&c@example.test";
    await api.getGuestBuyerAPI(email, signal);
    expect(calls.map(c => [c.url, c.params, c.signal, c.toastError])).toEqual([
      ["/customers", { page: 1, pageSize: 10, search: "a+b", status: "VERIFIED" }, signal, false],
      ["/customers/guests", { page: 1, pageSize: 10, search: "a+b" }, signal, false],
      ["/customers/registered/id%2Fwith%3Fchars", undefined, signal, false],
      ["/customers/guests/detail", { email }, signal, false]
    ]);
    expect(new URLSearchParams(calls[3].params).get("email")).toBe(email);
    expect(axiosRequest.getUri(calls[3])).toContain("email=a%2Bb%26c%40example.test");
  });
  it("sends only allowed create/profile fields", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { _id: "saved" });
    };
    const input = {
      email: "customer@example.test",
      password: "Example1!",
      firstName: "An",
      status: "VERIFIED",
      roleIds: ["admin"],
      accountType: "GOOGLE"
    };
    await api.createCustomerAPI(input);
    await api.updateCustomerAPI("id/1", input);
    expect(calls.map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      [
        "post",
        "/customers",
        { email: input.email, password: input.password, firstName: "An" },
        false
      ],
      ["patch", "/customers/registered/id%2F1", { firstName: "An" }, false]
    ]);
  });
  it("keeps read/create errors inline", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("unavailable", "503", config, null, {
        config,
        status: 503,
        statusText: "Unavailable",
        headers: {},
        data: { message: "Unavailable" }
      });
    };
    await expect(
      api.listCustomersAPI({ tab: "registered", page: 1, pageSize: 10 })
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      api.createCustomerAPI({ email: "a@example.test", password: "Example1!" })
    ).rejects.toMatchObject({ status: 503 });
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
