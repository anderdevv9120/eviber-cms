import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { errorNotification } from "@/utils/notification";
import * as api from "./combos";
vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));

const input: api.ComboWriteInput = {
  name: "Áo thun",
  images: ["/images/a.jpg"],
  categoryIds: ["c1"],
  items: [
    { productId: "p1", quantity: 1, mode: "CHOOSE" },
    { productId: "p2", quantity: 2, mode: "LOCKED", variantId: "v2" }
  ],
  pricing: { mode: "PERCENT", value: 15 }
};

describe("combo backend transport", () => {
  it("uses admin paths, whitelisted list filters, abort signals and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, {});
    };
    const signal = new AbortController().signal;
    const query = {
      search: "áo",
      status: "PUBLISH" as const,
      attention: "true" as const,
      page: 2,
      pageSize: 20,
      unknown: "secret"
    };
    expect(await api.listCombosAPI(query, signal)).toEqual({ data: {}, message: "success" });
    await api.getComboAPI("id/1");
    await api.listComboProductOptionsAPI(
      { search: "giày", page: 3, pageSize: 10, unknown: "secret" } as api.ComboProductOptionsQuery,
      signal
    );
    await api.listAffectedCombosAPI("p/1");
    expect(calls.map(c => [c.method, c.url, c.params, c.signal, c.toastError])).toEqual([
      [
        "get",
        "/combos",
        { search: "áo", status: "PUBLISH", attention: "true", page: 2, pageSize: 20 },
        signal,
        false
      ],
      ["get", "/combos/id%2F1", undefined, undefined, false],
      ["get", "/combos/product-options", { search: "giày", page: 3, pageSize: 10 }, signal, false],
      ["get", "/combos/affected", { productId: "p/1" }, undefined, false]
    ]);

    await api.createComboAPI(input);
    await api.updateComboAPI("id/1", { ...input, expectedRevision: 3 });
    await api.changeComboStatusAPI("id/1", { status: "PUBLISH", expectedRevision: 4 });
    expect(calls.slice(4).map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      ["post", "/combos", input, false],
      ["put", "/combos/id%2F1", { ...input, expectedRevision: 3 }, false],
      ["patch", "/combos/id%2F1/status", { status: "PUBLISH", expectedRevision: 4 }, false]
    ]);
  });

  it("keeps write and status errors inline without global notifications", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("bad", "400", config, null, {
        config,
        status: 400,
        statusText: "Bad Request",
        headers: {},
        data: { message: "Combo invalid", errors: { code: "combo00007", index: 0 } }
      });
    };
    await expect(api.createComboAPI(input)).rejects.toMatchObject({ status: 400 });
    await expect(
      api.changeComboStatusAPI("id", { status: "PUBLISH", expectedRevision: 0 })
    ).rejects.toBeInstanceOf(ApiError);
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
