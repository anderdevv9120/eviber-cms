import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { errorNotification } from "@/utils/notification";
import * as api from "./products";
vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));

const input: api.ProductWriteInput = {
  name: "Áo thun",
  refundEnabled: false,
  images: ["/images/a.jpg"],
  categoryIds: ["c1"],
  options: [{ attributeId: "a1", optionValues: ["v1"] }],
  variants: [
    {
      sku: "AO-THUN-DO",
      price: 100,
      originalPrice: 120,
      status: "ACTIVE",
      attributeValues: ["v1"],
      inventoryCount: 5
    }
  ]
};

describe("product backend transport", () => {
  it("uses admin paths, whitelisted list filters, abort signals and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, {});
    };
    const signal = new AbortController().signal;
    const query = {
      q: "áo",
      status: "PUBLISH" as const,
      categoryId: "c1",
      page: 2,
      pageSize: 20,
      unknown: "secret"
    };
    expect(await api.listProductsAPI(query, signal)).toEqual({ data: {}, message: "success" });
    await api.getProductAPI("id/1", signal);
    expect(calls.map(c => [c.method, c.url, c.params, c.signal, c.toastError])).toEqual([
      [
        "get",
        "/products",
        { q: "áo", status: "PUBLISH", categoryId: "c1", page: 2, pageSize: 20 },
        signal,
        false
      ],
      ["get", "/products/id%2F1", undefined, signal, false]
    ]);

    await api.createProductAPI(input);
    await api.updateProductAPI("id/1", { ...input, expectedRevision: 3 });
    await api.changeProductStatusAPI("id/1", { status: "PUBLISH", expectedRevision: 4 });
    expect(calls.slice(2).map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      ["post", "/products", input, false],
      ["put", "/products/id%2F1", { ...input, expectedRevision: 3 }, false],
      ["patch", "/products/id%2F1/status", { status: "PUBLISH", expectedRevision: 4 }, false]
    ]);
  });

  it("keeps write and status errors inline without global notifications", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("bad", "400", config, null, {
        config,
        status: 400,
        statusText: "Bad Request",
        headers: {},
        data: { message: "SKU taken", errors: { code: "product00007", sku: "AO-1" } }
      });
    };
    await expect(api.createProductAPI(input)).rejects.toMatchObject({ status: 400 });
    await expect(
      api.changeProductStatusAPI("id", { status: "PUBLISH", expectedRevision: 0 })
    ).rejects.toBeInstanceOf(ApiError);
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
