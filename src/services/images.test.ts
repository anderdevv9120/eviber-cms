import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { uploadImageAPI } from "./images";

describe("image upload transport", () => {
  it("posts multipart with inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, { path: "/images/a.jpg" });
    };
    expect(await uploadImageAPI(new File(["x"], "a.png", { type: "image/png" }))).toEqual({
      data: { path: "/images/a.jpg" },
      message: "success"
    });
    expect(calls.map(c => [c.method, c.url, c.toastError])).toEqual([
      ["post", "/images/upload", false]
    ]);
    expect(calls[0].data).toBeInstanceOf(FormData);
    expect((calls[0].data as FormData).get("image")).toBeInstanceOf(File);
  });
});
