import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./banners";

describe("banner transport", () => {
  it("uses admin banner paths, inline errors and multipart upload", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, config.url === "/images/upload" ? { path: "/images/a.jpg" } : []);
    };
    const input: api.BannerInput = { image: "/images/a.jpg", title: "T", isActive: true };
    await api.listBannersAPI();
    await api.createBannerAPI(input);
    await api.updateBannerAPI("id/1", { isActive: false });
    await api.deleteBannerAPI("id/1");
    await api.reorderBannersAPI(["b", "a"]);
    expect(await api.uploadImageAPI(new File(["x"], "a.png", { type: "image/png" }))).toEqual({
      data: { path: "/images/a.jpg" },
      message: "success"
    });
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["get", "/banners", false],
      ["post", "/banners", false],
      ["patch", "/banners/id%2F1", false],
      ["delete", "/banners/id%2F1", false],
      ["put", "/banners/order", false],
      ["post", "/images/upload", false]
    ]);
    expect(JSON.parse(calls[4].data)).toEqual({ bannerIds: ["b", "a"] });
    expect(calls[5].data).toBeInstanceOf(FormData);
    expect((calls[5].data as FormData).get("image")).toBeInstanceOf(File);
  });
});
