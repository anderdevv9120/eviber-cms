import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { attribute, value, list, response } from "@/test/attribute-fixtures";
import * as api from "./attributes";

vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));
import { errorNotification } from "@/utils/notification";

describe("attribute transport through the real shared client", () => {
  it("loads projected options and retains selected attributes with the backend comma selector", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    const options = [
      { _id: "a", code: "size", name: "Kích thước", values: [{ _id: "v", value: "M" }] }
    ];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, options);
    };
    const signal = new AbortController().signal;
    expect(await api.listAttributeOptionsAPI(["a", "b"], signal)).toEqual({
      data: options,
      message: "success"
    });
    await api.listAttributeOptionsAPI([], signal);
    expect(calls.map(c => [c.method, c.url, c.params, c.signal, c.toastError])).toEqual([
      ["get", "/attributes/options", { attributeIds: "a,b" }, signal, false],
      ["get", "/attributes/options", undefined, signal, false]
    ]);
  });
  it("keeps exactly one envelope, list query and cancellation signals", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(
        config,
        config.url === "/attributes"
          ? list()
          : config.url?.endsWith("/values")
            ? { attribute, values: [value], revision: 4 }
            : attribute
      );
    };
    const signal = new AbortController().signal;
    expect(await api.listAttributesAPI({ page: 2, pageSize: 20, search: "size" }, signal)).toEqual({
      data: list(),
      message: "success"
    });
    expect(await api.getAttributeAPI("size-id", signal)).toEqual({
      data: attribute,
      message: "success"
    });
    expect(await api.getAttributeValuesAPI("size-id", signal)).toEqual({
      data: { attribute, values: [value], revision: 4 },
      message: "success"
    });
    expect(calls.map(c => [c.method, c.url, c.params, c.signal, c.toastError])).toEqual([
      ["get", "/attributes", { page: 2, pageSize: 20, search: "size" }, signal, false],
      ["get", "/attributes/size-id", undefined, signal, false],
      ["get", "/attributes/size-id/values", undefined, signal, false]
    ]);
  });

  it("uses every admin mutation path/body and delete query revision without another unwrap", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { _id: "saved" });
    };
    const results = [
      await api.createAttributeAPI({ code: "size", name: "Size" }),
      await api.updateAttributeAPI("a", { name: "Size 2", expectedRevision: 4 }),
      await api.deleteAttributeAPI("a", 5),
      await api.createAttributeValueAPI("a", { value: "S", expectedRevision: 6 }),
      await api.updateAttributeValueAPI("a", "v", {
        value: "Small",
        meta: null,
        expectedRevision: 7
      }),
      await api.deleteAttributeValueAPI("a", "v", 8),
      await api.saveAttributeOrderAPI("a", { valueIds: ["v", "w"], expectedRevision: 9 })
    ];
    expect(results).toEqual(
      Array.from({ length: 7 }, () => ({ data: { _id: "saved" }, message: "success" }))
    );
    expect(
      calls.map(c => [
        c.method,
        c.url,
        c.data ? JSON.parse(c.data) : undefined,
        c.params,
        c.toastError
      ])
    ).toEqual([
      ["post", "/attributes", { code: "size", name: "Size" }, undefined, false],
      ["patch", "/attributes/a", { name: "Size 2", expectedRevision: 4 }, undefined, false],
      ["delete", "/attributes/a", undefined, { expectedRevision: 5 }, false],
      ["post", "/attributes/a/values", { value: "S", expectedRevision: 6 }, undefined, false],
      [
        "patch",
        "/attributes/a/values/v",
        { value: "Small", meta: null, expectedRevision: 7 },
        undefined,
        false
      ],
      ["delete", "/attributes/a/values/v", undefined, { expectedRevision: 8 }, false],
      [
        "put",
        "/attributes/a/values/order",
        { valueIds: ["v", "w"], expectedRevision: 9 },
        undefined,
        false
      ]
    ]);
  });

  it("rejects inline API errors without a global notification", async () => {
    axiosRequest.defaults.adapter = config =>
      Promise.reject(
        new AxiosError("conflict", "409", config, null, {
          config,
          data: {
            message: "Dictionary changed",
            errors: { productUsageCount: 2, variantUsageCount: 3 }
          },
          status: 409,
          statusText: "Conflict",
          headers: {}
        })
      );
    await expect(api.deleteAttributeAPI("a", 4)).rejects.toEqual(
      new ApiError("Dictionary changed", 409, { productUsageCount: 2, variantUsageCount: 3 })
    );
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
