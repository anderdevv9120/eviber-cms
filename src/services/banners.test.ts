import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./banners";

describe("banner transport", () => {
  it("uses admin banner paths and inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, []);
    };
    const input: api.BannerInput = { image: "/images/a.jpg", title: "T", isActive: true };
    await api.listBannersAPI();
    await api.createBannerAPI(input);
    await api.updateBannerAPI("id/1", { isActive: false });
    await api.deleteBannerAPI("id/1");
    await api.reorderBannersAPI(["b", "a"]);
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["get", "/banners", false],
      ["post", "/banners", false],
      ["patch", "/banners/id%2F1", false],
      ["delete", "/banners/id%2F1", false],
      ["put", "/banners/order", false]
    ]);
    expect(JSON.parse(calls[4].data)).toEqual({ bannerIds: ["b", "a"] });
  });
});
