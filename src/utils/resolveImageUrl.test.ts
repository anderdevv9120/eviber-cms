import { describe, expect, it, vi } from "vitest";

vi.mock("@/constants/env", () => ({ ADMIN_API_URL: "http://api.test:8001/admin/v1" }));
const { resolveImageUrl } = await import("./resolveImageUrl");

describe("resolveImageUrl", () => {
  it("prefixes uploaded paths with the admin API origin", () => {
    expect(resolveImageUrl("/images/a.jpg")).toBe("http://api.test:8001/images/a.jpg");
  });
  it("leaves absolute URLs untouched", () => {
    expect(resolveImageUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });
});
