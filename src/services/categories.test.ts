import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./categories";

describe("category transport", () => {
  it("uses admin category paths, encoded ids, request bodies and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, []);
    };
    const signal = new AbortController().signal;
    const input: api.CategoryInput = { name: "Áo nam", slug: null, imageUrl: "/images/a.jpg" };
    expect(await api.listCategoriesAPI(signal)).toEqual({ data: [], message: "success" });
    await api.createCategoryAPI(input);
    await api.updateCategoryAPI("id/1", { ...input, description: "Mô tả", revision: 2 });
    await api.deleteCategoryAPI("id/1");
    await api.reorderCategoriesAPI(["b", "a"]);
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["get", "/categories", false],
      ["post", "/categories", false],
      ["put", "/categories/id%2F1", false],
      ["delete", "/categories/id%2F1", false],
      ["put", "/categories/order", false]
    ]);
    expect(calls[0].signal).toBe(signal);
    expect(JSON.parse(calls[1].data)).toEqual(input);
    expect(JSON.parse(calls[2].data)).toEqual({ ...input, description: "Mô tả", revision: 2 });
    expect(JSON.parse(calls[4].data)).toEqual({ categoryIds: ["b", "a"] });
  });
});
